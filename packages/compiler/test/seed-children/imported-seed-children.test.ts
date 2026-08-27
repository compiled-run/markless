import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';
import { SEED_CHILDREN_UNAVAILABLE_CODE } from '../../src/passes/public-render/seed-children-diagnostics.ts';

/**
 * The same widget family as the same-module case, but living in its own file so
 * the page that places it sees the parts only through the published interface.
 */
const FAMILY = `import { shared, state } from '@markless/core';
export const meterState = shared(() => {
	const meter = state({ value: 0, ownLabel: '' });
	return { ...meter };
}, { scope: 'widget' });

export function MeterRoot({ children }) @{
	const meter = meterState();

	<div>{children}</div>
}

export function MeterBar({ value = 0 }) @{
	const meter = meterState();
	meter.value = value;

	<div role="progressbar" aria-valuenow={meter.value} aria-valuetext={meter.ownLabel}></div>
}

export function MeterLabel({ children }) @{
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

export function GaugeShell({ children }) @{
	const gauge = gaugeStore();

	<section>{children}</section>
}

export function GaugeCaption({ children }) @{
	const gauge = gaugeStore();
	gauge.caption = children;

	<b>{children}</b>
}

export function GaugeNeedle({ level = 0 }) @{
	const gauge = gaugeStore();
	gauge.level = level;

	<i data-level={gauge.level} title={gauge.caption}></i>
}
`;

async function compileFamilyAndPage(family: string, page: string) {
	const [familyResult, pageResult] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/meter.tsrx', source: family, importSource: './meter.tsrx' },
		{ filename: 'src/page.tsrx', source: page },
	]);
	if (!familyResult || !pageResult) throw new Error('expected both modules to compile');
	return { familyResult, pageResult };
}

function seedRefusals(diagnostics: ReadonlyArray<{ readonly code: string }>) {
	return diagnostics.filter((diagnostic) => diagnostic.code === SEED_CHILDREN_UNAVAILABLE_CODE);
}

test('the published interface carries the cell each part seeds from its children', async () => {
	const { familyResult } = await compileFamilyAndPage(
		FAMILY,
		`import { MeterRoot } from './meter.tsrx';
export function Page() @{
	<MeterRoot />
}`,
	);
	const components = familyResult.moduleGraphInterface.render.components;
	const byName = (name: string) =>
		components.find((component) => component.componentName === name);

	expect(byName('MeterLabel')?.seedsFromProps).toEqual([
		{ prop: 'children', statePath: 'meter.ownLabel' },
	]);
	// A part that seeds from a named prop rather than from `children`, and a part
	// that seeds nothing, both stay off the record.
	expect(byName('MeterBar')?.seedsFromProps).toBeUndefined();
	expect(byName('MeterRoot')?.seedsFromProps).toBeUndefined();
});

test('a markup projection into an imported seeding part is refused', async () => {
	const { pageResult } = await compileFamilyAndPage(
		FAMILY,
		`import { MeterRoot, MeterBar, MeterLabel } from './meter.tsrx';
export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel><em>30</em> of 100 rows</MeterLabel>
	</MeterRoot>
}`,
	);
	const refusal = seedRefusals(pageResult.publicRenderModule.diagnostics)[0] as
		| (typeof pageResult.publicRenderModule.diagnostics)[number]
		| undefined;

	expect(refusal?.severity).toBe('error');
	expect(refusal?.statePath).toBe('meter.ownLabel');
	expect(refusal?.message).toContain('MeterLabel');
	// The refusal points at the placement the consumer can fix, not at the family.
	expect(refusal?.primarySpan?.filename).toBe('src/page.tsrx');
});

test('the same imported shape under other names is refused the same way', async () => {
	const { pageResult } = await compileFamilyAndPage(
		ALTERNATE_FAMILY,
		`import { GaugeShell, GaugeCaption, GaugeNeedle } from './meter.tsrx';
export function Screen() @{
	<GaugeShell>
		<GaugeCaption><i>eleven</i> of twelve</GaugeCaption>
		<GaugeNeedle level={11} />
	</GaugeShell>
}`,
	);
	const refusal = seedRefusals(pageResult.publicRenderModule.diagnostics)[0] as
		| (typeof pageResult.publicRenderModule.diagnostics)[number]
		| undefined;

	expect(refusal?.statePath).toBe('gauge.caption');
	expect(refusal?.message).toContain('GaugeCaption');
});

test('static text into an imported seeding part compiles', async () => {
	const { pageResult } = await compileFamilyAndPage(
		FAMILY,
		`import { MeterRoot, MeterBar, MeterLabel } from './meter.tsrx';
export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
		<MeterLabel>30 of 100 rows</MeterLabel>
	</MeterRoot>
}`,
	);

	expect(seedRefusals(pageResult.publicRenderModule.diagnostics)).toEqual([]);
	expect(pageResult.publicRenderModule.ssrModuleSource).toContain('30 of 100 rows');
});

test('an imported part with no children seed is left alone', async () => {
	const { pageResult } = await compileFamilyAndPage(
		FAMILY,
		`import { MeterRoot, MeterBar } from './meter.tsrx';
export function Page() @{
	<MeterRoot>
		<MeterBar value={30} />
	</MeterRoot>
}`,
	);

	expect(seedRefusals(pageResult.publicRenderModule.diagnostics)).toEqual([]);
});
