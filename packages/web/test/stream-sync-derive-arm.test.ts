import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { renderToStream } from '../src/render-to-stream.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function compiledPage(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Dock.tsrx', source, symbols: [] });
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) =>
			`from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`
	)) as { readonly marklessRenderSsr: (...args: unknown[]) => unknown };
	return { renderSsr: loaded.marklessRenderSsr };
}

async function collectWithin(appends: AsyncGenerator<string>, ms: number): Promise<string[]> {
	const chunks: string[] = [];
	const drained = (async () => {
		for await (const chunk of appends) chunks.push(chunk);
	})();
	const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));
	if ((await Promise.race([drained, timedOut])) === 'timeout')
		throw new Error(`appends did not finish within ${ms}ms`);
	return chunks;
}

test('a @try gated by an expression over a slow async value streams its settled arm with the upstream snapshot', async () => {
	const page = await compiledPage(`
import { computed } from '@markless/core';

function later(value, ms) {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function Dock() @{
	const berth = computed(async () => later({ pier: 'north' }, 30));
	const cargo = computed(async () => later({ crates: ['tea', berth.pier] }, 30));

	<section>@try {
		<b data-cargo>{cargo.crates.join(' & ')}</b>
	} @pending { <b data-cargo-pending>Unloading</b> } @catch { <b data-cargo-failed>Lost</b> }</section>
}
`);
	const stream = await renderToStream(page as never, {});
	expect(stream.shell).toContain('data-cargo-pending');

	const chunks = await collectWithin(stream.appends(), 2_000);
	const settled = chunks.join('');
	expect(settled).toContain('<b data-cargo="">tea &amp; north</b>');
	const patch = /<script type="markless\/state-patch"[^>]*>([^<]*)<\/script>/.exec(settled)?.[1];
	const computed = (
		JSON.parse(patch ?? '{}') as {
			readonly computed?: ReadonlyArray<{
				readonly graphNodeId: string;
				readonly snapshot?: { readonly status: string };
			}>;
		}
	).computed;
	expect(computed?.find((item) => item.graphNodeId === 'computed:cargo')?.snapshot?.status).toBe(
		'fulfilled',
	);
});
