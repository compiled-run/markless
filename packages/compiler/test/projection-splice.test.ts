import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Defect 97. The served locator table is a promise: `structure.locators[i]` names
// the element that a preorder walk of the served HTML reaches at position `i`.
// A projecting child broke that promise, because the renderer emitted the child's
// own structure tokens whole and APPENDED the projection's tokens, while the HTML
// spliced the projection INSIDE the child at the `{children}` position.
//
// The probe below is the design study's: scan the served HTML for start tags in
// document order, then compare that list against the served table position by
// position. Any disagreement is a locator that will attach to the wrong element.

async function renderFixture(source: string): Promise<{
	readonly html: string;
	readonly structure: {
		readonly locators: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly tagName: string;
			readonly index: number;
		}>;
		readonly elementCount: number;
	};
}> {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const testSource = [
		`const payloadState = ${JSON.stringify(result.protocolState)};`,
		`const payloadView = ${JSON.stringify(result.protocolView)};`,
		result.publicRenderModule.renderDataModuleSource,
		result.publicRenderModule.ssrModuleSource,
		'export { marklessRenderSsr };',
	]
		.join('\n')
		.replace(
			/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
			(_match, _quote: string, helperModule: string) =>
				`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
		);
	const module = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(testSource)}`
	)) as Record<string, unknown>;
	const renderSsr = module.marklessRenderSsr as (props?: unknown) => Promise<{
		readonly html: string;
		readonly structure: {
			readonly locators: ReadonlyArray<{
				readonly hostNodeId: string;
				readonly tagName: string;
				readonly index: number;
			}>;
			readonly elementCount: number;
		};
	}>;
	return await renderSsr();
}

/** Every start tag in the served HTML, in document (preorder) order. */
export function documentTagNames(html: string): ReadonlyArray<string> {
	const tags: string[] = [];
	for (const match of html.matchAll(/<([a-zA-Z][a-zA-Z0-9:_.-]*)(\s[^>]*)?\/?>/g))
		tags.push(match[1]!.toLowerCase());
	return tags;
}

/** Positions where the served table and the served HTML disagree. */
export function locatorDisagreements(
	html: string,
	locators: ReadonlyArray<{ readonly hostNodeId: string; readonly tagName: string; readonly index: number }>,
): ReadonlyArray<string> {
	const tags = documentTagNames(html);
	return locators.flatMap((locator) => {
		if (locator.tagName === '*') return [];
		const actual = tags[locator.index];
		return actual === locator.tagName
			? []
			: [`${locator.hostNodeId} wants ${locator.tagName} at ${locator.index} -> ${actual ?? '<past end>'}`];
	});
}

// Fixture A: the child puts markup AFTER `{children}`. The projection's elements
// land between the child's own, so appending the projection's tokens swaps them.
const FIXTURE_A = `
export default function Page() @{
	<main><Box><p ui-projected="">hello</p></Box></main>
}

export function Box({ children }) @{
	<div ui-box="">{children}<span ui-after="">after</span></div>
}
`;

// Fixture B (green control): `{children}` is followed only by an arm that renders
// nothing, so appending happened to agree with the document. It must stay green.
const FIXTURE_B = `
export default function Page() @{
	<main><Box><p ui-projected="">hello</p></Box></main>
}

export function Box({ children }) @{
	<div ui-box="">{children}@if (false) { <span ui-never="">never</span> }</div>
}
`;

// Fixture C: `{children}` sits inside a construct arm. The compiler emits that arm
// with NO slot at all (`statics: [""], slots: []`, `declaredEmptyArms: [0]`), so the
// projection rendered nothing while its hosts stayed counted, and every locator
// after it ran off the end of the container onto the payload `<script>` tags.
//
// Making the arm render the projection is compiler work (the arm chunk carries no
// slot the renderer could fill), which this unit is not allowed to do. The interim
// is the loud refusal below: a dropped projection is never silent again.
const FIXTURE_C = `
export default function Page() @{
	<main><Box><li ui-projected="">hello</li></Box><div ui-tail=""></div></main>
}

export function Box({ children }) @{
	<ul ui-box="">
		@if (children !== undefined) { {children} }
		@else { <li ui-default="">default</li> }
	</ul>
}
`;

// Every green family root has `{children}` LAST by accident, so the old append
// happened to agree with the document. These shapes are that accident, plus the
// nesting and repetition the families actually use. The capture is byte-compared
// against the pre-fix renderer; nothing here may move.
const NO_REGRESSION_SHAPES: ReadonlyArray<readonly [string, string]> = [
	[
		'children-last',
		`
export default function Page() @{
	<main><Box><p ui-projected="">hello</p></Box><i ui-tail=""></i></main>
}

export function Box({ children }) @{
	<div ui-box=""><span ui-lead="">lead</span>{children}</div>
}
`,
	],
	[
		'nested-projection',
		`
export default function Page() @{
	<main><Outer><Inner><b ui-deep="">deep</b></Inner></Outer></main>
}

export function Outer({ children }) @{
	<section ui-outer="">{children}</section>
}

export function Inner({ children }) @{
	<article ui-inner=""><h2 ui-title="">t</h2>{children}</article>
}
`,
	],
	[
		'projection-in-a-row',
		`
import { state } from '@markless/core';

export default function Page() @{
	let rows = state([{ id: 'a' }, { id: 'b' }]);

	<ul>
		@for (const row of rows; key row.id) {
			<Cell><em ui-cell="">{row.id}</em></Cell>
		}
	</ul>
}

export function Cell({ children }) @{
	<li ui-wrap="">{children}</li>
}
`,
	],
	[
		'projection-with-a-branch-after-it',
		`
export default function Page() @{
	<main><Box><p ui-projected="">hello</p></Box></main>
}

export function Box({ children }) @{
	<div ui-box="">{children}@if (true) { <span ui-arm="">arm</span> }</div>
}
`,
	],
];

test.for(NO_REGRESSION_SHAPES)(
	'%s: the served table names the element the document walk reaches',
	async ([, source]) => {
		const rendered = await renderFixture(source);
		expect(rendered.html).toMatch(/ui-(projected|cell|deep)/);
		expect(locatorDisagreements(rendered.html, rendered.structure.locators)).toEqual([]);
		expect(rendered.structure.elementCount).toBe(documentTagNames(rendered.html).length);
	},
);

test('fixture A: markup after {children} keeps the served table in document order', async () => {
	const rendered = await renderFixture(FIXTURE_A);
	expect(rendered.html).toContain('ui-projected');
	expect(documentTagNames(rendered.html)).toEqual(['main', 'div', 'p', 'span']);
	expect(locatorDisagreements(rendered.html, rendered.structure.locators)).toEqual([]);
	expect(rendered.structure.elementCount).toBe(4);
});

test('fixture B: a nothing-rendering arm after {children} stays in document order', async () => {
	const rendered = await renderFixture(FIXTURE_B);
	expect(rendered.html).toContain('ui-projected');
	expect(documentTagNames(rendered.html)).toEqual(['main', 'div', 'p']);
	expect(locatorDisagreements(rendered.html, rendered.structure.locators)).toEqual([]);
});

// This shape used to reach the refusal below, because a bare `{children}` in an
// arm compiled to an empty chunk and the projection never reached the bytes. The
// arm renders it now, so what is left to hold is that the splice keeps the
// served table in document order like every other projection position.
test('fixture C: {children} inside a construct arm renders in document order', async () => {
	const rendered = await renderFixture(FIXTURE_C);
	expect(rendered.html).toContain('ui-projected');
	expect(rendered.html).not.toContain('ui-default');
	expect(documentTagNames(rendered.html)).toEqual(['main', 'ul', 'li', 'div']);
	expect(locatorDisagreements(rendered.html, rendered.structure.locators)).toEqual([]);
	expect(rendered.structure.elementCount).toBe(documentTagNames(rendered.html).length);
});

test('a child that never renders {children} refuses loudly rather than counting phantoms', async () => {
	const source = `
export default function Page() @{
	<main><Box><p ui-projected="">hello</p></Box></main>
}

export function Box({ children }) @{
	<div ui-box="">ignored</div>
}
`;
	await expect(renderFixture(source)).rejects.toThrow(/MARKLESS_PROJECTION_NOT_RENDERED/);
});
