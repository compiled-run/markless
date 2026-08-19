import type { RuntimeGraph } from '@markless/runtime';
import { installComposedArmRecordQualifier } from '../resume-arm-records.ts';
import type { ResumeArmRecordSet, ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

// A composed child's compiled symbols spell the child module's own graph node
// ids, but composition merged that child's nodes into the page graph under its
// instance path. The symbol id carries the same path, so every loader — the
// bundler's symbol route, the dev harness, a test's own loadSymbol — recovers
// the instance from the id it was asked for. INSTANCE_PATH restates the
// serializer's grammar; composed-page-space.test.ts keeps the two in step.
const INSTANCE_PATH = /^(?:[cp]\d+:)+/;

// The one reading of a prefix as an instance path; host-minted prefixes (router `m<n>:`) are not one.
export function marklessInstancePath(prefix: string | undefined): string {
	return (prefix && INSTANCE_PATH.exec(prefix)?.[0]) || '';
}

// A symbol loaded through the child's own composed loader already answers in
// page space, so resume must not scope it a second time.
const composedSymbols = new WeakSet<object>();

export function marklessMarkComposedSymbol<T extends object>(symbol: T): T {
	composedSymbols.add(symbol);
	return symbol;
}

export function marklessInstanceScopedLoadSymbol(
	loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>,
): (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol> {
	return (symbolId: string) => {
		const instancePath = INSTANCE_PATH.exec(symbolId)?.[0];
		if (!instancePath) return loadSymbol(symbolId);
		const loaded = loadSymbol(symbolId);
		return typeof (loaded as Promise<ResumeSymbol>)?.then === 'function'
			? (loaded as Promise<ResumeSymbol>).then((symbol) => scopeSymbol(symbol, instancePath))
			: scopeSymbol(loaded as ResumeSymbol, instancePath);
	};
}

function scopeSymbol(symbol: ResumeSymbol, instancePath: string): ResumeSymbol {
	if (composedSymbols.has(symbol)) return symbol;
	return (context: ResumeSymbolContext) =>
		symbol({
			...context,
			graph: marklessInstanceScopedGraph(context.graph, instancePath),
			...(context.read
				? {
						read: (graphNodeId: string, path?: ReadonlyArray<string>) =>
							context.graph.read(instancePath + graphNodeId, path),
					}
				: {}),
		});
}

// Only ids the symbol itself spells are child-local. Shared definitions and the
// graph's own bookkeeping (journal, flush, subscriptions by record id) stay in
// page space.
export function marklessInstanceScopedGraph(
	graph: RuntimeGraph,
	instancePath: string,
): RuntimeGraph {
	if (!instancePath) return graph;
	const qualify = (graphNodeId: string) => instancePath + graphNodeId;
	return {
		...graph,
		read: (graphNodeId, path) => graph.read(qualify(graphNodeId), path),
		write: (write) => graph.write({ ...write, graphNodeId: qualify(write.graphNodeId) }),
		update: (update) => graph.update({ ...update, graphNodeId: qualify(update.graphNodeId) }),
		call: (call) => graph.call({ ...call, graphNodeId: qualify(call.graphNodeId) }),
		delete: (deletion) =>
			graph.delete({ ...deletion, graphNodeId: qualify(deletion.graphNodeId) }),
		subscribe: (subscription) =>
			graph.subscribe({
				...subscription,
				graphNodeId: qualify(subscription.graphNodeId),
			}),
	};
}

// Mirrors PROTOCOL_PAGE_SPACE_ID_PREFIXES, past any instance path a nested
// compose already applied; composed-page-space.test.ts keeps the two in step so
// the browser never imports the serializer's protocol module.
const PAGE_SPACE_ID = /^(?:[cp]\d+:)*(?:shared|storage):/;

// Every id family a component owns is instance-local; a shared() graph and a
// persisted storage slot are page-space on purpose. The compiler refuses at
// build time to emit an id belonging to neither, so this stays a concatenation.
export function marklessComposedGraphNodeId(graphNodeId: string, instancePath: string): string {
	if (!instancePath || PAGE_SPACE_ID.test(graphNodeId)) return graphNodeId;
	return instancePath + graphNodeId;
}

// Composed child-owned boundaries load their update symbol through the
// instance prefix riding boundary.id (c0:boundary:1 -> prefix "c0:"). The
// arm-render module mints records in the child module's own id space, so
// committed host, symbol, arm-branch, AND graph node ids take the same prefix
// before registration — host ids join the page-wide host map, symbol ids
// resolve through the same prefix routes the update symbol itself resolved
// through, and graph reads land on the instance's own cells (the child's nodes
// were merged into the page graph under this path). Page-space ids (shared,
// storage) are excepted by marklessComposedGraphNodeId.
function composedBoundaryArmRecords(
	boundaryId: string,
	set: ResumeArmRecordSet,
): ResumeArmRecordSet {
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
	} satisfies Record<keyof ResumeArmRecordSet, true>;
	void exhaustive;
	const prefix = boundaryId.slice(0, boundaryId.lastIndexOf('boundary:'));
	if (!prefix) return set;
	// Host/symbol ids take the whole prefix; graph ids only its instance-path part.
	const instancePath = marklessInstancePath(prefix);
	const prefixHost = <T extends { readonly hostNodeId: string }>(record: T): T => ({
		...record,
		hostNodeId: prefix + record.hostNodeId,
	});
	const qualifyRead = <T extends { readonly graphNodeId: string }>(read: T): T => ({
		...read,
		graphNodeId: marklessComposedGraphNodeId(read.graphNodeId, instancePath),
	});
	// Arm-scoped branch records ride the protocol's untyped record bag.
	const qualifyLooseRead = (record: Record<string, unknown>): Record<string, unknown> =>
		typeof record.graphNodeId === 'string'
			? { ...record, graphNodeId: marklessComposedGraphNodeId(record.graphNodeId, instancePath) }
			: record;
	return {
		locators: set.locators.map(prefixHost),
		events: set.events.map((event) => ({
			...prefixHost(event),
			symbolIds: event.symbolIds.map((symbolId) => prefix + symbolId),
		})),
		domUpdates: set.domUpdates?.map((update) => ({
			...prefixHost(qualifyRead(update)),
			...(update.symbolId ? { symbolId: prefix + update.symbolId } : {}),
		})),
		behaviors: set.behaviors.map((behavior) => ({
			...prefixHost(behavior),
			...(behavior.inputGraphReads
				? { inputGraphReads: behavior.inputGraphReads.map(qualifyRead) }
				: {}),
			...(behavior.symbolId ? { symbolId: prefix + behavior.symbolId } : {}),
		})),
		elementHandles: set.elementHandles.map(prefixHost),
		keyedRepeats: set.keyedRepeats?.map((repeat) => ({
			...repeat,
			id: prefix + repeat.id,
			parentHostNodeId: prefix + repeat.parentHostNodeId,
			...(repeat.collectionGraphNodeId
				? {
						collectionGraphNodeId: marklessComposedGraphNodeId(
							repeat.collectionGraphNodeId,
							instancePath,
						),
					}
				: {}),
			rowEvents: repeat.rowEvents.map((event) => ({
				...event,
				symbolIds: event.symbolIds.map((symbolId) => prefix + symbolId),
			})),
		})),
		...(set.branches
			? {
					branches: set.branches.map((branch) => ({
						...branch,
						id: prefix + branch.id,
						testReads: branch.testReads.map(qualifyRead),
						...(branch.symbolId ? { symbolId: prefix + branch.symbolId } : {}),
						...(branch.armRecords
							? {
									armRecords: branch.armRecords.map((arm) => ({
										...arm,
										events: (arm.events ?? []).map((event) => ({
											...event,
											symbolIds: (event.symbolIds ?? []).map(
												(symbolId) => prefix + symbolId,
											),
										})),
										domUpdates: (arm.domUpdates ?? []).map((update) => ({
											...qualifyLooseRead(update),
											...(update.symbolId
												? { symbolId: prefix + update.symbolId }
												: {}),
										})),
									})),
								}
							: {}),
					})),
				}
			: {}),
	};
}

/**
 * Teaches this app's settle path to re-spell a composed child's arm records in
 * page space. The bundler emits a call to it in the generated source/resume
 * module when, and only when, the page has component edges (the same gate that
 * emits its symbol routes), so a non-composing page never loads this module and
 * its settle path registers arm records untouched. The call is explicit because
 * `@markless/web` declares `sideEffects: false`.
 */
export function installMarklessComposedArmRecords(): void {
	installComposedArmRecordQualifier(composedBoundaryArmRecords);
}
