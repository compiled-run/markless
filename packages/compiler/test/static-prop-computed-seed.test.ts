import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { marklessSsrRemapGraphOutput, marklessSsrSeedPropCells } from '../../web/src/fns/ssr.ts';

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
		'marklessSsrSeedPropCells(marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren), marklessSsrProps, [{"graphNodeId":"prop:props","keys":[],"scalarKeys":["value"]}])',
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
	const seed = /marklessSsrSeedPropCells\(.*, marklessSsrProps, (\[.*?\])\);/.exec(step)?.[1];
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
	const seed = /marklessSsrSeedPropCells\(.*, marklessSsrProps, (\[.*?\])\);/.exec(summary)?.[1];
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

// The bound derive reads a live-routed prop off the composer's node, so the
// child's scalar copy is never read after resume and would only cost payload bytes.
test('composition drops a seeded derive key the composer routes live, keeps a static one', () => {
	const seed = () =>
		marklessSsrSeedPropCells({ cells: [] }, { updates: [{ id: 'a' }], weight: 2, label: 'x' }, [
			{ graphNodeId: 'prop:props', keys: [], scalarKeys: ['updates', 'weight', 'label'] },
		]);

	const routed = { state: seed() as { cells: ReadonlyArray<{ graphNodeId: string }> } };
	marklessSsrRemapGraphOutput(
		routed,
		[
			{ name: 'updates', graphNodeId: 'computed:feed', path: ['updates'] },
			{ name: 'weight', graphNodeId: 'state:weight', path: [] },
			{ name: 'label', graphNodeId: 'state:label', path: [] },
		],
		'c0:',
	);
	expect(routed.state.cells.map((cell) => cell.graphNodeId)).not.toContain('c0:prop:props');

	const mixed = { state: seed() as { cells: ReadonlyArray<{ graphNodeId: string }> } };
	marklessSsrRemapGraphOutput(
		mixed,
		[
			{ name: 'updates', graphNodeId: 'computed:feed', path: ['updates'] },
			{ name: 'weight', graphNodeId: 'state:weight', path: [] },
			{ name: 'label', kind: 'compiler-known-constant' },
		],
		'c0:',
	);
	const carried = mixed.state.cells.find((cell) => cell.graphNodeId === 'c0:prop:props');
	expect(JSON.stringify(carried)).toContain('label');
	expect(JSON.stringify(carried)).not.toContain('weight');
});

// An attach factory's arguments are read back when the behavior runs in the
// browser, so a prop it is handed has to be in the payload whatever its value.
test('SSR seeds the prop cell a behavior input reads, only for its own component', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Badge.tsrx',
		source: `
function tag(labels: readonly string[]) {
	return (element: HTMLElement) => element.setAttribute('data-count', String(labels.length));
}
export function Badge({ labels, tone }: { readonly labels: readonly string[]; readonly tone: string }) @{
	<em attach={tag(labels)} data-tone={tone}>badge</em>
}
export function Plain({ labels }: { readonly labels: readonly string[] }) @{
	<i>{labels.length}</i>
}
`,
		symbols: [],
	});

	const ssr = result.publicRenderModule.ssrModuleSource;
	expect(componentSsrSource(ssr, 'marklessRenderSsr')).toContain(
		'marklessSsrSeedPropCells(marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren), marklessSsrProps, [{"graphNodeId":"prop:props","keys":[],"rowKeys":["labels"]}])',
	);
	expect(componentSsrSource(ssr, 'marklessRenderSsrPlain')).not.toContain(
		'marklessSsrSeedPropCells(',
	);
});

// A row handler reads its item out of the collection at resume, and resume
// matches served rows to items by reading it, so a prop collection is served.
test('SSR seeds the prop a component iterates, and nothing else of the bag', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Choices.tsrx',
		source: `
import { state } from '@markless/core';
export function Choices({ heading, choices, children }) @{
	let last = state('');
	<div>
		<h2>{heading}</h2>
		@for (const choice of choices; key choice) {
			<button onClick={() => { last = choice; }}>{choice}</button>
		}
		{children}
	</div>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrProps, [{"graphNodeId":"prop:props","keys":[],"rowKeys":["choices"]}])',
	);
});

// A text joining a prop with state re-derives after resume from the prop cell, so the
// served payload has to carry the prop or the first click drops it from the text.
for (const [component, prop, cell, tag] of [
	['NameCounter', 'name', 'count', 'button'],
	['Tally', 'label', 'hits', 'p'],
] as const)
	test(`SSR seeds the \`${prop}\` prop a joined text reads beside state`, async () => {
		const result = await compileTsrxModule({
			filename: `src/${component}.tsrx`,
			source: `
import { state } from '@markless/core';
export function ${component}({ ${prop} }) @{
	let ${cell} = state(0);
	<${tag} onClick={() => ${cell}++}>{${prop}} {${cell}}</${tag}>
}
`,
			symbols: [],
		});

		const ssr = componentSsrSource(
			result.publicRenderModule.ssrModuleSource,
			'marklessRenderSsr',
		);
		const seed = /marklessSsrSeedPropCells\(.*, marklessSsrProps, (\[.*?\])\)/.exec(ssr)?.[1];
		expect(seed).toBeDefined();
		expect(JSON.parse(seed as string)).toEqual([
			{ graphNodeId: 'prop:props', keys: [], scalarKeys: [prop] },
		]);
	});
