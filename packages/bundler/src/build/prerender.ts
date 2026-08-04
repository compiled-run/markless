import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'rolldown';
import {
	assemblePrerenderPageParts,
	type SsrRenderable,
} from '../../../web/src/render-to-string.ts';
import { evaluateBuiltPageClosure } from '../../../web/src/prerender/evaluator.ts';
import { prepareSsrResumeRecords } from '../../../web/src/prerender/records.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';

export type BuiltPrerenderRecords = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export async function deriveBuiltPrerenderRecords(input: {
	readonly entry: string;
	readonly serverPlugin: Plugin;
}): Promise<BuiltPrerenderRecords> {
	return withBuiltPrerenderPage(input, async (page) =>
		prepareSsrResumeRecords(await evaluateBuiltPageClosure(page)),
	);
}

export async function emitPrerenderedPage(input: {
	readonly root: string;
	readonly entry: string;
	readonly outDir: string;
	readonly serverPlugin: Plugin;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
}): Promise<void> {
	const page = await withBuiltPrerenderPage(input, async (built) => {
		const output = await evaluateBuiltPageClosure(built);
		return assemblePrerenderPageParts(built, output, {
			resumeModuleUrl: input.resumeModuleUrl,
			prerenderWakeModuleUrl: input.prerenderWakeModuleUrl,
		});
	});
	const htmlFile = resolve(input.root, input.outDir, 'index.html');
	const html = await readFile(htmlFile, 'utf8');
	const placeholder = '<div id="app"></div>';
	if (!html.includes(placeholder)) {
		throw new Error(
			'MARKLESS_PRERENDER_CONTAINER_MISSING: expected exact #app build placeholder',
		);
	}
	const withHead = page.head ? html.replace('</head>', `${page.head}</head>`) : html;
	await writeFile(htmlFile, withHead.replace(placeholder, page.container));
}

async function withBuiltPrerenderPage<T>(
	input: { readonly entry: string; readonly serverPlugin: Plugin },
	read: (page: SsrRenderable) => Promise<T>,
): Promise<T> {
	const temporaryDirectory = await mkdtemp(join(tmpdir(), 'markless-prerender-'));
	try {
		const { rolldown } = await import('rolldown');
		const build = await rolldown({
			input: { prerender: input.entry },
			plugins: [input.serverPlugin],
		});
		await build.write({
			dir: temporaryDirectory,
			format: 'esm',
			entryFileNames: '[name].js',
			chunkFileNames: 'chunk-[hash].js',
		});
		await build.close();

		const moduleUrl = `${pathToFileURL(join(temporaryDirectory, 'prerender.js')).href}?build=${Date.now()}`;
		const built = (await import(moduleUrl)) as { readonly default?: SsrRenderable };
		if (!built.default) throw new Error('MARKLESS_PRERENDER_ENTRY_MISSING');
		return await read(built.default);
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}
