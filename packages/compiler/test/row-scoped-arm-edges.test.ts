import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A component placed inside an `@if` arm inside a keyed `@for` row is still a
// component the row owns: the arm decides WHETHER it renders, never which row it
// belongs to. The row-scoping walk in `public-render/ssr-module.ts` used to see
// only a row's direct child-component and nested-repeat slots, so an edge under
// an arm was classified non-row-scoped and refused on `repeatItem !== undefined`
// alone - whatever the key. These rows pin that an arm is walked, that the
// edge's identity, seeds and events carry the row's `r:<key>:` segment, and that
// a genuinely index-keyed row still refuses.

/** `<TagBadge>` sits under the arm of an `@if` inside the keyed row. */
const armRowsPageSource = `import { state } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function Catalog() @{
	let picked = state('none');
	let goods = state([
		{ sku: 'g1', title: 'First', tagged: true },
		{ sku: 'g2', title: 'Second', tagged: true },
	]);

	<main>
		<ul class="goods">
			@for (const good of goods; key good.sku) {
				<li data-sku={good.sku}>
					@if (good.tagged) {
						<TagBadge title={good.title} />
					} @else {
						<span class="untagged">none</span>
					}
				</li>
			}
		</ul>
		<output data-picked>{picked}</output>
	</main>
}`;

type SsrRenderOutput = {
	readonly html: string;
	readonly view: {
		readonly events: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly symbolIds: ReadonlyArray<string>;
		}>;
	};
};

/** A child whose SSR output carries an event, so the row-child guard applies. */
function interactiveRowChild() {
	return {
		renderSsr: () => ({
			html: '<em class="tag">x</em>',
			elementCount: 1,
			view: {
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'em' }],
				events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
			},
		}),
	};
}

async function compilePage(source: string) {
	return compileTsrxModule({ filename: 'src/Catalog.tsrx', source, symbols: [] });
}

function ssrTestModuleSource(page: Awaited<ReturnType<typeof compileTsrxModule>>): string {
	return [
		`const payloadState = ${JSON.stringify(page.protocolState)};`,
		`const payloadView = ${JSON.stringify(page.protocolView)};`,
		page.publicRenderModule.renderDataModuleSource,
		page.publicRenderModule.ssrModuleSource.replace(
			/import (?:__marklessSsrComponent0|\{ [^}]+ as __marklessSsrComponent0 \}) from [^;]+;/,
			'const __marklessSsrComponent0 = globalThis.__marklessPublicRenderTestChildComponent;',
		),
		'export { marklessRenderSsr };',
	].join('\n');
}

async function importSsrModule(source: string, childComponent: unknown) {
	const globalScope = globalThis as typeof globalThis & {
		__marklessPublicRenderTestChildComponent?: unknown;
	};
	const previous = globalScope.__marklessPublicRenderTestChildComponent;
	globalScope.__marklessPublicRenderTestChildComponent = childComponent;
	try {
		const testSource = source.replace(
			/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
			(_match, _quote: string, helperModule: string) =>
				`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
		);
		return (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(testSource)}`
		)) as Record<string, unknown>;
	} finally {
		globalScope.__marklessPublicRenderTestChildComponent = previous;
	}
}

test('a keyed row keys its @for on the item field the scenario keys on', async () => {
	const page = await compilePage(armRowsPageSource);
	const repeat = page.renderData.repeats[0];

	expect(repeat?.keyPath).toEqual(['sku']);
	expect(repeat?.directSupported).toBe(true);
});

test('a component edge under an @if arm inside a keyed row emits row-scoped', async () => {
	const page = await compilePage(armRowsPageSource);
	const ssr = page.publicRenderModule.ssrModuleSource;

	// The edge takes the row's runtime placement, and its refusal is the keyed
	// one (no row key) rather than the blanket "inside any row" refusal.
	expect(ssr).toContain('marklessSsrRowPlacement');
	expect(ssr).toContain('marklessSsrDataContext.repeatKey===undefined');
	expect(ssr).not.toContain('marklessSsrDataContext.repeatItem!==undefined');
});

test('an arm-held interactive child composes one instance per keyed row', async () => {
	const page = await compilePage(armRowsPageSource.replace("state('none')", "state('arm')"));
	const ssrModule = await importSsrModule(ssrTestModuleSource(page), interactiveRowChild());
	const output = await (ssrModule.marklessRenderSsr as () => Promise<SsrRenderOutput>)();

	// Both rows rendered the arm's component, and each one's event hangs off its
	// own row segment, so a gesture on one row cannot dispatch into the other.
	const rowEventHostIds = output.view.events
		.map((event) => event.hostNodeId)
		.filter((hostNodeId) => hostNodeId.startsWith('r:'));
	expect(rowEventHostIds).toEqual(['r:g1:c0:h0', 'r:g2:c0:h0']);

	const rowSymbolIds = output.view.events.flatMap((event) =>
		event.hostNodeId.startsWith('r:') ? event.symbolIds : [],
	);
	expect(new Set(rowSymbolIds).size).toBe(2);
	expect(rowSymbolIds.every((symbolId) => symbolId.startsWith('r:'))).toBe(true);
});

test('an arm-held interactive child in an INDEX-KEYED row still refuses', async () => {
	const page = await compilePage(
		armRowsPageSource
			.replace("state('none')", "state('by position')")
			.replace('const good of goods; key good.sku', 'const good of goods; index i; key i'),
	);
	const ssrModule = await importSsrModule(ssrTestModuleSource(page), interactiveRowChild());

	await expect((ssrModule.marklessRenderSsr as () => Promise<unknown>)()).rejects.toThrow(
		'MARKLESS_ROW_COMPONENT_INTERACTIVE',
	);
});
