import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(markup: string) {
	const result = await compileTsrxModule({
		filename: '/workspace/app/src/Page.tsrx',
		source: `
import { state } from '@markless/core';

export default function Page() @{
	let count = state(0);

	<main>
		${markup}
		<button onClick={() => count++}>{count}</button>
	</main>
}
`,
		symbols: [],
	});
	const tags = result.renderData.hosts.map((host) => host.tagName);
	const button = result.payloadArena.view.locators.find(
		(locator) => locator.tagName === 'button',
	);
	return {
		result,
		tags,
		buttonIndex: button?.index,
		codes: result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

test('<template> content gets no hosts, so later elements keep their DOM-order index', async () => {
	const { tags, buttonIndex, codes } = await compile(
		'<template id="t"><div><span>inert</span><span>content</span></div></template><p>static</p>',
	);

	expect(codes).toEqual([]);
	expect(tags).toEqual(['main', 'template', 'p', 'button']);
	expect(buttonIndex).toBe(3);
});

test('<noscript> content is text to the parser, so its elements get no hosts', async () => {
	const { tags, codes } = await compile(
		'<noscript><div class="warn"><b>Enable JavaScript</b></div></noscript><section>after</section>',
	);

	expect(codes).toEqual([]);
	expect(tags).toEqual(['main', 'noscript', 'section', 'button']);
});

test('a declarative shadow root template is consumed by the parser, so neither it nor its content is a host', async () => {
	const { tags, codes } = await compile(
		'<div class="host"><template shadowrootmode="open"><slot></slot><em>shadow</em></template><i>light</i></div>',
	);

	expect(codes).toEqual([]);
	expect(tags).toEqual(['main', 'div', 'i', 'button']);
});

test('elements under <svg><foreignObject> stay in document order and keep their hosts', async () => {
	const { tags, codes } = await compile(
		'<svg viewBox="0 0 10 10"><foreignObject width="10" height="10"><div><span>html</span></div></foreignObject></svg>',
	);

	expect(codes).toEqual([]);
	expect(tags).toEqual(['main', 'svg', 'foreignObject', 'div', 'span', 'button']);
});

test('a handler, binding, or component inside <template> content is refused, not silently dropped', async () => {
	for (const inner of [
		'<button onClick={() => count++}>inc</button>',
		'<span>{count}</span>',
		'<span title={count}>x</span>',
		'<div attach={(el) => el.focus()}>x</div>',
		'@if (count > 1) { <i>many</i> }',
	]) {
		const { codes } = await compile(`<template>${inner}</template>`);
		expect(codes, inner).toContain('MARKLESS_DETACHED_CONTENT_DYNAMIC');
	}
});

test('literal text and attribute values inside <template> content compile', async () => {
	const { codes, result } = await compile(
		'<template><p class={"a b"} data-n={2}>{"literal"} and {`quoted`}</p></template>',
	);

	expect(codes).toEqual([]);
	expect(result.renderData.chunks.map((chunk) => chunk.statics.join('')).join('')).toContain(
		'<template><p class="a b" data-n="2">literal and quoted</p></template>',
	);
});
