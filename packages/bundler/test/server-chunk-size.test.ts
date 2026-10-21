import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'pathe';
import { build as viteBuild, type Plugin, type Rollup } from 'vite';
import { expect, test } from 'vitest';
import { MARKLESS_SERVER_CHUNK_MAX_BYTES } from '../src/build/chunking.ts';
import { marklessServer } from '../src/rolldown.ts';

const root = '/workspace/server-chunk-size';
const layerCount = 24;
const layerFile = (index: number) => `${root}/layers/layer-${index}.tsrx`;
const pageFile = `${root}/page.tsrx`;
// Enough markup that the layers together are well past the cap, as a site's portaled layers were.
const paragraphs = Math.ceil((MARKLESS_SERVER_CHUNK_MAX_BYTES * 2) / layerCount / 120);

function layerSource(index: number): string {
	const paragraph = `<p>Layer ${index} holds portaled content that its page opens on use, written out in full.</p>`;
	return `import { state } from '@markless/core';
export default function Layer${index}() @{
	let shown = state(false);
	<div class="layer-${index}" hidden={!shown}>
		<button onClick={() => (shown = !shown)}>Close ${index}</button>
		${Array.from({ length: paragraphs }, () => paragraph).join('\n\t\t')}
	</div>
}`;
}

const pageSource = `${Array.from(
	{ length: layerCount },
	(_, i) => `import Layer${i} from './layers/layer-${i}.tsrx';`,
).join('\n')}
export default function Page() @{
	<main>
		${Array.from({ length: layerCount }, (_, i) => `<Layer${i} />`).join('\n\t\t')}
	</main>
}`;

const fixture: Plugin = {
	name: 'server-chunk-size-fixture',
	resolveId(id, importer) {
		if (id === pageFile) return id;
		const match = /^\.\/layers\/layer-(\d+)\.tsrx$/.exec(id);
		if (match && importer === pageFile) return layerFile(Number(match[1]));
		return null;
	},
	load(id) {
		if (id === pageFile) return pageSource;
		const match = /\/layers\/layer-(\d+)\.tsrx$/.exec(id);
		return match ? layerSource(Number(match[1])) : null;
	},
};

// ui.shadcn.com's document imported every layer, and the one 78 MB server chunk crashed V8's optimizing compiler.
test('a server build splits compiled modules into chunks no larger than the server chunk cap', async () => {
	const outDir = await mkdtemp(resolve(import.meta.dirname, '.server-chunk-size-'));
	try {
		const result = await viteBuild({
			configFile: false,
			root: resolve(import.meta.dirname, '..'),
			logLevel: 'silent',
			plugins: [fixture, marklessServer({ executionLog: 'never' })],
			build: { ssr: pageFile, outDir, emptyOutDir: false, minify: false, target: 'es2022' },
		});
		const output = (Array.isArray(result) ? result : [result]).flatMap(
			(item) => (item as Rollup.RollupOutput).output,
		);
		const chunks = output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk');
		const total = chunks.reduce((sum, chunk) => sum + chunk.code.length, 0);
		expect(total).toBeGreaterThan(MARKLESS_SERVER_CHUNK_MAX_BYTES * 1.5);
		for (const chunk of chunks)
			expect(chunk.code.length, chunk.fileName).toBeLessThanOrEqual(MARKLESS_SERVER_CHUNK_MAX_BYTES);
		const entry = chunks.find((chunk) => chunk.isEntry)!;
		const page = (await import(pathToFileURL(resolve(outDir, entry.fileName)).href)) as {
			default: { renderSsr(): Promise<{ readonly html: string }> };
		};
		const { html } = await page.default.renderSsr();
		for (let i = 0; i < layerCount; i++) expect(html).toContain(`Close ${i}</button>`);
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 180_000);
