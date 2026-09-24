import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import type { RuntimeDemandMapClosurePlan } from '../../compiler/src/artifacts.ts';
import { marklessRunClosureAction, type MarklessClosurePlan } from '../src/fns/closure-action.ts';
import { marklessUpdateText } from '../src/fns/update-text.ts';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createRuntimeGraphFromResumePayload } from '../src/payload-graph-construct.ts';
import { wireSyncComputedDemandRecordsWithoutLoadingCapability } from '../src/resume-sync-demand.ts';

// The differential: every action sequence runs once through compiled closures
// and once through the runtime graph full resume builds (its sync-computed
// refresh, subscriptions and DOM journal); DOM and cells must agree after each step.
const SOURCE = `import { state, computed } from '@markless/core';
const FLOOR = 0;
const CEILING = 3;
const PANES = [{ id: 'one', body: 'First pane' }, { id: 'two', body: 'Second pane' }, { id: 'three', body: 'Third pane' }];
export default function Board() @{
	let lit = state(false);
	let level = state(1);
	let pane = state('one');
	let hits = state(0);
	const litText = computed(() => (lit ? 'Lit' : 'Dark'));
	const levelText = computed(() => \`Level \${level} of \${CEILING}\`);
	const atFloor = computed(() => level <= FLOOR);
	const atCeiling = computed(() => level >= CEILING);
	const current = computed(() => PANES.find((entry) => entry.id === pane)!);
	const body = computed(() => current.body);
	<main>
		<button aria-pressed={lit ? 'true' : 'false'} onClick={() => (lit = !lit)}>Lamp</button>
		<output>{litText}</output>
		<button disabled={atFloor} onClick={() => (level = Math.max(FLOOR, level - 1))}>Down</button>
		<button disabled={atCeiling} onClick={() => (level = Math.min(CEILING, level + 1))}>Up</button>
		<p title={levelText}>{levelText}</p>
		<button aria-selected={pane === 'one' ? 'true' : 'false'} onClick={() => (pane = 'one')}>One</button>
		<button aria-selected={pane === 'two' ? 'true' : 'false'} onClick={() => { if (pane !== 'two') pane = 'two'; hits = hits + 1; }}>Two</button>
		<button aria-selected={pane === 'three' ? 'true' : 'false'} onKeydown={(event) => { if (event.key !== 'Enter') return; pane = 'three'; }}>Three</button>
		<section data-hits={hits}>Hits: {hits}</section>
		<div>{body}</div>
	</main>
}`;

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	textContent: string;
	readonly attributes: Map<string, string>;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	contains(node: unknown): boolean;
};

function element(tagName: string): FakeElement {
	const attributes = new Map<string, string>();
	const created: FakeElement = {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		textContent: '',
		attributes,
		getAttribute: (name) => attributes.get(name) ?? null,
		setAttribute: (name, value) => void attributes.set(name, value),
		removeAttribute: (name) => void attributes.delete(name),
		contains: (node) => node === created,
	};
	return created;
}

type Symbol = (context: Record<string, unknown>) => unknown;

function evaluateSymbol(source: string): Symbol {
	const body = source
		.replace(/^import .*$/gm, '')
		.replace(/^export const /gm, 'const ')
		.replace(/^export function /gm, 'function ');
	const name = /function (symbol_\d+)\(/.exec(body)![1];
	return new Function('marklessUpdateText', 'marklessWriteScalar', `${body}\nreturn ${name};`)(
		marklessUpdateText,
		marklessWriteScalar,
	);
}

async function compileBoard() {
	const compiled = await compileTsrxModule({
		filename: '/src/Board.tsrx',
		buildId: 'differential',
		resolverId: 'differential',
		symbols: [],
		source: SOURCE,
	});
	const symbols = new Map(
		compiled.symbolModules.modules.map((module) => [
			module.symbolId,
			evaluateSymbol(module.source),
		]),
	);
	return { compiled, symbols, map: compiled.runtimeDemandMaps['plain-ssr'] };
}

type Board = Awaited<ReturnType<typeof compileBoard>>;

function mountPage(board: Board) {
	const { compiled, symbols } = board;
	const view = compiled.protocolView;
	const elements = new Map(
		view.locators.map((locator) => [locator.hostNodeId, element(locator.tagName)]),
	);
	const census = [...view.locators]
		.sort((left, right) => left.index - right.index)
		.map((locator) => elements.get(locator.hostNodeId)!);
	const scripts: Record<string, { textContent: string }> = {
		'script[type="markless/state"]': { textContent: JSON.stringify(compiled.protocolState) },
		'script[type="markless/view"]': { textContent: JSON.stringify(view) },
	};
	const root = Object.assign(census[0]!, {
		__marklessCensus: census,
		querySelector: (selector: string) => scripts[selector] ?? null,
	}) as FakeElement & { __marklessEventOnlyGraph?: Map<string, unknown> };
	// Server render: every update applied from the initial cells.
	const initial = new Map(
		compiled.protocolState.cells.map((cell) => [
			cell.graphNodeId,
			(cell.value as { root: unknown }).root,
		]),
	);
	const derived = new Map<string, unknown>();
	const read = (id: string): unknown => {
		if (initial.has(id)) return initial.get(id);
		if (!derived.has(id)) {
			const node = compiled.protocolState.computed.find((entry) => entry.graphNodeId === id)!;
			derived.set(
				id,
				symbols.get(node.deriveSymbolId!)!({
					graph: { read: (next: string) => read(next) },
				}),
			);
		}
		return derived.get(id);
	};
	applyDomJournalEntries(
		view.domUpdates.map((update) =>
			symbols.get(update.symbolId!)!({ domUpdate: update, value: read(update.graphNodeId) }),
		) as never,
		{ resolveTarget: (locator) => elements.get(String(locator)) },
	);
	return { root, elements };
}

async function fullRuntime(board: Board, page: ReturnType<typeof mountPage>) {
	const { compiled, symbols } = board;
	const loadSymbol = (id: string) => symbols.get(id) as never;
	const graph = await createRuntimeGraphFromResumePayload({
		state: compiled.protocolState,
		view: compiled.protocolView,
		root: page.root as never,
		loadSymbol,
	});
	// What payload resume leaves on the root: live reads through the graph.
	const live = new Map<string, unknown>();
	live.get = (id) => graph.read(id, []);
	page.root.__marklessEventOnlyGraph = live;
	wireSyncComputedDemandRecordsWithoutLoadingCapability({
		graph,
		computed: compiled.protocolState.computed,
		root: page.root as never,
		loadSymbol,
		elementHandles: { get: () => undefined } as never,
		storeContainerSubscription: () => {},
	});
	for (const update of compiled.protocolView.domUpdates)
		graph.subscribe({
			id: `update:${update.hostNodeId}:${update.symbolId}`,
			graphNodeId: update.graphNodeId,
			path: update.path,
			run: (value) =>
				symbols.get(update.symbolId!)!({
					graph,
					element: page.elements.get(update.hostNodeId),
					domUpdate: update,
					value,
				}) as never,
		});
	graph.subscribeJournal((entries) =>
		applyDomJournalEntries(entries, {
			resolveTarget: (locator) => page.elements.get(String(locator)),
		}),
	);
	return async (action: Action) => {
		const event = action.event(page.elements.get(action.hostNodeId)!);
		await symbols.get(action.symbolId)!({
			graph,
			event,
			element: page.elements.get(action.hostNodeId),
			getElementHandle: () => undefined,
		});
		await graph.flush();
	};
}

type Action = {
	readonly hostNodeId: string;
	readonly symbolId: string;
	readonly plan: MarklessClosurePlan;
	readonly event: (target: FakeElement) => Event;
};

function actionsOf(board: Board): Action[] {
	return board.map.actions.flatMap((action) => {
		const plan = action.plan as RuntimeDemandMapClosurePlan | undefined;
		if (plan?.kind !== 'closure') return [];
		const keys = action.eventName === 'keydown' ? ['Enter', 'Tab'] : [undefined];
		return keys.map((key) => ({
			hostNodeId: action.hostNodeId,
			symbolId: plan.symbolId,
			plan,
			event: (target: FakeElement) =>
				({ type: action.eventName, target, key, preventDefault() {} }) as unknown as Event,
		}));
	});
}

function snapshot(
	board: Board,
	page: ReturnType<typeof mountPage>,
	cells: (id: string) => unknown,
) {
	return {
		dom: [...page.elements].map(([id, node]) => [
			id,
			node.textContent,
			[...node.attributes].sort(([left], [right]) => left.localeCompare(right)),
		]),
		cells: board.compiled.protocolState.cells.map((cell) => [
			cell.graphNodeId,
			cells(cell.graphNodeId),
		]),
	};
}

function servedCell(board: Board, id: string) {
	return (
		board.compiled.protocolState.cells.find((cell) => cell.graphNodeId === id)!.value as {
			root: unknown;
		}
	).root;
}

test('every closure action on the board is compiled', async () => {
	const board = await compileBoard();
	const planned = board.map.actions.filter((action) => action.plan?.kind === 'closure');
	expect(planned.map((action) => action.eventName).sort()).toEqual([
		'click',
		'click',
		'click',
		'click',
		'click',
		'keydown',
	]);
});

test('compiled closures and full resume agree after every step of every three-action sequence', async () => {
	const board = await compileBoard();
	const actions = actionsOf(board);
	const sequences: Action[][] = [];
	for (const first of actions)
		for (const second of actions)
			for (const third of actions) sequences.push([first, second, third]);
	expect(sequences.length).toBe(actions.length ** 3);
	for (const sequence of sequences) {
		const compiledPage = mountPage(board);
		const fullPage = mountPage(board);
		const runFull = await fullRuntime(board, fullPage);
		const loadSymbol = (id: string) => board.symbols.get(id);
		for (const action of sequence) {
			await marklessRunClosureAction(
				{
					root: compiledPage.root as never,
					event: action.event(compiledPage.elements.get(action.hostNodeId)!),
				},
				action.plan,
				'',
				action.hostNodeId,
				loadSymbol,
			);
			await runFull(action);
			const compiledCells = (id: string) =>
				compiledPage.root.__marklessEventOnlyGraph?.has(id)
					? compiledPage.root.__marklessEventOnlyGraph.get(id)
					: servedCell(board, id);
			const fullCells = (id: string) => fullPage.root.__marklessEventOnlyGraph!.get(id);
			expect(snapshot(board, compiledPage, compiledCells)).toEqual(
				snapshot(board, fullPage, fullCells),
			);
		}
	}
});

test('full resume after compiled closures adopts their live cells and derived values', async () => {
	const board = await compileBoard();
	const actions = actionsOf(board);
	const byHost = (hostNodeId: string) =>
		actions.find((action) => action.hostNodeId === hostNodeId)!;
	const lamp = byHost('h1');
	const up = byHost('h4');
	const two = byHost('h7');
	const reference = mountPage(board);
	const runReference = await fullRuntime(board, reference);
	const handedOff = mountPage(board);
	const loadSymbol = (id: string) => board.symbols.get(id);
	for (const action of [lamp, up, two]) {
		await runReference(action);
		await marklessRunClosureAction(
			{
				root: handedOff.root as never,
				event: action.event(handedOff.elements.get(action.hostNodeId)!),
			},
			action.plan,
			'',
			action.hostNodeId,
			loadSymbol,
		);
	}
	const runAdopted = await fullRuntime(board, handedOff);
	for (const action of [up, lamp, two, up]) {
		await runReference(action);
		await runAdopted(action);
		expect(
			snapshot(board, handedOff, (id) => handedOff.root.__marklessEventOnlyGraph!.get(id)),
		).toEqual(
			snapshot(board, reference, (id) => reference.root.__marklessEventOnlyGraph!.get(id)),
		);
	}
});

test('reaching a cell outside the closure escalates after a staged write without committing it', async () => {
	const board = await compileBoard();
	const two = actionsOf(board).find((action) => action.hostNodeId === 'h7')!;
	const page = mountPage(board);
	const before = snapshot(board, page, (id) => servedCell(board, id));
	const narrowed = { ...two.plan, cells: two.plan.cells.filter((id) => id !== 'state:hits') };
	await expect(
		marklessRunClosureAction(
			{ root: page.root as never, event: two.event(page.elements.get('h7')!) },
			narrowed,
			'',
			'h7',
			(id) => board.symbols.get(id),
		),
	).rejects.toMatchObject({ code: 'MARKLESS_SCALAR_SPECIALIZED_ESCALATE' });
	expect(
		snapshot(board, page, (id) =>
			page.root.__marklessEventOnlyGraph?.has(id)
				? page.root.__marklessEventOnlyGraph.get(id)
				: servedCell(board, id),
		),
	).toEqual(before);
});
