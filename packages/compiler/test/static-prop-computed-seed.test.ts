import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { marklessSsrSeedPropCells } from '../../web/src/fns/ssr.ts';

function componentSsrSource(source: string, functionName: string) {
	const start = source.indexOf(`async function ${functionName}(`);
	expect(start).toBeGreaterThanOrEqual(0);
	const next = source.indexOf('\nasync function markless', start + 1);
	return source.slice(start, next === -1 ? undefined : next);
}

// A part comparing its own static prop against a shared cell derives once at
// render and then re-derives at resume; the prop has to be in the payload.
test('SSR seeds the prop cell a sync computed reads, narrowed to the read path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		source: `
import { computed, shared, state } from '@markless/core';
export const panelState = shared(
	() => {
		const box = state({ value: '' });
		return { ...box };
	},
	{ scope: 'widget' },
);
export function PanelRoot({ value = '', children }) @{
	const panel = panelState();
	panel.value = value;
	<div>{children}</div>
}
export function PanelContent({ value, children }) @{
	const panel = panelState();
	const isShowing = computed(() => panel.value === value);
	<div hidden={isShowing !== true}>{children}</div>
}
`,
		symbols: [],
	});

	const ssr = result.publicRenderModule.ssrModuleSource;
	const content = componentSsrSource(ssr, 'marklessRenderSsrPanelContent');
	expect(content).toContain(
		'marklessSsrSeedPropCells(marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren), props, [{"graphNodeId":"prop:props","keys":[],"scalarKeys":["value"]}])',
	);
	// Projected children are already in the served markup; seeding the whole bag
	// would ship that HTML a second time.
	expect(content).not.toContain('"children"');
});

test('SSR seeds no prop cell for a component whose derives read no prop', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Gauge.tsrx',
		source: `
import { computed, state } from '@markless/core';
export function Gauge() @{
	let level = state(2);
	const loud = computed(() => level > 1);
	<p data-loud={loud}>{level}</p>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).not.toContain('marklessSsrSeedPropCells(');
});

// Same structure, different names, different prop count: the seed follows the
// dependency records, not the fixture's spelling.
test('SSR narrows the seed to every prop path the derives read and no more', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Stepper.tsrx',
		source: `
import { computed, shared, state } from '@markless/core';
export const stepperState = shared(
	() => {
		const box = state({ slug: '' });
		return { ...box };
	},
	{ scope: 'widget' },
);
export function StepperRoot({ slug = '', children }) @{
	const stepper = stepperState();
	stepper.slug = slug;
	<ol>{children}</ol>
}
export function StepperStep({ slug, badge, note, children }) @{
	const stepper = stepperState();
	const active = computed(() => stepper.slug === slug);
	const label = computed(() => (active ? badge : ''));
	<li data-label={label} hidden={active !== true}>{children}{note}</li>
}
`,
		symbols: [],
	});

	const step = componentSsrSource(
		result.publicRenderModule.ssrModuleSource,
		'marklessRenderSsrStepperStep',
	);
	const seed = /marklessSsrSeedPropCells\(.*, props, (\[.*?\])\);/.exec(step)?.[1];
	expect(seed).toBeDefined();
	const cells = JSON.parse(seed as string) as ReadonlyArray<{
		graphNodeId: string;
		keys: ReadonlyArray<string> | null;
		scalarKeys?: ReadonlyArray<string>;
	}>;
	expect(cells).toHaveLength(1);
	expect(cells[0]?.graphNodeId).toBe('prop:props');
	expect(cells[0]?.keys).toEqual([]);
	expect([...(cells[0]?.scalarKeys ?? [])].sort()).toEqual(['badge', 'slug']);
});

// A derive over a structured prop names the key, and the runtime seed leaves it
// out: settled data the composing render routes from its own graph would ship
// twice, and a build's forced-arm probe hands that prop as an unserializable
// hole proxy.
test('a derive over a structured prop seeds a scalar-only key the payload skips', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Summary.tsrx',
		source: `
import { computed, state } from '@markless/core';
export function Board() @{
	let weight = state(2);
	let rows = state([{ id: 'a' }]);
	<section><Summary updates={rows} weight={weight} /></section>
}
export function Summary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);
	<p>{weightedCount}</p>
}
`,
		symbols: [],
	});

	const summary = componentSsrSource(
		result.publicRenderModule.ssrModuleSource,
		'marklessRenderSsrSummary',
	);
	const seed = /marklessSsrSeedPropCells\(.*, props, (\[.*?\])\);/.exec(summary)?.[1];
	const cells = JSON.parse(seed as string) as ReadonlyArray<{
		keys: ReadonlyArray<string> | null;
		scalarKeys?: ReadonlyArray<string>;
	}>;
	expect(cells[0]?.keys).toEqual([]);
	expect([...(cells[0]?.scalarKeys ?? [])].sort()).toEqual(['updates', 'weight']);

	const seeded = marklessSsrSeedPropCells({ cells: [] }, { updates: [{ id: 'a' }], weight: 2 }, [
		{ graphNodeId: 'prop:props', keys: [], scalarKeys: ['updates', 'weight'] },
	]);
	expect(seeded.cells).toHaveLength(1);
	const carried = JSON.stringify(seeded.cells?.[0]);
	expect(carried).toContain('weight');
	expect(carried).not.toContain('updates');
});
