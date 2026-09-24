import { marklessAttributeValue } from '../dom-attribute.ts';
import { marklessDecodeScalarCell, marklessScalarSpecializedError } from './scalar-specialized.ts';
import { marklessScalarLocate, marklessServedDomUpdate } from './scalar-served.ts';

// Mirrors RuntimeDemandMapClosurePlan; ids are the compiling module's own.
export type MarklessClosurePlan = {
	readonly symbolId: string;
	readonly cells: ReadonlyArray<string>;
	readonly computed: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly deriveSymbolId: string;
	}>;
	readonly updates: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly symbolId: string;
	}>;
};
type ClosureSymbol = (context: Record<string, unknown>) => unknown;
type LoadSymbol = (symbolId: string) => unknown;
type ServedState = {
	readonly s: Element;
	readonly c: Map<string, Parameters<typeof marklessDecodeScalarCell>[0]>;
	readonly d: Map<string, string | undefined>;
};
type ClosureRoot = Element & {
	__marklessEventOnlyGraph?: Map<string, unknown>;
	__marklessClosureState?: ServedState;
};
export type MarklessClosureInput = {
	readonly root: ClosureRoot;
	readonly event: Event | 0;
	readonly syncPolicyAlreadyApplied?: boolean;
};
type JournalEntry = {
	readonly type?: unknown;
	readonly name?: unknown;
	readonly value?: unknown;
};

const ESCALATE = 'MARKLESS_SCALAR_SPECIALIZED_ESCALATE';
const escalate = (site: string): never => marklessScalarSpecializedError(ESCALATE, site);
const STORE_REFUSED = [
	'call',
	'delete',
	'readShared',
	'writeShared',
	'getSharedDefinition',
	'listSharedDefinitions',
	'subscribe',
	'subscribeWrite',
	'subscribeJournal',
	'takeJournal',
	'applySharedPatch',
	'takeSharedPatches',
];

const servedState = (r: ClosureRoot): ServedState => {
	const s = r.querySelector('script[type="markless/state"]');
	if (!s) return escalate('state');
	if (r.__marklessClosureState?.s === s) return r.__marklessClosureState;
	let parsed: {
		readonly cells?: ReadonlyArray<{ readonly graphNodeId?: string } | null>;
		readonly computed?: ReadonlyArray<{
			readonly graphNodeId?: string;
			readonly deriveSymbolId?: string;
		} | null>;
	} | null = null;
	try {
		parsed = JSON.parse(s.textContent || 'null');
	} catch {}
	if (!parsed) return escalate('state');
	return (r.__marklessClosureState = {
		s,
		c: new Map(
			(parsed.cells ?? []).flatMap((cell) =>
				cell?.graphNodeId ? [[cell.graphNodeId, cell]] : [],
			),
		),
		d: new Map(
			(parsed.computed ?? []).flatMap((node) =>
				node?.graphNodeId ? [[node.graphNodeId, node.deriveSymbolId]] : [],
			),
		),
	});
};

const readPath = (value: unknown, path: ReadonlyArray<string> = []): unknown => {
	for (const part of path) {
		if (value == null) return undefined;
		value = (value as Record<string, unknown>)[part];
	}
	return value;
};

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	!!value && typeof (value as { then?: unknown }).then === 'function';

// Every symbol a closure runs, loaded together so a primed host's first click takes no module hop.
export const marklessPrimeClosure = (
	plan: MarklessClosurePlan,
	scope: string,
	loadSymbol: LoadSymbol,
): Promise<ReadonlyArray<ClosureSymbol>> =>
	Promise.all(
		[
			plan.symbolId,
			...plan.computed.map((node) => node.deriveSymbolId),
			...plan.updates.map((update) => update.symbolId),
		].map((id) => loadSymbol(scope + id) as ClosureSymbol | Promise<ClosureSymbol>),
	);

/**
 * Runs the action's real handler against a store of exactly its closure's cells,
 * re-derives the closure's computeds, and applies its text and attribute
 * updates. Nothing commits until every update is known: a read or write outside
 * the closure throws the escalation, and full resume replays the event.
 */
export async function marklessRunClosureAction(
	input: MarklessClosureInput,
	plan: MarklessClosurePlan,
	scope: string,
	hostNodeId: string,
	loadSymbol: LoadSymbol,
	syncPolicy?: unknown,
): Promise<void> {
	const { root } = input;
	let syncPolicyAlreadyApplied = input.syncPolicyAlreadyApplied === true;
	try {
		const symbols = await marklessPrimeClosure(plan, scope, loadSymbol);
		const host = marklessScalarLocate(root, hostNodeId, -1, '*');
		if (!host) return escalate('host');
		const q = (id: string) => scope + id;
		const served = servedState(root);
		const values = (root.__marklessEventOnlyGraph ||= new Map());
		const cellIds = new Set(plan.cells.map(q));
		for (const id of cellIds) {
			if (values.has(id)) continue;
			const cell = served.c.get(id);
			if (!cell) return escalate('cell');
			values.set(id, marklessDecodeScalarCell(cell, id, `markless/state cell ${id}`));
		}
		const derives = new Map<string, ClosureSymbol>();
		plan.computed.forEach((node, index) => {
			if (served.d.get(q(node.graphNodeId)) !== q(node.deriveSymbolId)) escalate('computed');
			derives.set(q(node.graphNodeId), symbols[index + 1]!);
		});
		const targets = plan.updates.map((update, index) => {
			const target = marklessServedDomUpdate(
				root,
				q(update.symbolId),
				q(update.graphNodeId),
				update.path,
			);
			return target
				? ([...target, symbols[plan.computed.length + 1 + index]!] as const)
				: escalate('update-target');
		});

		const staged = new Map<string, unknown>();
		const memo = new Map<string, unknown>();
		let dirty = false;
		const cellValue = (id: string) => (staged.has(id) ? staged.get(id) : values.get(id));
		const set = (id: string, value: unknown) => {
			if (Object.is(cellValue(id), value)) return;
			staged.set(id, value);
			memo.clear();
			dirty = true;
		};
		const refuse = () => escalate('handle');
		const readNode = (id: string): unknown => {
			if (cellIds.has(id)) return cellValue(id);
			if (memo.has(id)) return memo.get(id);
			const derive = derives.get(id);
			if (!derive) return escalate('read');
			const value = derive({
				graph,
				read: graph.read,
				element: root,
				getElementHandle: refuse,
			});
			if (isThenable(value)) return escalate('derive');
			memo.set(id, value);
			return value;
		};
		const writable = (id: string, path: ReadonlyArray<string> | undefined) =>
			cellIds.has(id) && !path?.length ? id : escalate('write');
		const graph: Record<string, unknown> & {
			read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
		} = {
			// Asked only before a write, so a cell outside the closure escalates rather than failing the write.
			hasCell: (graphNodeId: string) => !!writable(q(graphNodeId), undefined),
			read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
				readPath(readNode(q(graphNodeId)), path),
			write(write: { graphNodeId: string; path?: ReadonlyArray<string>; value: unknown }) {
				set(writable(q(write.graphNodeId), write.path), write.value);
			},
			update(update: {
				graphNodeId: string;
				path?: ReadonlyArray<string>;
				returnValue?: 'previous' | 'next';
				update: (value: unknown) => unknown;
			}) {
				const id = writable(q(update.graphNodeId), update.path);
				const previous = cellValue(id);
				const next = update.update(previous);
				set(id, next);
				return update.returnValue === 'previous'
					? previous
					: update.returnValue === 'next'
						? next
						: undefined;
			},
			async flush() {},
		};
		for (const name of STORE_REFUSED) graph[name] = () => escalate(name);

		if (syncPolicy && !syncPolicyAlreadyApplied) {
			const { runSyncPolicyActions } = await import('../inline/sync-policy-core.ts');
			runSyncPolicyActions(syncPolicy as never, graph as never, input.event as never);
			syncPolicyAlreadyApplied = true;
		}
		let failure: { readonly error: unknown } | undefined;
		try {
			const result = symbols[0]!({
				graph,
				event: input.event,
				element: host,
				getElementHandle: refuse,
				invokeCallback: refuse,
				invokeSymbol: refuse,
			});
			if (isThenable(result)) await result;
		} catch (error) {
			if ((error as { readonly code?: unknown } | null)?.code === ESCALATE) throw error;
			// A thrown handler still commits what it wrote before throwing, as the full runtime's flush does.
			failure = { error };
		}
		if (dirty) {
			const entries = targets.map(([record, element, update]) => {
				const entry = update({
					graph,
					element,
					getElementHandle: refuse,
					domUpdate: record,
					value: readPath(readNode(record.graphNodeId), record.path),
				}) as JournalEntry | null | undefined;
				if (entry?.type !== 'setText' && entry?.type !== 'setAttr')
					return escalate('update');
				return [element, entry] as const;
			});
			for (const [id, value] of staged) values.set(id, value);
			for (const [id, value] of memo) values.set(id, value);
			for (const [element, entry] of entries) {
				if (entry.type === 'setText') {
					const text = entry.value == null ? '' : String(entry.value);
					if (element.textContent !== text) element.textContent = text;
					continue;
				}
				const name = String(entry.name);
				const text = marklessAttributeValue(name, entry.value);
				if (text === null) element.removeAttribute(name);
				else if (element.getAttribute(name) !== text) element.setAttribute(name, text);
			}
		}
		if (failure) throw failure.error;
	} catch (error) {
		if ((error as { code?: unknown } | null)?.code === ESCALATE)
			(error as { syncPolicyAlreadyApplied?: boolean }).syncPolicyAlreadyApplied =
				syncPolicyAlreadyApplied;
		throw error;
	}
}

type RoutedRecord = {
	readonly hostNodeId: string;
	readonly symbolIds?: ReadonlyArray<string>;
	readonly action?: unknown;
	readonly syncPolicy?: unknown;
};
type LoadPlan = (symbolId: string) => unknown;

// A composed instance's own handler: one symbol spelled under a component instance path, never a row or bound id.
export const marklessClosureRouted = (record: RoutedRecord): boolean =>
	!record.action &&
	record.symbolIds?.length === 1 &&
	/^(?:[cp]\d+:)+symbol:/.test(record.symbolIds[0]!);

const routedPlan = async (
	record: RoutedRecord,
	loadPlan: LoadPlan,
): Promise<readonly [MarklessClosurePlan, string]> => {
	const symbolId = record.symbolIds![0]!;
	const plan = (await loadPlan(symbolId)) as MarklessClosurePlan | undefined;
	if (!plan || !symbolId.endsWith(plan.symbolId)) return escalate('routed-plan');
	return [plan, symbolId.slice(0, symbolId.length - plan.symbolId.length)];
};

export const marklessPrimeRoutedClosure = async (
	record: RoutedRecord,
	loadPlan: LoadPlan,
	loadSymbol: LoadSymbol,
): Promise<void> => {
	const [plan, scope] = await routedPlan(record, loadPlan);
	await marklessPrimeClosure(plan, scope, loadSymbol);
};

export const marklessRunRoutedClosure = async (
	input: MarklessClosureInput,
	record: RoutedRecord,
	loadPlan: LoadPlan,
	loadSymbol: LoadSymbol,
): Promise<void> => {
	const [plan, scope] = await routedPlan(record, loadPlan);
	await marklessRunClosureAction(
		input,
		plan,
		scope,
		record.hostNodeId,
		loadSymbol,
		record.syncPolicy,
	);
};
