import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Text written straight into a @try arm has no element of its own inside the arm: the
// element around the @try also holds the boundary's markers and siblings, so the read
// must not become a whole-element text write there. It writes its own text node, or,
// where only the render knows that node's place, the arm re-renders.

const ARM_TEXT = `
import { computed } from '@markless/core';

export default function Header() @{
	const todo = computed(async () => ({ name: 'apple' }));

	<section class="header">
		@try {
			<>Editing "{todo.name}"</>
		} @pending {}
		<button>Back</button>
	</section>
}
`;

const ARM_ELEMENT = ARM_TEXT.replace('<>Editing "{todo.name}"</>', '<h2>Editing "{todo.name}"</h2>');

async function view(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Header.tsrx', source, symbols: [] });
	return compiled.protocolView as unknown as {
		readonly locators: ReadonlyArray<{ readonly hostNodeId: string; readonly tagName?: string }>;
		readonly domUpdates: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly graphNodeId: string;
			readonly target?: { readonly kind: string; readonly textNode?: number; readonly prefix?: string; readonly suffix?: string };
		}>;
		readonly asyncBoundaries: ReadonlyArray<{ readonly id: string; readonly rerendersOnRefresh?: true }>;
	};
}

test('text written straight into a @try arm writes its own text node, past the start anchor', async () => {
	const payload = await view(ARM_TEXT);
	const section = payload.locators.find((locator) => locator.tagName === 'section')?.hostNodeId;
	expect(payload.domUpdates.map((update) => [update.hostNodeId, update.target])).toEqual([
		[section, { kind: 'text', prefix: 'Editing "', suffix: '"', textNode: 1 }],
	]);
	expect(payload.asyncBoundaries.map((boundary) => boundary.rerendersOnRefresh)).toEqual([undefined]);
});

test('text after the @try counts its node back from the end when what precedes the @try varies', async () => {
	const payload = await view(
		ARM_TEXT.replace('<section class="header">', '<section class="header">\n\t\t@if (todo.name) { <i>new</i> }')
			.replace('@try {', '@try {')
			.replace('<>Editing "{todo.name}"</>', '<><b>Editing</b> {todo.name} now<input /></>'),
	);
	const arm = payload.domUpdates.filter((update) => update.target?.textNode !== undefined);
	expect(arm.map((update) => update.target)).toEqual([
		{ kind: 'text', prefix: ' ', suffix: ' now', textNode: -4 },
	]);
});

test('text whose node no static count can place re-renders the arm instead', async () => {
	const payload = await view(
		ARM_TEXT.replace('<section class="header">', '<section class="header">\n\t\t@if (todo.name) { <i>new</i> }').replace(
			'<button>Back</button>',
			'@if (todo.name) { <b>back</b> }',
		),
	);
	expect(payload.domUpdates.filter((update) => update.target?.textNode !== undefined)).toEqual([]);
	expect(payload.asyncBoundaries.map((boundary) => boundary.rerendersOnRefresh)).toEqual([true]);
});

test('text inside an element of the @try arm keeps its in-place update', async () => {
	const payload = await view(ARM_ELEMENT);
	const section = payload.locators.find((locator) => locator.tagName === 'section')?.hostNodeId;
	expect(payload.domUpdates.filter((update) => update.hostNodeId !== section)).toHaveLength(1);
	expect(payload.asyncBoundaries.map((boundary) => boundary.rerendersOnRefresh)).toEqual([undefined]);
});
