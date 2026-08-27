import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { SEED_CHILDREN_UNAVAILABLE_CODE } from '../../src/passes/public-render/seed-children-diagnostics.ts';

/**
 * A widget family whose label part seeds a widget-scoped cell from its OWN
 * `children`, and a sibling part that renders that cell into an attribute. The
 * sibling paints during the projection, which is after the seed pass, so what
 * the seed saw is what the attribute carries — there is no second paint.
 */
const FAMILY = `import { shared, state } from '@markless/core';
export const meterState = shared(() => {
	const meter = state({ value: 0, ownLabel: '' });
	return { ...meter };
}, { scope: 'widget' });

function MeterRoot({ children }) @{
	const meter = meterState();

	<div>{children}</div>
}

function MeterBar({ value = 0 }) @{
	const meter = meterState();
	meter.value = value;

	<div role="progressbar" aria-valuenow={meter.value} aria-valuetext={meter.ownLabel}></div>
}

function MeterLabel({ children }) @{
	const meter = meterState();
	meter.ownLabel = children;

	<span>{children}</span>
}
`;

// Hardcoding resistance: the same structure under different family, component,
// prop, cell, element and attribute names, in the other document order.
const ALTERNATE_FAMILY = `import { shared, state } from '@markless/core';
export const gaugeStore = shared(() => {
	const gauge = state({ level: 0, caption: '' });
	return { ...gauge };
}, { scope: 'widget' });

function GaugeShell({ children }) @{
	const gauge = gaugeStore();

	<section>{children}</section>
}

function GaugeCaption({ children }) @{
	const gauge = gaugeStore();
	gauge.caption = children;

	<b>{children}</b>
}

function GaugeNeedle({ level = 0 }) @{
	const gauge = gaugeStore();
	gauge.level = level;

	<i data-level={gauge.level} title={gauge.caption}></i>
}
`;

async function compilePage(family: string, page: string) {
	return compileTsrxModule({ filename: 'src/page.tsrx', source: family + page, symbols: [] });
}

// The props the emitted seed pass hands one placed part, as source text. A seed
// call is the one that passes `marklessSharedSeeds` and renders nothing.
function seedCallProps(ssr: string, componentReference: string): string | undefined {
	const call = new RegExp(
		`const childProps=\\{([^;]*)\\};await ${componentReference}\\?\\.renderSsr\\?\\.\\(childProps,\\{\\.\\.\\.marklessSsrRenderContext,marklessSharedSeeds:`,
	);
	return call.exec(ssr)?.[1];
}

test('JSX text content reaches the seed as children, not undefined', async () => {
	const result = await compilePage(
		FAMILY,
		`export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel>30 of 100 rows</MeterLabel>
	</MeterRoot>
}`,
	);

	expect(seedCallProps(result.publicRenderModule.ssrModuleSource, '__marklessSsrComponent2')).toBe(
		'children:"30 of 100 rows"',
	);
	expect(result.publicRenderModule.diagnostics).toEqual([]);
});

test('the same shape under other names seeds the same way', async () => {
	const result = await compilePage(
		ALTERNATE_FAMILY,
		`export function Screen() @{
	<GaugeShell>
		<GaugeCaption>eleven of twelve</GaugeCaption>
		<GaugeNeedle level={11} />
	</GaugeShell>
}`,
	);

	expect(result.publicRenderModule.ssrModuleSource).toContain('children:"eleven of twelve"');
	expect(result.publicRenderModule.diagnostics).toEqual([]);
});

test('children spelled as a prop still reaches the seed, and adds no second children', async () => {
	const result = await compilePage(
		FAMILY,
		`export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel children="30 of 100 rows" />
	</MeterRoot>
}`,
	);
	const props = seedCallProps(result.publicRenderModule.ssrModuleSource, '__marklessSsrComponent2');

	expect(props).toBe('children:("30 of 100 rows")');
	expect(result.publicRenderModule.diagnostics).toEqual([]);
});

test('a markup projection is refused at compile time rather than seeding undefined', async () => {
	const result = await compilePage(
		FAMILY,
		`export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel><em>30</em> of 100 rows</MeterLabel>
	</MeterRoot>
}`,
	);
	const refusal = result.publicRenderModule.diagnostics.find(
		(diagnostic) => diagnostic.code === SEED_CHILDREN_UNAVAILABLE_CODE,
	);

	expect(refusal?.severity).toBe('error');
	expect(refusal?.statePath).toBe('meter.ownLabel');
	expect(refusal?.message).toContain('MeterLabel');
	// The refusal points at the placement the consumer can fix, not at the family.
	expect(refusal?.primarySpan?.filename).toBe('src/page.tsrx');
});

test('a part that seeds from something other than children is left alone', async () => {
	const result = await compilePage(
		FAMILY,
		`export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
	</MeterRoot>
}`,
	);

	expect(
		result.publicRenderModule.diagnostics.filter(
			(diagnostic) => diagnostic.code === SEED_CHILDREN_UNAVAILABLE_CODE,
		),
	).toEqual([]);
});
