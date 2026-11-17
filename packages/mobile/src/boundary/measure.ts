import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { compileTsrxModule, exportedFunctionFacts, NATIVE_FACT_COLLECTORS } from '@markless/compiler';
import { classifyExpression, classifyHandler, type FunctionLoader, type HandlerVerdict } from './classify.ts';

/** One handler or computed in the corpus with its verdict. */
export type Measured = {
	readonly app: string;
	readonly file: string;
	readonly kind: 'handler' | 'computed';
	readonly event?: string;
	readonly line?: number;
	readonly source?: string;
	readonly verdict: HandlerVerdict | null;
};

const SKIP = new Set(['node_modules', 'dist', '.output', '.markless', '.vercel', '.nitro']);

function tsrxFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	return readdirSync(root).flatMap((name) => {
		if (SKIP.has(name)) return [];
		const path = join(root, name);
		if (statSync(path).isDirectory()) return tsrxFiles(path);
		return name.endsWith('.tsrx') ? [path] : [];
	});
}

const EXTENSIONS_TRIED = ['', '.ts', '.tsrx', '.js', '/index.ts'];

/** Corpus apps from the workspace manifest's folders; headless families and their scenarios are counted apart. */
export function corpus(repo: string): ReadonlyArray<{ readonly app: string; readonly files: ReadonlyArray<string> }> {
	const apps: { app: string; files: string[] }[] = [];
	const website = tsrxFiles(join(repo, 'website'));
	const isFigure = (file: string) => relative(join(repo, 'website/components'), file).split('/')[0] === 'figures';
	apps.push({ app: 'website (docs figures)', files: website.filter(isFigure) });
	apps.push({ app: 'website (rest)', files: website.filter((file) => !isFigure(file)) });
	for (const demo of readdirSync(join(repo, 'demos')).sort()) {
		if (demo === 'interaction-benchmark') {
			for (const app of ['markless', 'markless-viewport'])
				apps.push({ app: `demos/interaction-benchmark/apps/${app}`, files: tsrxFiles(join(repo, 'demos/interaction-benchmark/apps', app)) });
			continue;
		}
		const files = tsrxFiles(join(repo, 'demos', demo));
		if (files.length > 0) apps.push({ app: `demos/${demo}`, files });
	}
	const headless = tsrxFiles(join(repo, 'packages/headless/components/src'));
	const isScenario = (file: string) => relative(join(repo, 'packages/headless/components/src'), file).split('/').includes('scenarios');
	apps.push({ app: 'headless families', files: headless.filter((file) => !isScenario(file)) });
	apps.push({ app: 'headless scenarios', files: headless.filter(isScenario) });
	return apps;
}

export function moduleLoader(): FunctionLoader {
	return (from, specifier, name, member) => {
		let file = from;
		if (specifier !== null) {
			const base = resolve(dirname(from), specifier);
			const found = EXTENSIONS_TRIED.map((suffix) => base + suffix).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
			if (!found) return undefined;
			file = found;
		}
		try {
			const facts = exportedFunctionFacts({ source: readFileSync(file, 'utf8'), filename: file }, name, member);
			return facts && { file, ...facts };
		} catch {
			return undefined;
		}
	};
}

const lineOf = (source: string, offset: number | undefined) =>
	offset === undefined ? undefined : source.slice(0, offset).split('\n').length;

export async function measure(repo: string): Promise<{ readonly items: ReadonlyArray<Measured>; readonly failures: ReadonlyArray<{ file: string; error: string }> }> {
	const load = moduleLoader();
	const items: Measured[] = [];
	const failures: { file: string; error: string }[] = [];
	for (const { app, files } of corpus(repo)) {
		for (const path of files) {
			const file = relative(repo, path);
			const source = readFileSync(path, 'utf8');
			let graph;
			try {
				graph = (await compileTsrxModule({ filename: path, source, symbols: [], nativeFacts: NATIVE_FACT_COLLECTORS })).semanticGraph;
			} catch (error) {
				failures.push({ file, error: String(error).split('\n')[0]!.slice(0, 200) });
				continue;
			}
			for (const event of graph.events) {
				if (!event.handlerSource) continue;
				items.push({
					app,
					file,
					kind: 'handler',
					event: event.eventName,
					line: lineOf(source, event.handlerSpan?.start),
					source: event.handlerSource.length > 400 ? `${event.handlerSource.slice(0, 400)}...` : event.handlerSource,
					verdict: classifyHandler(event, path, load) ?? null,
				});
			}
			for (const binding of graph.graphBindings) {
				if (binding.kind !== 'computed' || !binding.nativeExpression) continue;
				items.push({
					app,
					file,
					kind: 'computed',
					line: lineOf(source, binding.sourceSpan?.start),
					verdict: classifyExpression(binding.nativeExpression, path, load),
				});
			}
		}
	}
	return { items, failures };
}
