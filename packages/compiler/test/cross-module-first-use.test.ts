import { expect, test } from 'vitest';
import type {
	CompileTsrxModuleResult,
	RuntimeDemandMapFirstUse,
	RuntimeDemandMapFirstUsePage,
	RuntimeDemandMapFirstUseReach,
} from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

type Module = {
	readonly filename: string;
	readonly importSource?: string;
	readonly source: string;
};

async function compile(modules: ReadonlyArray<Module>) {
	const results = await compileTsrxModulesWithInterfaces(modules);
	const byFile = new Map(modules.map((module, index) => [module.filename, results[index]!]));
	return {
		result: (filename: string) => byFile.get(filename)!,
		page: (filename: string): RuntimeDemandMapFirstUsePage =>
			byFile.get(filename)!.runtimeDemandMaps.prerender.firstUsePage!,
		// The first use of the control whose handler source contains `marker`.
		firstUse: (filename: string, marker: string): RuntimeDemandMapFirstUseReach => {
			const result = byFile.get(filename)!;
			const handler = result.symbolResolver.symbols.find(
				(symbol) => symbol.kind === 'event-handler' && symbol.source.includes(marker),
			)!;
			const action = result.runtimeDemandMaps.prerender.actions.find(
				(candidate) =>
					'hostNodeId' in handler &&
					candidate.hostNodeId === handler.hostNodeId &&
					candidate.eventName === handler.eventName,
			)!;
			return action.firstUse!;
		},
	};
}

function bounded(reach: RuntimeDemandMapFirstUseReach): RuntimeDemandMapFirstUse {
	expect(reach).not.toBe('unknown');
	return reach as RuntimeDemandMapFirstUse;
}

function foreignIn(reach: RuntimeDemandMapFirstUseReach, filename: string): string[] {
	return [...(bounded(reach).foreign?.find((entry) => entry.file === filename)?.symbolIds ?? [])];
}

function symbolsOfKind(result: CompileTsrxModuleResult, kind: string): string[] {
	return result.symbolResolver.symbols
		.filter((symbol) => symbol.kind === kind)
		.map((symbol) => symbol.id);
}

const CHILD = '/workspace/src/Readout.tsrx';
const PARENT = '/workspace/src/Panel.tsrx';

const readout = (body: string): Module => ({
	filename: CHILD,
	importSource: './Readout.tsrx',
	source: `
		export default function Readout(props: { level: number; open: boolean; items: string[] }) @{
			${body}
		}
	`,
});

const panel = (markup: string): Module => ({
	filename: PARENT,
	source: `
		import { state } from '@markless/core';
		import Readout from './Readout.tsrx';
		export default function Panel() @{
			let level = state(0);
			let open = state(false);
			let items = state(['a']);
			<section>
				<button onClick={() => level++}>more</button>
				<button onClick={() => (open = !open)}>toggle</button>
				<button onClick={() => (items = [...items, 'b'])}>add</button>
				${markup}
			</section>
		}
	`,
});

test('a write passed as a prop reaches the text update in the child module', async () => {
	const { result, firstUse } = await compile([
		readout(`<p><span>{props.level}</span><em>{props.open}</em></p>`),
		panel(`<Readout level={level} open={open} items={items} />`),
	]);
	const updates = symbolsOfKind(result(CHILD), 'dom-update');
	expect(updates).toHaveLength(2);
	const more = foreignIn(firstUse(PARENT, 'level++'), CHILD);
	const toggle = foreignIn(firstUse(PARENT, 'open = !open'), CHILD);
	expect(more).toHaveLength(1);
	expect(toggle).toHaveLength(1);
	expect(more).not.toEqual(toggle);
	expect([...more, ...toggle].sort()).toEqual([...updates].sort());
	expect(bounded(firstUse(PARENT, 'level++')).runtimeModuleIds).toContain('web/fns/update-text');
});

test('a prop that flips an @if in the child reaches the flip and the arm handlers', async () => {
	const { result, firstUse } = await compile([
		readout(`
			<div>
				@if (props.open) {
					<p><button onClick={() => console.info('armed')}>inside</button></p>
				}
			</div>
		`),
		panel(`<Readout level={level} open={open} items={items} />`),
	]);
	const child = result(CHILD);
	const toggle = foreignIn(firstUse(PARENT, 'open = !open'), CHILD);
	expect(toggle).toEqual(
		expect.arrayContaining([
			...symbolsOfKind(child, 'branch-update'),
			...symbolsOfKind(child, 'event-handler'),
		]),
	);
	expect(bounded(firstUse(PARENT, 'open = !open')).runtimeModuleIds).toContain(
		'web/resume-branches',
	);
	expect(foreignIn(firstUse(PARENT, 'level++'), CHILD)).toEqual([]);
});

test('a prop that grows a child @for reaches the row handlers and the row mint', async () => {
	const { result, firstUse } = await compile([
		readout(`
			<ul>
				@for (const item of props.items; key item) {
					<li><button onClick={() => console.info(item)}>{item}</button></li>
				}
			</ul>
		`),
		panel(`<Readout level={level} open={open} items={items} />`),
	]);
	const add = firstUse(PARENT, "items = [...items, 'b']");
	expect(foreignIn(add, CHILD)).toEqual(
		expect.arrayContaining(symbolsOfKind(result(CHILD), 'event-handler')),
	);
	expect(bounded(add).runtimeModuleIds).toEqual(
		expect.arrayContaining(['web/resume-keyed-repeats', 'web/fns/row-mint']),
	);
	expect(foreignIn(firstUse(PARENT, 'level++'), CHILD)).toEqual([]);
});

test('projected children re-render through the slot the parent owns', async () => {
	const { result, firstUse } = await compile([
		readout(`<div class="frame">{props.children}</div>`),
		panel(`<Readout level={1} open={true} items={[]}><b>{level}</b></Readout>`),
	]);
	const parent = result(PARENT);
	const slotUpdate = parent.protocolView.domUpdates.find(
		(update) => update.graphNodeId === 'state:level',
	)!;
	expect(bounded(firstUse(PARENT, 'level++')).symbolIds).toContain(slotUpdate.symbolId);
});

test('a prop forwarded through a middle module reaches the grandchild', async () => {
	const LEAF = '/workspace/src/parts/Gauge.tsrx';
	const MIDDLE = '/workspace/src/Meter.tsrx';
	const { result, firstUse } = await compile([
		{
			filename: LEAF,
			importSource: './parts/Gauge.tsrx',
			source: `
				export default function Gauge(props: { value: number }) @{
					<meter value={props.value}>{props.value}</meter>
				}
			`,
		},
		{
			filename: MIDDLE,
			importSource: './Meter.tsrx',
			source: `
				import Gauge from './parts/Gauge.tsrx';
				export default function Meter(props: { reading: number }) @{
					<figure><Gauge value={props.reading} /></figure>
				}
			`,
		},
		{
			filename: PARENT,
			source: `
				import { state } from '@markless/core';
				import Meter from './Meter.tsrx';
				export default function Panel() @{
					let reading = state(3);
					let other = state(0);
					<section>
						<button onClick={() => reading++}>up</button>
						<button onClick={() => other++}>{other}</button>
						<Meter reading={reading} />
					</section>
				}
			`,
		},
	]);
	const up = firstUse(PARENT, 'reading++');
	expect(foreignIn(up, LEAF).sort()).toEqual(symbolsOfKind(result(LEAF), 'dom-update').sort());
	expect(foreignIn(firstUse(PARENT, 'other++'), LEAF)).toEqual([]);
});

test('an imported child inside a parent @if arm is created whole when the arm opens', async () => {
	const { result, firstUse } = await compile([
		readout(`
			<p onClick={() => console.info('child click')}>
				<span>{props.level}</span>
			</p>
		`),
		panel(`
			@if (open) {
				<Readout level={level} open={open} items={items} />
			}
		`),
	]);
	const child = result(CHILD);
	expect(foreignIn(firstUse(PARENT, 'open = !open'), CHILD).sort()).toEqual(
		child.symbolResolver.symbols.map((symbol) => symbol.id).sort(),
	);
});

test('a same-module child re-renders through its props', async () => {
	const { result, firstUse } = await compile([
		{
			filename: PARENT,
			source: `
				import { state } from '@markless/core';
				function Badge(props: { count: number }) @{
					<b>{props.count}</b>
				}
				export default function Panel() @{
					let count = state(0);
					let note = state('');
					<section>
						<button onClick={() => count++}>more</button>
						<button onClick={() => (note = 'x')}>{note}</button>
						<Badge count={count} />
					</section>
				}
			`,
		},
	]);
	const badgeUpdate = result(PARENT).protocolView.domUpdates.find(
		(update) => update.graphNodeId.startsWith('prop:') && update.path?.[0] === 'count',
	)!;
	expect(bounded(firstUse(PARENT, 'count++')).symbolIds).toContain(badgeUpdate.symbolId);
	expect(bounded(firstUse(PARENT, "note = 'x'")).symbolIds).not.toContain(badgeUpdate.symbolId);
});

test('a child whose interface is missing leaves its prop changes and resume start unknown', async () => {
	const { firstUse, page } = await compile([
		// Compiled without an import source, so the parent links no interface for it.
		{ ...readout(`<span>{props.level}</span>`), importSource: './elsewhere.tsrx' },
		panel(`<Readout level={level} open={false} items={[]} />`),
	]);
	expect(firstUse(PARENT, 'level++')).toBe('unknown');
	// Resume start runs the child whichever control wakes it, so the page stays unbounded.
	expect(page(PARENT).resume).toBe('unknown');
});

test('resume start derives a composed child computed collection whichever control wakes it', async () => {
	const { result, firstUse, page } = await compile([
		{
			filename: CHILD,
			importSource: './Readout.tsrx',
			source: `
				import { computed, state } from '@markless/core';
				export default function Readout(props: { level: number }) @{
					const rows = state(['a', 'b']);
					const shown = computed(() => rows.filter((row) => row !== 'b'));
					<ul>
						@for (const row of shown; key row) {
							<li>{row}</li>
						}
					</ul>
				}
			`,
		},
		panel(`<Readout level={1} />`),
	]);
	const derive = symbolsOfKind(result(CHILD), 'sync-computed-derive');
	expect(derive).toHaveLength(1);
	// Published once for the page, not repeated on each action.
	expect(foreignIn(page(PARENT).resume, CHILD)).toEqual(derive);
	expect(foreignIn(firstUse(PARENT, 'level++'), CHILD)).toEqual([]);
	expect(bounded(page(CHILD).resume).symbolIds).toEqual(derive);
});

const picker = (markup: string): Module => ({
	filename: CHILD,
	importSource: './Readout.tsrx',
	source: `
		import { state } from '@markless/core';
		export default function Readout(props: { onPick: (value: string) => void; title: string }) @{
			let local = state(0);
			<div>
				<button onClick={() => props.onPick('a')}>pick</button>
				<button onClick={() => local++}>{local}</button>
				${markup}
			</div>
		}
	`,
});

test('a handler calling a prop names the call; the composing module publishes what it runs', async () => {
	const { result, firstUse, page } = await compile([
		picker(''),
		{
			filename: PARENT,
			source: `
				import { state } from '@markless/core';
				import Readout from './Readout.tsrx';
				export default function Panel() @{
					let chosen = state('');
					<section>
						<p>{chosen}</p>
						<Readout title="x" onPick={(value) => (chosen = value)} />
					</section>
				}
			`,
		},
	]);
	const pick = bounded(firstUse(CHILD, "props.onPick('a')"));
	expect(pick.calls).toEqual([{ prop: 'onPick' }]);
	expect(bounded(firstUse(CHILD, 'local++')).calls).toBeUndefined();
	const passed = page(PARENT).passedProps;
	expect(passed.map((entry) => [entry.file, entry.prop])).toEqual([[CHILD, 'onPick']]);
	const parent = result(PARENT);
	const chosenUpdate = parent.protocolView.domUpdates.find(
		(update) => update.graphNodeId === 'state:chosen',
	)!;
	expect(bounded(passed[0]!.reach as RuntimeDemandMapFirstUseReach).symbolIds).toEqual(
		expect.arrayContaining([...symbolsOfKind(parent, 'callback-prop'), chosenUpdate.symbolId]),
	);
});

test('a forwarded or spread prop names the composing module prop, and opaque code is unknown', async () => {
	const MIDDLE = '/workspace/src/Frame.tsrx';
	const { page } = await compile([
		picker(''),
		{
			filename: MIDDLE,
			importSource: './Frame.tsrx',
			source: `
				import Readout from './Readout.tsrx';
				export function Frame({ title, ...rest }: { title: string; onPick: (value: string) => void }) @{
					<Readout title={title} {...rest} />
				}
				export function Relay(props: { handler: (value: string) => void }) @{
					<Readout title="relay" onPick={props.handler} />
				}
			`,
		},
		{
			filename: PARENT,
			source: `
				import Readout from './Readout.tsrx';
				import { pickers } from './pickers.ts';
				export default function Panel() @{
					<Readout title="x" onPick={pickers.first} />
				}
			`,
		},
	]);
	const middle = page(MIDDLE).passedProps;
	expect(middle).toContainEqual({ file: CHILD, excludeNames: ['title'], reach: 'same-prop' });
	expect(middle).toContainEqual({
		file: CHILD,
		prop: 'onPick',
		reach: { symbolIds: [], runtimeModuleIds: [], calls: [{ prop: 'handler' }] },
	});
	expect(page(PARENT).passedProps).toEqual([{ file: CHILD, prop: 'onPick', reach: 'unknown' }]);
});

test('a write to a page-space cell names the cell; each reading module publishes what re-runs', async () => {
	const READER = '/workspace/src/Badge.tsrx';
	const { result, firstUse, page } = await compile([
		{
			filename: CHILD,
			importSource: './Readout.tsrx',
			source: `
				import { shared, state } from '@markless/core';
				export const session = shared(() => {
					const box = state({ count: 0, label: 'a' });
					return { ...box };
				});
				export default function Readout() @{
					const current = session();
					<button onClick={() => current.count++}>{current.label}</button>
				}
			`,
		},
		{
			filename: READER,
			source: `
				import { session } from './Readout.tsrx';
				export default function Badge() @{
					const current = session();
					<b>{current.count}</b>
				}
			`,
		},
	]);
	const bump = bounded(firstUse(CHILD, 'current.count++'));
	expect(bump.pageSpaceWrites).toHaveLength(1);
	const [cell] = bump.pageSpaceWrites!;
	expect(cell).toMatch(/^shared:/);
	const reader = page(READER).pageSpaceReaders.find((entry) => entry.graphNodeId === cell)!;
	expect(bounded(reader.reach).symbolIds).toEqual(
		expect.arrayContaining(symbolsOfKind(result(READER), 'dom-update')),
	);
});

test('a widget part invoking a callback slot names the slot the root binds to its prop', async () => {
	const { firstUse, page } = await compile([
		{
			filename: CHILD,
			importSource: './Readout.tsrx',
			source: `
				import { shared, state } from '@markless/core';
				export const switchState = shared(
					() => {
						const box = state({ on: false });
						return {
							...box,
							onToggle: undefined as ((on: boolean) => void) | undefined,
							flip() {
								box.on = !box.on;
								box.onToggle?.(box.on);
							},
						};
					},
					{ scope: 'widget' },
				);
				export function SwitchRoot({ onToggle, children }: { onToggle?: (on: boolean) => void; children?: unknown }) @{
					const current = switchState();
					current.onToggle = onToggle;
					<div>{children}</div>
				}
				export function SwitchButton() @{
					const current = switchState();
					<button onClick={() => current.flip()}>{current.on ? 'on' : 'off'}</button>
				}
			`,
		},
	]);
	// The factory method body is inlined into the part's handler.
	const flip = bounded(firstUse(CHILD, 'box.on = !box.on'));
	const slots = (flip.calls ?? []).flatMap((call) => ('slot' in call ? [call.slot] : []));
	expect(slots).toHaveLength(1);
	expect(page(CHILD).callbackSlots).toEqual([{ slot: slots[0], prop: 'onToggle' }]);
});

test('reach follows structure, not the names in one fixture', async () => {
	const LEAF = '/app/widgets/Dial.tsrx';
	const HOST = '/app/screens/Console.tsrx';
	const { result, firstUse } = await compile([
		{
			filename: LEAF,
			importSource: '../widgets/Dial.tsrx',
			source: `
				export function Dial({ angle, label }: { angle: number; label: string }) @{
					<label>
						<output>{label}</output>
						@if (angle > 90) {
							<strong onPointerdown={() => console.info('steep')}>steep</strong>
						}
					</label>
				}
			`,
		},
		{
			filename: HOST,
			source: `
				import { state } from '@markless/core';
				import { Dial } from '../widgets/Dial.tsrx';
				export function Console() @{
					let caption = state('north');
					let turn = state(0);
					<main>
						<Dial label={caption} angle={turn} />
						<input onInput={() => (turn = turn + 45)} />
						<a onKeydown={() => (caption = 'south')}>rename</a>
					</main>
				}
			`,
		},
	]);
	const leaf = result(LEAF);
	const rename = foreignIn(firstUse(HOST, "caption = 'south'"), LEAF);
	const turn = foreignIn(firstUse(HOST, 'turn + 45'), LEAF);
	expect(rename).toEqual(symbolsOfKind(leaf, 'dom-update'));
	expect(turn).toEqual(
		expect.arrayContaining([
			...symbolsOfKind(leaf, 'branch-update'),
			...symbolsOfKind(leaf, 'event-handler'),
		]),
	);
	expect(turn).not.toEqual(expect.arrayContaining(symbolsOfKind(leaf, 'dom-update')));
});
