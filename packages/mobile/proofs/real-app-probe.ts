// Compiles every page of the real apps (this repo's website and demos, markless-migrate's ports and fixtures) for native
// and writes what builds and each refusal, as JSON:
// `node packages/mobile/proofs/real-app-probe.ts --migrate <markless-migrate checkout> --out <file.json>`.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildSemanticGraph, type CompilerDiagnostic } from '@markless/compiler';
import { buildRouteManifestFromFileIds } from '@markless/router';
import * as compile from '../src/compile.ts';
import { resolvePackageModule, servedFileReader, servedReader } from '../src/harness/rung.ts';

type Module = { readonly filename: string; readonly source: string };
type ReadModule = (specifier: string, importer: string) => Module | undefined;
type PageDiagnostic = CompilerDiagnostic & { readonly page: string };
type Refusal = {
	readonly code: string;
	readonly message: string;
	readonly file: string | null;
	readonly line: number | null;
};
type AppCompiler = (input: {
	readonly pages: ReadonlyArray<Module & { readonly page: string }>;
	readonly document?: Module;
	readonly readModule?: ReadModule;
	readonly readStylesheet?: (
		specifier: string,
		importer: string,
	) => { readonly file: string; readonly cssText: string } | undefined;
	readonly readServedStylesheet?: (href: string) => { readonly file: string; readonly cssText: string } | undefined;
	readonly readServedFile?: (href: string) => { readonly file: string; readonly bytes: Uint8Array } | undefined;
	readonly readAsset?: (specifier: string, importer: string) => { readonly file: string; readonly bytes: Uint8Array } | undefined;
}) => Promise<{ readonly diagnostics: ReadonlyArray<PageDiagnostic> }>;

const { values } = parseArgs({
	options: { migrate: { type: 'string' }, out: { type: 'string' } },
});
const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const requireFromRepo = createRequire(join(repoRoot, 'packages/mobile/package.json'));
const compileNativeApp = (compile as Record<string, unknown>).compileNativeApp as
	| AppCompiler
	| undefined;
const SKIP = new Set(['node_modules', 'dist', '.output', '.markless-local', '.migrate', '.git']);
const EXTENSIONS = ['', '.tsrx', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.tsrx', '/index.ts'];

function files(dir: string, into: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files(path, into);
		else if (entry.name.endsWith('.tsrx') || entry.name.endsWith('.mdx')) into.push(path);
	}
	return into;
}

function readerFor(): ReadModule {
	return (specifier, importer) => {
		let file: string | undefined;
		if (specifier.startsWith('.')) {
			const base = resolve(dirname(importer), specifier);
			file = EXTENSIONS.map((ext) => base + ext).find(
				(path) => existsSync(path) && statSync(path).isFile(),
			);
		} else {
			// A phone's script loads a package's ES module build, as the harness reads one.
			file = specifier.startsWith('@markless/')
				? (() => {
						try {
							return requireFromRepo.resolve(specifier);
						} catch {
							return undefined;
						}
					})()
				: resolvePackageModule(specifier, importer);
		}
		if (!file || !/\.(tsrx|ts|tsx|js|mjs|json)$/.test(file)) return undefined;
		return { filename: file, source: readFileSync(file, 'utf8') };
	};
}

function stylesheetReader(specifier: string, importer: string) {
	const file = resolve(dirname(importer), specifier);
	return existsSync(file) && file.endsWith('.css')
		? { file, cssText: readFileSync(file, 'utf8') }
		: undefined;
}

/** The app's top-level components when it has no pages: modules no other module of the app imports (analyzer facts). */
async function rootModules(modules: readonly string[], read: ReadModule): Promise<string[]> {
	const imported = new Set<string>();
	for (const file of modules) {
		const graph = await buildSemanticGraph({
			filename: file,
			source: readFileSync(file, 'utf8'),
		});
		for (const entry of graph.moduleImports) {
			const target = read(entry.source, file)?.filename;
			if (target) imported.add(target);
		}
	}
	return modules.filter((file) => !imported.has(file));
}

type PageResult = {
	readonly app: string;
	readonly page: string;
	readonly route: string | null;
	readonly builds: boolean;
	readonly crashed?: string;
	readonly web: readonly string[];
	readonly refusals: ReadonlyArray<Refusal>;
	readonly keyboardOnly: number;
};

function summarize(
	app: string,
	page: string,
	route: string | null,
	appRoot: string,
	diagnostics: ReadonlyArray<CompilerDiagnostic>,
): PageResult {
	const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	const native = errors.filter((diagnostic) => diagnostic.passId === 'native-view');
	const where = (diagnostic: CompilerDiagnostic) => {
		const file = diagnostic.primarySpan?.filename;
		if (!file) return null;
		return file.startsWith('/')
			? relative(file.startsWith(appRoot) ? appRoot : repoRoot, file)
			: file;
	};
	const lineOf = (diagnostic: CompilerDiagnostic) => {
		const span = diagnostic.primarySpan;
		if (!span) return null;
		const file = span.filename.startsWith('/') ? span.filename : join(appRoot, span.filename);
		if (!existsSync(file)) return null;
		return readFileSync(file, 'utf8').slice(0, span.start).split('\n').length;
	};
	const refusals = new Map<string, Refusal>();
	for (const diagnostic of native) {
		const line = lineOf(diagnostic);
		refusals.set(`${diagnostic.message}\0${where(diagnostic)}\0${line}`, {
			code: diagnostic.code,
			message: diagnostic.message,
			file: where(diagnostic),
			line,
		});
	}
	return {
		app,
		page,
		route,
		builds: errors.length === 0,
		web: [
			...new Set(
				errors
					.filter((diagnostic) => diagnostic.passId !== 'native-view')
					.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
			),
		],
		refusals: [...refusals.values()],
		keyboardOnly: diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_NATIVE_KEYBOARD_ONLY',
		).length,
	};
}

async function probeApp(app: string, appRoot: string): Promise<PageResult[]> {
	const read = readerFor();
	const served = servedReader(appRoot);
	const servedFile = servedFileReader(appRoot);
	// An asset a module imports (an image), beside the importer, as Vite resolves it.
	const asset = (specifier: string, importer: string) => {
		if (!specifier.startsWith('.')) return undefined;
		const file = resolve(dirname(importer), specifier);
		return existsSync(file) && statSync(file).isFile() ? { file, bytes: new Uint8Array(readFileSync(file)) } : undefined;
	};
	const all = files(appRoot);
	const pageIds = all
		.map((file) => relative(appRoot, file))
		.filter((id) => id.startsWith('pages/'));
	let manifest: ReturnType<typeof buildRouteManifestFromFileIds> | undefined;
	try {
		manifest = pageIds.length > 0 ? buildRouteManifestFromFileIds(pageIds) : undefined;
	} catch (error) {
		return [
			{
				app,
				page: 'pages/',
				route: null,
				builds: false,
				crashed: `route manifest: ${(error as Error).message}`,
				web: [],
				refusals: [],
				keyboardOnly: 0,
			},
		];
	}
	const results: PageResult[] = [];
	if (!manifest || manifest.routes.length === 0) {
		for (const file of await rootModules(
			all.filter((path) => path.endsWith('.tsrx')),
			read,
		)) {
			const page = relative(appRoot, file);
			try {
				const build = await compile.compileNativeComponent({
					filename: file,
					source: readFileSync(file, 'utf8'),
					readModule: read,
				});
				results.push(summarize(app, page, null, appRoot, build.diagnostics));
			} catch (error) {
				results.push(crash(app, page, null, error));
			}
		}
		return results;
	}
	const routes = manifest.routes;
	const tsrx = routes.filter((route) => route.file.endsWith('.tsrx'));
	for (const route of routes.filter((candidate) => candidate.file.endsWith('.mdx')))
		results.push({
			app,
			page: route.file,
			route: route.pattern,
			builds: false,
			crashed:
				'MDX page: lowers to HTML and islands, not to a .tsrx module the native pass reads',
			web: [],
			refusals: [],
			keyboardOnly: 0,
		});
	const pages = tsrx.map((route) => ({
		page: route.file,
		filename: join(appRoot, route.file),
		source: readFileSync(join(appRoot, route.file), 'utf8'),
	}));
	const documentFile = join(appRoot, 'document.tsrx');
	const document = existsSync(documentFile)
		? { filename: documentFile, source: readFileSync(documentFile, 'utf8') }
		: undefined;
	if (compileNativeApp) {
		try {
			const build = await compileNativeApp({
				pages,
				...(document ? { document } : {}),
				readModule: read,
				readStylesheet: stylesheetReader,
				readServedStylesheet: served,
				readServedFile: servedFile,
				readAsset: asset,
			});
			for (const route of tsrx)
				results.push(
					summarize(
						app,
						route.file,
						route.pattern,
						appRoot,
						build.diagnostics.filter((diagnostic) => diagnostic.page === route.file),
					),
				);
			return results;
		} catch {
			// One page threw; compile them one at a time below so the throw is pinned to its page.
		}
	}
	for (const route of tsrx) {
		const page = pages.find((candidate) => candidate.page === route.file)!;
		try {
			const build = compileNativeApp
				? await compileNativeApp({
						pages: [page],
						...(document ? { document } : {}),
						readModule: read,
						readStylesheet: stylesheetReader,
						readServedStylesheet: served,
						readServedFile: servedFile,
						readAsset: asset,
					})
				: await compile.compileNativeComponent({
						filename: page.filename,
						source: page.source,
						page: route.file,
						readModule: read,
					});
			results.push(summarize(app, route.file, route.pattern, appRoot, build.diagnostics));
		} catch (error) {
			results.push(crash(app, route.file, route.pattern, error));
		}
	}
	return results;
}

function crash(app: string, page: string, route: string | null, error: unknown): PageResult {
	return {
		app,
		page,
		route,
		builds: false,
		crashed: (error as Error).message.split('\n')[0]!,
		web: [],
		refusals: [],
		keyboardOnly: 0,
	};
}

/** A Markless app names a `@markless/*` package in its manifest; other frameworks' benchmark apps also use `.tsrx`. */
function isMarklessApp(dir: string): boolean {
	const manifest = join(dir, 'package.json');
	if (!existsSync(manifest)) return false;
	const { dependencies = {}, devDependencies = {} } = JSON.parse(
		readFileSync(manifest, 'utf8'),
	) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	return Object.keys({ ...dependencies, ...devDependencies }).some((name) =>
		name.startsWith('@markless/'),
	);
}

function appsUnder(dir: string, depth: number, into: string[] = []): string[] {
	if (!existsSync(dir)) return into;
	if (existsSync(join(dir, 'package.json')) || existsSync(join(dir, 'pages'))) {
		if (isMarklessApp(dir) && files(dir).length > 0) into.push(dir);
		if (!existsSync(join(dir, 'apps'))) return into;
	}
	if (depth === 0) return into;
	for (const entry of readdirSync(dir, { withFileTypes: true }))
		if (entry.isDirectory() && !SKIP.has(entry.name))
			appsUnder(join(dir, entry.name), depth - 1, into);
	return into;
}

const apps: Array<{ readonly name: string; readonly root: string; readonly source: string }> = [
	{ name: 'website', root: join(repoRoot, 'website'), source: 'repo' },
	...appsUnder(join(repoRoot, 'demos'), 3).map((root) => ({
		name: relative(repoRoot, root),
		root,
		source: 'repo',
	})),
];
if (values.migrate) {
	const migrate = resolve(values.migrate);
	for (const folder of ['examples', 'fixtures'])
		for (const entry of readdirSync(join(migrate, folder), { withFileTypes: true }).sort(
			(a, b) => a.name.localeCompare(b.name),
		)) {
			const root = join(migrate, folder, entry.name);
			if (entry.isDirectory() && isMarklessApp(root) && files(root).length > 0)
				apps.push({ name: `migrate/${folder}/${entry.name}`, root, source: 'migrate' });
		}
}

const pages: PageResult[] = [];
for (const app of apps) {
	const started = performance.now();
	const results = await probeApp(app.name, app.root);
	pages.push(...results);
	console.error(
		`${app.name}: ${results.filter((page) => page.builds).length} of ${results.length} build (${Math.round(performance.now() - started)} ms)`,
	);
}
const report = {
	tree: compileNativeApp ? 'compileNativeApp' : 'compileNativeComponent per page',
	apps: apps.map((app) => ({ name: app.name, source: app.source })),
	pages,
};
if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, '\t')}\n`);
else console.log(JSON.stringify(report, null, '\t'));
