import { PROTOCOL_IDLE_HOST_ATTRIBUTE } from '@markless/serializer';
import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// The idle trigger finds `onIdle` hosts by a marker in the rendered markup, so
// every markup emitter must write it and no other host may carry it.

const statics = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');
const marker = ` ${PROTOCOL_IDLE_HOST_ATTRIBUTE}=""`;

test('an onIdle host carries the idle marker and no other host does', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/IdleHosts.tsrx',
		source: `export function App() @{
		<main><aside onIdle={() => {}}>later</aside><button onClick={() => {}}>now</button></main>
	}`,
	});

	expect(graph.diagnostics).toEqual([]);
	const html = statics(graph);
	expect(html).toContain(`<aside${marker}>`);
	expect(html.split(PROTOCOL_IDLE_HOST_ATTRIBUTE)).toHaveLength(2);
	expect(graph.hostNodes.find((host) => host.tagName === 'aside')).toBeDefined();
});

test('an onIdle host inside an @if arm and a dynamic tag carries the marker in its own chunk', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/IdleArms.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let open = state(false);
	let tag = state('article');
	<section>
		@if (open) { <p onIdle={() => {}}>arm</p> }
		<{tag} onIdle={() => {}}>dynamic</{tag}>
	</section>
}`,
	});

	expect(graph.diagnostics).toEqual([]);
	const html = statics(graph);
	expect(html).toContain(`<p${marker}>`);
	const dynamic = graph.markup.chunks
		.flatMap((chunk) => chunk.slots)
		.find((slot) => slot.kind === 'dynamic-host') as
		| { readonly staticAttributes?: Record<string, string> }
		| undefined;
	expect(dynamic?.staticAttributes?.[PROTOCOL_IDLE_HOST_ATTRIBUTE]).toBe('');
});

test('the direct client module starts the idle trigger only when the page has an idle host', async () => {
	const compile = async (attribute: string) =>
		(
			await compileTsrxModule({
				filename: `src/Direct${attribute}.tsrx`,
				source: `import { state } from '@markless/core';
export function App() @{
	let runs = state(0);
	<main><section ${attribute}={() => runs++}>{runs}</section></main>
}`,
				symbols: [],
			})
		).publicRenderModule.moduleSource;

	const idle = await compile('onIdle');
	expect(idle).toContain(
		"import { startMarklessIdleTrigger } from '@markless/web/fns/idle-trigger';",
	);
	expect(idle).toContain('startMarklessIdleTrigger(root);');
	expect(await compile('onClick')).not.toContain('idle-trigger');
});
