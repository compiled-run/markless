import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

async function staticsOf(source: string, componentName = 'App') {
	const graph = await buildSemanticGraph({ filename: 'src/Presence.tsrx', source });
	return (
		graph.markup.chunks
			.find((chunk) => chunk.id === `template:${componentName}`)
			?.statics.join('') ?? ''
	);
}

test('a dynamic attribute keeps its name out of the statics so the runtime can drop it', async () => {
	const statics = await staticsOf(
		`export default function Part({ disabled }) @{ <button type="button" disabled={disabled} ui-disabled={disabled}>x</button> }`,
		'Part',
	);

	expect(statics).toBe('<button type="button">x</button>');
});

test('an attribute whose arms are both string literals keeps its name in the statics', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Presence.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	const active = state(true);
	<p class={active ? 'on' : 'off'}>x</p>
}`,
	});
	const chunk = graph.markup.chunks.find((candidate) => candidate.id === 'template:App');

	expect(chunk?.statics.join('')).toBe('<p class="">x</p>');
	expect(chunk?.slots[0]).toMatchObject({ kind: 'attribute', name: 'class', alwaysPresent: true });
});

test('a literal false attribute value emits no attribute and true emits the boolean form', async () => {
	expect(
		await staticsOf(`export function App() @{ <button disabled={false} hidden={true}>x</button> }`),
	).toBe('<button hidden="">x</button>');
});

test('aria and data names keep the literal true their consumers parse', async () => {
	expect(
		await staticsOf(`export function App() @{ <div aria-hidden={true} data-open={true} ui-open={true}>x</div> }`),
	).toBe('<div aria-hidden="true" data-open="true" ui-open="">x</div>');
});

test('a bare attribute stays the present-with-no-value form', async () => {
	expect(await staticsOf(`export function App() @{ <div data-flag hidden>x</div> }`)).toBe(
		'<div data-flag="" hidden="">x</div>',
	);
});
