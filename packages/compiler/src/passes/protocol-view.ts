import {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	type ProtocolRowTemplateSlotValue,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { repeatRowSiblingElements } from './render-data/row-position.ts';
import { elementAddress } from './semantic-graph/projection-placement.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	ProtocolViewArmRecordSet,
	ProtocolViewPayloadInput,
	ProtocolViewPayloadWithArmRecords,
	RenderDataArtifact,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../artifacts.ts';
import { armChildRead, armHostPaths, type ArmHostPlacement } from './arm-child-content.ts';
import {
	expressionSlotValue,
	mintableSlotValue,
	payloadRecordHosts,
	resolveRowChunkMint,
	resolveRowComponentMint,
	type RowComponentMint,
} from './row-mint.ts';
import { forwardedSpreadViewRecords } from './spread-forwarding.ts';
import { addressedHostNodeIds } from '../artifact-helpers/addressed-hosts.ts';
import { armEscalationCandidateSiteIds } from './symbol-modules.ts';

function renderDataOf(input: ProtocolViewPayloadInput): RenderDataArtifact {
	if (!input.renderData) {
		throw new Error('createProtocolViewPayload requires the registered renderData artifact.');
	}
	return input.renderData;
}

export function createProtocolViewPayload(
	input: ProtocolViewPayloadInput,
): ProtocolViewPayloadWithArmRecords {
	const boundEventSymbols = boundEventSymbolIds(input);
	const boundDomUpdateSymbols = boundDomUpdateSymbolIds(input);
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
	const asyncRunnerSymbols = new Map<string, string>();

	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
			eventSymbols.set(key, symbols);
		}

		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				boundDomUpdateSymbols.get(symbol.id) ?? symbol.id,
			);
		}

		if (symbol.kind === 'async-computed-runner') {
			asyncRunnerSymbols.set(symbol.graphNodeId, symbol.id);
		}
	}

	// Branch-arm hosts and async-boundary-arm hosts leave every flat stream:
	// their records ride armRecords in the owning range's coordinate space,
	// since page-absolute locators cannot name elements a flip or an async
	// settle replaces (D3).
	const flipArmHostIds = armHostIds(input);
	const excludedHostIds = new Set([...flipArmHostIds, ...boundaryArmHostIds(input)]);
	// The consumer props a composed child's `{...rest}` carries onto its own
	// elements. Joined here, at build time, they are ordinary view records.
	const forwarded = forwardedSpreadViewRecords(input);
	const keyedRepeats = resumableKeyedRepeats(input);
	// A branch a row template flips is flipped per row; the page record would name one row's anchors.
	const rowFlippedBranchIds = new Set(
		keyedRepeats.flatMap((repeat) =>
			('rowTemplate' in repeat ? (repeat.rowTemplate?.branchSlots ?? []) : []).map(
				(branch) => branch.branchId,
			),
		),
	);
	return withAddressedLocators({
		version: ASYNC_PROTOCOL_VERSION,
		...optionalAsyncRunnerRegistry(input, asyncRunnerSymbols),
		locators: [
			...input.payloadArena.view.locators.filter(
				(locator) => !excludedHostIds.has(locator.hostNodeId),
			),
			...forwarded.locators,
		],
		events: mergeForwardedEvents(
			oneRecordPerEvent(input.payloadArena.view.events)
				.filter((event) => !excludedHostIds.has(event.hostNodeId))
				.map((event) => ({
					hostNodeId: event.hostNodeId,
					eventName: event.eventName,
					syncPolicy: event.syncPolicy,
					symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
				})),
			forwarded.events,
		),
		domUpdates: [
			...input.payloadArena.view.domUpdates
				.filter((domUpdate) => !flipArmHostIds.has(domUpdate.hostNodeId))
				.map((domUpdate) => ({
					...domUpdate,
					symbolId: domUpdateSymbols.get(
						`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
					),
				})),
			...forwarded.domUpdates,
		],
		behaviors: withBehaviorSymbols(
			input,
			input.payloadArena.view.behaviors.filter(
				(behavior) => !excludedHostIds.has(behavior.hostNodeId),
			),
		),
		elementHandles: [
			...input.payloadArena.view.elementHandles.filter(
				(handle) => !excludedHostIds.has(handle.hostNodeId),
			),
			...forwarded.elementHandles,
		],
		keyedRepeats,
		// Branch and boundary anchor pairs share one document-order stream, so
		// re-indexing allocates over the emitted union in anchorOrder.
		branches: supportedBranchRecords(input).filter((branch) => !rowFlippedBranchIds.has(branch.id)),
		asyncBoundaries: input.payloadArena.view.asyncBoundaries.map(
			({ kind: _kind, anchorOrder: _order, armRecords, ...boundary }) => ({
				...boundary,
				armRecords: armRecords.map((set, arm) =>
					wiredArmRecordSet(input, set, boundary.id, arm),
				),
				updateSymbolId: boundaryUpdateSymbols(input).get(boundary.id),
				startAnchor: {
					...boundary.startAnchor,
					index: emittedPairRank(input, boundary.id) * 2,
				},
				endAnchor: {
					...boundary.endAnchor,
					index: emittedPairRank(input, boundary.id) * 2 + 1,
				},
				asyncReads: protocolAsyncBoundaryReads(input, boundary).map((read) => ({
					...read,
					runnerSymbolId: asyncRunnerSymbols.get(read.graphNodeId),
				})),
			}),
		),
	});
}

// A host no record names is static markup: the browser never looks it up, so it gets no locator.
function withAddressedLocators<View extends { readonly locators: ReadonlyArray<{ readonly hostNodeId: string }> }>(
	view: View,
): View {
	const addressed = addressedHostNodeIds(view);
	return { ...view, locators: view.locators.filter((locator) => addressed.has(locator.hostNodeId)) };
}

function protocolAsyncBoundaryReads(
	input: ProtocolViewPayloadInput,
	// Only the boundary's reads are walked, so partially projected boundaries qualify.
	boundary: Pick<
		ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number],
		'asyncReads'
	>,
): ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['asyncReads'] {
	const computedByGraphNode = new Map(
		input.payloadArena.state.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const reads: ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['asyncReads'][number][] =
		[];
	const seen = new Set<string>();
	const visit = (graphNodeId: string, source: string, path: ReadonlyArray<string>): void => {
		const computed = computedByGraphNode.get(graphNodeId);
		if (!computed || computed.async === true) {
			if (seen.has(graphNodeId)) return;
			seen.add(graphNodeId);
			reads.push({ source, graphNodeId, path });
			return;
		}
		for (const dependency of computed.dependencies ?? []) {
			visit(dependency.graphNodeId, source, dependency.path);
		}
	};
	for (const read of boundary.asyncReads) {
		visit(read.graphNodeId, read.source, read.path);
		const computed = computedByGraphNode.get(read.graphNodeId);
		if (computed?.async === false && !seen.has(read.graphNodeId)) {
			seen.add(read.graphNodeId);
			reads.push(read);
		}
	}
	return reads;
}

function optionalAsyncRunnerRegistry(
	input: ProtocolViewPayloadInput,
	runnerSymbols: ReadonlyMap<string, string>,
): { readonly asyncRunners?: Readonly<Record<string, string>> } {
	const computedByGraphNode = new Map(
		input.payloadArena.state.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const demanded = new Set<string>();
	const visit = (graphNodeId: string): void => {
		if (demanded.has(graphNodeId)) return;
		demanded.add(graphNodeId);
		for (const dependency of computedByGraphNode.get(graphNodeId)?.dependencies ?? []) {
			if (computedByGraphNode.has(dependency.graphNodeId)) visit(dependency.graphNodeId);
		}
	};
	for (const boundary of input.payloadArena.view.asyncBoundaries) {
		for (const read of boundary.asyncReads) visit(read.graphNodeId);
	}

	const asyncRunners = Object.fromEntries(
		[...demanded].flatMap((graphNodeId) => {
			const symbolId = runnerSymbols.get(graphNodeId);
			return symbolId ? [[graphNodeId, symbolId]] : [];
		}),
	);
	return Object.keys(asyncRunners).length > 0 ? { asyncRunners } : {};
}

function domUpdateTargetKey(
	target: ProtocolViewPayloadInput['payloadArena']['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	if (target.kind === 'text') {
		return `text:${target.prefix ?? ''}:${target.suffix ?? ''}:${target.trueValue ?? ''}:${target.falseValue ?? ''}:${target.textNode ?? ''}`;
	}
	if (target.kind === 'class')
		return `class:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	return target.kind;
}

function supportedBranchIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	// armScoped branches render as anchor-less ternaries re-evaluated on arm
	// settle (need 8): no flip records, no anchor pairs.
	return new Set(
		renderDataOf(input).branches.flatMap((branch) =>
			branch.asyncBoundaryId || branch.update === 'boundary'
				? []
				: [branch.branchSiteId],
		),
	);
}

function emittedAnchorPairs(input: ProtocolViewPayloadInput) {
	const branchIds = supportedBranchIds(input);
	return [
		...(input.payloadArena.view.branchSites ?? []).filter((site) => branchIds.has(site.id)),
		...input.payloadArena.view.asyncBoundaries.map((boundary) => ({
			id: boundary.id,
			anchorOrder: boundary.anchorOrder,
		})),
	].sort((left, right) => left.anchorOrder - right.anchorOrder);
}

function emittedPairRank(input: ProtocolViewPayloadInput, id: string): number {
	return emittedAnchorPairs(input).findIndex((pair) => pair.id === id);
}

// A branch whose arms the symbol-modules pass could build no parts for, and
// whose every refusal a page re-render answers. Its flip replaces the range
// wholesale, so the per-arm plan below would double-register what the served
// arm already carries.
function escalatingBranchIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	return armEscalationCandidateSiteIds({
		source: input.source,
		semanticGraph: input.semanticGraph,
		symbolResolver: input.symbolResolver,
		captureAnalysis: input.captureAnalysis ?? {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
		renderData: input.renderData,
	} as Parameters<typeof armEscalationCandidateSiteIds>[0]);
}

function supportedBranchRecords(input: ProtocolViewPayloadInput) {
	const branchIds = supportedBranchIds(input);
	const escalatingIds = escalatingBranchIds(input);
	const branchSymbols = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'branch-update' ? [[symbol.branchSiteId, symbol] as const] : [],
		),
	);
	return (input.payloadArena.view.branchSites ?? [])
		.filter((site) => branchIds.has(site.id))
		.map((site) => ({
			...(renderDataOf(input).branches.find(
				(branch) => branch.branchSiteId === site.id,
			)?.armTests
				? {
						armTests: renderDataOf(input).branches.find(
							(branch) => branch.branchSiteId === site.id,
						)?.armTests,
					}
				: {}),
			...(renderDataOf(input).branches.find(
				(branch) => branch.branchSiteId === site.id,
			)?.declaredEmptyArms
				? {
						declaredEmptyArms: renderDataOf(input).branches.find(
							(branch) => branch.branchSiteId === site.id,
						)?.declaredEmptyArms,
					}
				: {}),
			id: site.id,
			startAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2,
			},
			endAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2 + 1,
			},
			symbolId: branchSymbols.get(site.id)?.id,
			testReads: branchSymbols.get(site.id)?.testReads ?? [],
			...branchContentReadsField(input, site.id),
			...(escalatingIds.has(site.id)
				? { escalates: true as const }
				: { armRecords: branchArmRecords(input, site.id) }),
		}));
}

/**
 * Reads an arm renders directly, with no element of its own to bind to.
 *
 * `@if (open) { <>{count}</> }` has text but no host: bound to the enclosing
 * element the update would set that element's text and erase both arms'
 * markers. These reads refresh the arm's own marker range instead, through the
 * branch's existing update symbol, so nothing outside the served arm moves.
 */
function branchContentReadsField(input: ProtocolViewPayloadInput, branchSiteId: string) {
	const reads = (input.payloadArena.view.branchContentReads ?? []).filter(
		(read) => read.branchSiteId === branchSiteId,
	);
	return reads.length > 0
		? {
				contentReads: reads.map((read) => ({
					graphNodeId: read.graphNodeId,
					path: read.path,
					source: read.source,
				})),
			}
		: {};
}

// Row event symbols already exist on the row host nodes; the record maps
// row-relative host paths to them so resume can dispatch per row instance
// with keys derived from the serialized collection by row index.
function resumableKeyedRepeats(input: ProtocolViewPayloadInput) {
	const boundEventSymbols = boundEventSymbolIds(input);
	const renderEntries = new Map(
		renderDataOf(input).repeats.map((entry) => [entry.repeatId, entry]),
	);
	// An empty key path is `key row`: the item IS the identity. Only a position
	// key leaves a row with no data identity to resume against.
	const indexKeyed = new Set(
		(input.semanticGraph?.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.indexKey === true ? [repeat.id] : [],
		),
	);
	const nestedRepeatIds = new Set(
		(input.payloadArena.view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.enclosingRepeatId ? [repeat.enclosingRepeatId] : [],
		),
	);
	const emitted = new Set<string>();
	return (input.payloadArena.view.keyedRepeats ?? []).flatMap((repeat) => {
		const render = renderEntries.get(repeat.id);
		const enclosingRow = repeat.enclosingRepeatId
			? enclosingRowField(input, repeat, renderEntries.get(repeat.enclosingRepeatId), emitted)
			: undefined;
		// A row whose only child is a component owns NO element host of its own -
		// the component's elements belong to the component's chunk - so
		// rowElementCount is 0 and this gate used to drop the record entirely.
		// The record is what carries row-order reconciliation, not just row-
		// relative event and handle coordinates, so dropping it left a widget-
		// rooting list wired for events and unable to follow its own collection.
		// The row still renders one root element per item, which is all the
		// reconcile needs.
		// An unknown row start means the parent's prefix holds a sibling whose
		// element count is only known at render time; the rows are then placed
		// from the parent's end, and only when both sides are unknown does the
		// repeat stay unresumed instead of resumed wrong.
		// A position key resumes only where nothing reads a row's key off its item.
		const positionKeyed = indexKeyed.has(repeat.id);
		if (
			!render ||
			(positionKeyed &&
				(repeat.enclosingRepeatId !== undefined ||
					nestedRepeatIds.has(repeat.id) ||
					liveRowComponentMint(input, repeat, render) !== null)) ||
			(render.rowStartOffset === 'unknown' && render.rowEndOffset === undefined) ||
			!rowRootsOneElement(input, render) ||
			enclosingRow === null
		) return [];
		emitted.add(repeat.id);
		const rowHostPaths = hostPathsForChunk(input, render.rowChunkId, true);
		// Row-owned handles ride the repeat, in row-relative coordinates, for the
		// same reason row events do: the resumed set is whatever the parent's live
		// children are right now, so a read walks rows rather than trusting a
		// registration list that a reorder or a removal would have gone stale.
		const rowElementHandles = (repeat.rowElementHandles ?? []).flatMap((handle) => {
			const hostPath = rowHostPaths.get(handle.hostNodeId);
			return hostPath
				? [{
					hostPath,
					handleId: handle.handleId,
					name: handle.name,
					...(handle.plural ? { plural: true as const } : {}),
				}]
				: [];
		});
		const built = fixedRows(input, repeat, render)
			? { fixed: true as const }
			: {
					...mintableEmptyArm(input, render),
					...mintableRowTemplate(input, render, liveRowComponentMint(input, repeat, render)),
					...mintableRowComponent(liveRowComponentMint(input, repeat, render)),
				};
		const rowEvent = (
			event: ProtocolViewPayloadInput['payloadArena']['view']['events'][number],
			hostPath: ReadonlyArray<number>,
		) => ({
			hostPath,
			eventName: event.eventName,
			symbolIds: eventSymbolsForHost(input, event.hostNodeId, event.eventName).map(
				(symbolId) => boundEventSymbols.get(symbolId) ?? symbolId,
			),
			// Cloned rows dispatch through the row record, not the template
			// host's, so dropping the policy here left every row past the
			// first with no synchronous preventDefault.
			...(event.syncPolicy ? { syncPolicy: event.syncPolicy } : {}),
		});
		const events = oneRecordPerEvent(input.payloadArena.view.events);
		const indexName = input.semanticGraph?.keyedRepeats.find(
			(candidate) => candidate.id === repeat.id,
		)?.indexName;
		const branchSlots = 'rowTemplate' in built ? (built.rowTemplate?.branchSlots ?? []) : [];
		const armEvents = branchSlots.flatMap(
			(branch, slot) => {
				const site = renderDataOf(input).branches.find(
					(candidate) => candidate.branchSiteId === branch.branchId,
				);
				return (site?.armChunkIds ?? []).flatMap((chunkId, arm) => {
					const hosts = branchArmHostPaths(input, chunkId);
					return events.flatMap((event) => {
						const path = hosts.get(event.hostNodeId)?.path;
						return path ? [{ ...rowEvent(event, path), arm: { slot, arm } }] : [];
					});
				});
			},
		);
		const rowEvents = [
			...events
				.filter((event) => rowHostPaths.has(event.hostNodeId))
				.map((event) => rowEvent(event, rowHostPaths.get(event.hostNodeId)!)),
			...armEvents,
		];
		return [
			{
				id: repeat.id,
				// Row handles walk the parent's rows, and a nested repeat's rows have no one parent.
				...(rowElementHandles.length > 0 && !enclosingRow ? { rowElementHandles } : {}),
				parentHostNodeId: outermostParentHostNodeId(input, repeat),
				...(repeat.ownerHostNodeId ? { ownerHostNodeId: repeat.ownerHostNodeId } : {}),
				...(enclosingRow ? { enclosingRow } : {}),
				collectionGraphNodeId: repeat.collectionGraphNodeId,
				collectionPath: repeat.collectionPath,
				keyPath: repeat.keyPath,
				...(positionKeyed ? { indexKey: true as const } : {}),
				...branchArmField(input, repeat),
				...asyncArmField(input, repeat),
				itemName: render.itemName,
				rowElementCount: render.rowElementCount,
				// Pay-per-use: rows that already start the parent say nothing.
				...(typeof render.rowStartOffset === 'number' && render.rowStartOffset > 0
					? { rowStartOffset: render.rowStartOffset }
					: {}),
				...(render.rowEndOffset !== undefined ? { rowEndOffset: render.rowEndOffset } : {}),
				...built,
				...(rowEvents.some((event) => handlersRead(input, event.symbolIds, indexName))
					? { indexName }
					: {}),
				rowEvents,
				...rowSuffixField(input, repeat.id, render, enclosingRow, rowEvents),
			},
		];
	});
}

// A served page marks every row host whose event carries a policy, which needs the rows' end as well as their start.
function rowSuffixField(
	input: ProtocolViewPayloadInput,
	repeatId: string,
	render: { readonly rowStartOffset?: number | 'unknown'; readonly rowEndOffset?: number },
	enclosingRow: unknown,
	rowEvents: ReadonlyArray<{ readonly syncPolicy?: unknown }>,
): { readonly rowEndOffset?: number } {
	const chunks = input.semanticGraph?.markup.chunks;
	if (
		!chunks ||
		enclosingRow ||
		render.rowEndOffset !== undefined ||
		render.rowStartOffset === 'unknown' ||
		!rowEvents.some((event) => event.syncPolicy)
	)
		return {};
	const after = repeatRowSiblingElements(chunks, repeatId, 'after');
	return after === 'unknown' ? {} : { rowEndOffset: after };
}

function handlersRead(
	input: ProtocolViewPayloadInput,
	symbolIds: ReadonlyArray<string>,
	name: string | undefined,
): boolean {
	if (!name) return false;
	const mention = new RegExp(`(^|[^\\w$.])${name}(?![\\w$])`);
	return input.symbolResolver.symbols.some(
		(symbol) =>
			symbol.kind === 'event-handler' &&
			symbolIds.some(
				(id) => id === symbol.id || id.startsWith(`bound:${encodeURIComponent(symbol.id)}:`),
			) &&
			mention.test(symbol.source ?? ''),
	);
}

// Rows written straight into a branch arm stand between its anchors only while that arm is shown.
function branchArmField(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
): { readonly branchArm?: { readonly branchId: string; readonly arm: number } } {
	if (repeat.enclosingRepeatId) return {};
	const flips = supportedBranchIds(input);
	const escalating = escalatingBranchIds(input);
	const chunks = renderDataOf(input).chunks;
	for (const branch of renderDataOf(input).branches) {
		if (!flips.has(branch.branchSiteId) || escalating.has(branch.branchSiteId)) continue;
		const hasSymbol = input.symbolResolver.symbols.some(
			(symbol) =>
				symbol.kind === 'branch-update' && symbol.branchSiteId === branch.branchSiteId,
		);
		for (const [arm, chunkId] of branch.armChunkIds.entries()) {
			const chunk = chunks.find((candidate) => candidate.id === chunkId);
			const holdsRepeat = chunk?.slots.some(
				(slot) => slot.kind === 'repeat' && slot.repeatId === repeat.id,
			);
			if (!chunk || !holdsRepeat) continue;
			if (chunk.hosts.some((host) => host.hostNodeId === repeat.parentHostNodeId)) return {};
			const onlyTheRows =
				chunk.slots.length === 1 &&
				chunk.statics.every(
					(text) => text.replace(/<!--markless-slot:\d+-->/g, '').trim() === '',
				);
			return hasSymbol && onlyTheRows
				? { branchArm: { branchId: branch.branchSiteId, arm } }
				: {};
		}
	}
	return {};
}

// Rows written straight into an async boundary arm follow it the way branch-arm rows follow theirs.
function asyncArmField(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
): { readonly branchArm?: { readonly branchId: string; readonly arm: number } } {
	if (repeat.enclosingRepeatId) return {};
	const chunks = renderDataOf(input).chunks;
	for (const boundary of renderDataOf(input).boundaries) {
		for (const name of Object.keys(ASYNC_BOUNDARY_ARM) as Array<keyof typeof ASYNC_BOUNDARY_ARM>) {
			const chunk = chunks.find((candidate) => candidate.id === boundary.armChunkIds[name]);
			const holdsRepeat = chunk?.slots.some(
				(slot) => slot.kind === 'repeat' && slot.repeatId === repeat.id,
			);
			if (!chunk || !holdsRepeat) continue;
			if (chunk.hosts.some((host) => host.hostNodeId === repeat.parentHostNodeId)) return {};
			return { branchArm: { branchId: boundary.boundaryId, arm: ASYNC_BOUNDARY_ARM[name] } };
		}
	}
	return {};
}

// A nested record's own parent renders once per enclosing row, so it names the outermost
// enclosing repeat's parent instead: every host-keyed record filter then moves it with its rows.
function outermostParentHostNodeId(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
): string {
	const enclosing = input.payloadArena.view.keyedRepeats.find(
		(candidate) => candidate.id === repeat.enclosingRepeatId,
	);
	return enclosing ? outermostParentHostNodeId(input, enclosing) : repeat.parentHostNodeId;
}

// `null` drops the record: an enclosing repeat that ships none has no rows to wire this in.
function enclosingRowField(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
	enclosing: RenderDataArtifact['repeats'][number] | undefined,
	emitted: ReadonlySet<string>,
): NonNullable<NonNullable<ProtocolViewPayload['keyedRepeats']>[number]['enclosingRow']> | null {
	if (!enclosing || !emitted.has(enclosing.repeatId)) return null;
	const parentHostPath = hostPathsForChunk(input, enclosing.rowChunkId, true).get(
		repeat.parentHostNodeId,
	);
	if (!parentHostPath) return null;
	return {
		repeatId: enclosing.repeatId,
		parentHostPath,
		...(repeat.enclosingItemPath ? { itemPath: repeat.enclosingItemPath } : {}),
	};
}

/**
 * The `@empty` arm's markup, carried only when resume can defend minting it.
 *
 * The arm was never served on a page whose list had matches at boot, so the only
 * way it can ever speak is for the client to build it - and the client has no
 * renderer, only the payload. This ships the finished markup, which is honest
 * for exactly one shape: a chunk with NO slots. Every slot is a part the mint
 * cannot fill (a text read, an attribute read, a nested construct, a child
 * component), and a half-built arm is worse than none.
 *
 * A host inside the arm that any record names is refused for the same reason.
 * The mint registers nothing, so an arm carrying an event would paint a dead
 * button. Both refusals leave the served behaviour exactly as it is today.
 *
 * Pay-per-use: a repeat with no `@empty` arm emits no field at all, so its
 * render data is byte-identical to what it was before this existed.
 */
function mintableEmptyArm(
	input: ProtocolViewPayloadInput,
	render: RenderDataArtifact['repeats'][number],
): { readonly emptyArm?: { readonly html: string } } {
	if (!render.emptyChunkId) return {};
	const chunk = renderDataOf(input).chunks.find(
		(candidate) => candidate.id === render.emptyChunkId,
	);
	if (!chunk || chunk.slots.length > 0) return {};
	const armHosts = new Set(chunk.hosts.map((host) => host.hostNodeId));
	const wired = [
		...input.payloadArena.view.events,
		...input.payloadArena.view.domUpdates,
		...input.payloadArena.view.behaviors,
		...input.payloadArena.view.elementHandles,
	].some((record) => armHosts.has(record.hostNodeId));
	if (wired) return {};
	const html = chunk.statics.join('');
	return html ? { emptyArm: { html } } : {};
}

/**
 * One row's markup, carried only when the mint can finish the row alone.
 *
 * A row appended to the collection after resume was never served, so the only
 * way it can exist is for the client to build it - and the client has no
 * renderer, only the payload. This ships the row chunk's finished markup, which
 * is honest for exactly two shapes: a row with NO slots, and a row whose every
 * slot - text or attribute - reads off the repeated item, off a graph node the
 * page holds, or through an expression the owning component's reader answers
 * (props and enclosing rows' items included). Anything else is a part the mint
 * cannot fill - a style object, an element handle's id, a nested construct, a
 * child component - and half a row is worse than none.
 *
 * The template is also how a row stays current: a row host carries no
 * per-instance locator, so the repeat ships no `domUpdates` for it, and a write
 * to a graph node a slot reads rebuilds each row whose slot values moved. A row
 * this refuses keeps the values it was served with.
 *
 * A third shape joins them once a row element WRAPS a child component: the
 * wrapper is this markup, and the child is named by identity in `rowComponent`,
 * which also carries the path of the marker its nodes replace. The mint that
 * builds such a row runs both halves.
 *
 * The slot markers stay in the html on purpose: they are the positions the row's
 * text occupies, and `textSlots` addresses them by the same fragment-relative
 * path the chunk records, so the mint walks to each one instead of re-parsing.
 * An attribute has no marker - its statics join around the missing value - so
 * `attributeSlots` addresses the element and names the attribute to write.
 * These are FRAGMENT-relative coordinates - `[0]` is the row root - not the
 * ROW-ROOT-relative ones `rowEvents[].hostPath` carries.
 *
 * Pay-per-use: a row this refuses emits no field at all, so its record is
 * byte-identical to what it was before this existed.
 */
type MintableRowTemplate = NonNullable<
	NonNullable<ProtocolViewPayload['keyedRepeats']>[number]['rowTemplate']
>;
type RowTemplateTextSlot = NonNullable<MintableRowTemplate['textSlots']>[number];
type RowTemplateAttributeSlot = NonNullable<MintableRowTemplate['attributeSlots']>[number];

function mintableRowTemplate(
	input: ProtocolViewPayloadInput,
	render: RenderDataArtifact['repeats'][number],
	mint: RowComponentMint | null,
): { readonly rowTemplate?: MintableRowTemplate } {
	const chunk = renderDataOf(input).chunks.find(
		(candidate) => candidate.id === render.rowChunkId,
	);
	// A row rendered whole from its chunk carries no markup of its own.
	if (!chunk || mint?.rowChunkId) return {};
	// A child component has a graph, not a template - one instance per rendered
	// row - so markup could never finish it. It is named by identity instead, in
	// `rowComponent`; markup carries only the row element that wraps it, and a row
	// that IS the component has no wrapper to carry.
	const wrappedComponentSlot = mint?.slotPath ? componentSlotAt(chunk, mint.slotPath) : undefined;
	if (chunk.slots.some((slot) => slot.kind === 'child-component' && slot !== wrappedComponentSlot))
		return {};
	const textSlots: Array<RowTemplateTextSlot> = [];
	const attributeSlots: Array<RowTemplateAttributeSlot> = [];
	// An expression slot is answered by the owning component's reader, so a row
	// wrapping a component - rebuilt by that component's render - never takes one.
	const semanticRepeat = input.semanticGraph?.keyedRepeats.find(
		(candidate) => candidate.id === render.repeatId,
	);
	const expressionScope =
		!mint && chunk.componentName && input.semanticGraph && semanticRepeat
			? {
					graph: input.semanticGraph,
					componentName: chunk.componentName,
					rowNames: new Set(
						[semanticRepeat.itemName, semanticRepeat.indexName].filter(
							(name): name is string => name !== undefined,
						),
					),
				}
			: undefined;
	const slotValue = (slot: SemanticMarkupSlot) =>
		mintableSlotValue(slot) ??
		(expressionScope
			? expressionSlotValue(
					slot,
					expressionScope.graph,
					expressionScope.componentName,
					expressionScope.rowNames,
				)
			: null);
	const branchSlots: Array<RowTemplateBranchSlot> = [];
	for (const slot of chunk.slots) {
		if (slot === wrappedComponentSlot) continue;
		if (slot.kind === 'repeat' && nestedRepeatMints(input, render, slot.repeatId)) continue;
		if (slot.kind === 'branch' && !mint) {
			const branch = rowBranchSlot(input, chunk, slot, slotValue);
			if (!branch) return {};
			branchSlots.push(branch);
			continue;
		}
		// Every slot that is neither text nor an attribute is wiring the mint does
		// not do, and a value only the render can produce has no channel at all.
		if (slot.kind !== 'text' && slot.kind !== 'attribute') return {};
		const value = slotValue(slot);
		if (!value) return {};
		if (slot.kind === 'text') textSlots.push({ path: slot.coordinate.path, ...value });
		else attributeSlots.push({ path: slot.coordinate.path, name: slot.name, ...value });
	}
	const html = chunk.statics.join('');
	if (!html) return {};
	const readsExpressions = [
		...textSlots,
		...attributeSlots,
		...branchSlots,
		...branchSlots.flatMap((branch) =>
			branch.arms.flatMap((arm) => [...(arm.textSlots ?? []), ...(arm.attributeSlots ?? [])]),
		),
	].some((slot) => 'source' in slot);
	return {
		rowTemplate: {
			html,
			...(readsExpressions ? { componentName: chunk.componentName! } : {}),
			...(textSlots.length > 0 ? { textSlots } : {}),
			...(attributeSlots.length > 0 ? { attributeSlots } : {}),
			...(branchSlots.length > 0 ? { branchSlots } : {}),
		},
	};
}

type RowTemplateBranchSlot = NonNullable<MintableRowTemplate['branchSlots']>[number];
type RowTemplateArm = RowTemplateBranchSlot['arms'][number];

// An arm holding more than elements, text, attributes and events is wiring a row cannot redo on a flip, so it refuses.
function rowBranchSlot(
	input: ProtocolViewPayloadInput,
	rowChunk: SemanticMarkupChunk,
	slot: Extract<SemanticMarkupSlot, { readonly kind: 'branch' }>,
	slotValue: (slot: SemanticMarkupSlot) => ProtocolRowTemplateSlotValue | null,
): RowTemplateBranchSlot | null {
	const branch = renderDataOf(input).branches.find(
		(candidate) => candidate.branchSiteId === slot.branchSiteId,
	);
	if (!branch || branch.update !== 'range' || branch.asyncBoundaryId) return null;
	if (branch.kind === 'switch' && !branch.armTests) return null;
	const test: ProtocolRowTemplateSlotValue | null =
		branch.testReads.length === 1
			? { graphNodeId: branch.testReads[0]!.graphNodeId, graphPath: branch.testReads[0]!.path }
			: slotValue({
					kind: 'text',
					residue: { kind: 'authored-expression', source: branch.testSource },
					coordinate: slot.coordinate,
				} as SemanticMarkupSlot);
	if (!test) return null;
	const root = rowBranchIsRow(rowChunk, slot);
	const unwired = new Set([
		...input.payloadArena.view.behaviors.map((record) => record.hostNodeId),
		...input.payloadArena.view.elementHandles.map((record) => record.hostNodeId),
	]);
	const arms: RowTemplateArm[] = [];
	for (const chunkId of slot.armTemplateIds) {
		const chunk = renderDataOf(input).chunks.find((candidate) => candidate.id === chunkId);
		if (!chunk) return null;
		if (root && !armRootsOneElement(chunk)) return null;
		if (chunk.hosts.some((host) => unwired.has(host.hostNodeId))) return null;
		const textSlots: Array<RowTemplateTextSlot> = [];
		const attributeSlots: Array<RowTemplateAttributeSlot> = [];
		for (const armSlot of chunk.slots) {
			if (armSlot.kind !== 'text' && armSlot.kind !== 'attribute') return null;
			const value = slotValue(armSlot);
			if (!value) return null;
			if (armSlot.kind === 'text') textSlots.push({ path: armSlot.coordinate.path, ...value });
			else attributeSlots.push({ path: armSlot.coordinate.path, name: armSlot.name, ...value });
		}
		arms.push({
			html: chunk.statics.join(''),
			...(textSlots.length > 0 ? { textSlots } : {}),
			...(attributeSlots.length > 0 ? { attributeSlots } : {}),
		});
	}
	return {
		path: slot.coordinate.path,
		branchId: slot.branchSiteId,
		...(branch.armTests ? { armTests: branch.armTests } : {}),
		arms,
		...test,
	};
}

// The branch is everything the row renders, so the arm it shows is the row itself.
function rowBranchIsRow(chunk: SemanticMarkupChunk, slot: SemanticMarkupSlot): boolean {
	return (
		chunk.slots.length === 1 &&
		chunk.slots[0] === slot &&
		chunk.statics.every((text) => text.replace(/<!--markless-slot:\d+-->/g, '').trim() === '')
	);
}

// An arm that is a whole row renders exactly one element, first, and nothing beside it.
function armRootsOneElement(chunk: SemanticMarkupChunk): boolean {
	return (
		chunk.hosts.filter((host) => host.coordinate.path.length === 1).length === 1 &&
		chunk.hosts.every((host) => host.coordinate.path[0] === 0) &&
		chunk.slots.every((slot) => slot.coordinate.path[0] === 0)
	);
}

// A nested repeat in a minted row builds its own rows once the row is wired, so the row
// needs only the repeat's marker - when the nested record ships and can mint every row.
function nestedRepeatMints(
	input: ProtocolViewPayloadInput,
	enclosing: RenderDataArtifact['repeats'][number],
	repeatId: string,
): boolean {
	const nested = input.payloadArena.view.keyedRepeats.find(
		(candidate) => candidate.id === repeatId && candidate.enclosingRepeatId === enclosing.repeatId,
	);
	const render = renderDataOf(input).repeats.find((candidate) => candidate.repeatId === repeatId);
	if (!nested || !render || render.rowStartOffset === 'unknown' || render.rowElementCount < 1)
		return false;
	if (
		input.semanticGraph?.keyedRepeats.some(
			(candidate) => candidate.id === repeatId && candidate.indexKey,
		)
	)
		return false;
	if (!hostPathsForChunk(input, enclosing.rowChunkId, true).has(nested.parentHostNodeId))
		return false;
	if (render.emptyChunkId && !mintableEmptyArm(input, render).emptyArm) return false;
	if (rowComponentMint(input, render)) return false;
	const template = mintableRowTemplate(input, render, null).rowTemplate;
	return template !== undefined;
}

/**
 * Rows the browser can never add, remove, reorder or rewrite: the collection and
 * every value a row shows depend only on computeds over a page root's props,
 * which the router renders once and never changes in place. Such a repeat ships
 * no row markup, so a page whose lists are all like this loads no row-building
 * code. Anything else a row reads, or a row that only a render can build, keeps
 * the general record.
 */
function fixedRows(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
	render: RenderDataArtifact['repeats'][number],
): boolean {
	const graph = input.semanticGraph;
	const root = renderDataOf(input).root?.componentName;
	if (input.source?.routeRoot !== true || !graph || !root || repeat.enclosingRepeatId)
		return false;
	const semantic = graph.keyedRepeats.find((candidate) => candidate.id === repeat.id);
	const chunk = renderDataOf(input).chunks.find(
		(candidate) => candidate.id === render.rowChunkId,
	);
	if (!semantic || chunk?.componentName !== root || semantic.indexKey) return false;
	if (rowComponentMint(input, render) || branchArmField(input, repeat).branchArm) return false;
	const template = mintableRowTemplate(input, render, null).rowTemplate;
	if (!template || template.componentName || template.branchSlots) return false;
	const slots = [...(template.textSlots ?? []), ...(template.attributeSlots ?? [])];
	if (slots.some((slot) => !('itemPath' in slot))) return false;
	return invariantInBrowser(
		graph,
		root,
		repeat.collectionGraphNodeId,
		semantic.asyncBoundaryId !== undefined,
	);
}

function invariantInBrowser(
	graph: NonNullable<ProtocolViewPayloadInput['semanticGraph']>,
	root: string,
	graphNodeId: string,
	asyncOwned: boolean,
	seen = new Set<string>(),
): boolean {
	if (seen.has(graphNodeId)) return true;
	seen.add(graphNodeId);
	const binding = graph.graphBindings.find(
		(candidate) => candidate.id === graphNodeId && (candidate.componentName ?? root) === root,
	);
	if (!binding || binding.sharedDefinitionId !== undefined) return false;
	if (binding.kind === 'prop') return true;
	if (binding.kind !== 'computed' || binding.storage) return false;
	// A value that settles in the browser re-renders its own arm, so only rows inside that arm may read it.
	if ((binding.async || binding.asyncCapable) && !asyncOwned) return false;
	return (binding.dependencies ?? []).every((dependency) =>
		invariantInBrowser(graph, root, dependency.graphNodeId, asyncOwned, seen),
	);
}

// A collection no graph node holds never changes after load, so its rows are never built again.
function liveRowComponentMint(
	input: ProtocolViewPayloadInput,
	repeat: PayloadKeyedRepeat,
	render: RenderDataArtifact['repeats'][number],
): RowComponentMint | null {
	return repeat.collectionGraphNodeId ? rowComponentMint(input, render) : null;
}

// A refusal emits no field at all, so the record stays byte-identical.
function mintableRowComponent(rowComponent: RowComponentMint | null): {
	readonly rowComponent?: RowComponentMint;
} {
	return rowComponent ? { rowComponent } : {};
}

// The row template and the row component are two halves of one decision, so both
// read the same answer rather than each deciding what the row is.
function rowComponentMint(
	input: ProtocolViewPayloadInput,
	render: RenderDataArtifact['repeats'][number],
): RowComponentMint | null {
	const rowMintInput = {
		...payloadRecordHosts(input.payloadArena.view),
		...(input.semanticGraph ? { semanticGraph: input.semanticGraph } : {}),
		chunks: renderDataOf(input).chunks,
		componentEdges: input.semanticGraph?.componentEdges ?? [],
		componentNames: (input.semanticGraph?.components ?? []).map((component) => component.name),
		...(input.source?.importedModuleInterfaces
			? { importedModuleInterfaces: input.source.importedModuleInterfaces }
			: {}),
		rowChunkId: render.rowChunkId,
		rowElementCount: render.rowElementCount,
	};
	const semanticRepeat = input.semanticGraph?.keyedRepeats.find(
		(candidate) => candidate.id === render.repeatId,
	);
	const componentRow = resolveRowComponentMint({ ...rowMintInput, itemName: render.itemName });
	if (componentRow) return componentRow;
	// A rebuilt row loses its elements, so a row a template can patch in place never takes the chunk mint.
	if (mintableRowTemplate(input, render, null).rowTemplate) return null;
	return (
		resolveRowChunkMint({
			...rowMintInput,
			rowNames: [render.itemName, semanticRepeat?.indexName].filter(
				(name): name is string => name !== undefined,
			),
		})
	);
}

function componentSlotAt(
	chunk: SemanticMarkupChunk,
	slotPath: ReadonlyArray<number>,
): SemanticMarkupSlot | undefined {
	return chunk.slots.find(
		(slot) =>
			slot.kind === 'child-component' &&
			slot.coordinate.path.length === slotPath.length &&
			slot.coordinate.path.every((step, at) => step === slotPath[at]),
	);
}

function boundaryUpdateSymbols(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	// Parts-based (tier 3) and component-executing (tier 4) update modules
	// share the async-boundary-update wiring: either one settles the range.
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-boundary-update' ? [[symbol.boundaryId, symbol.id] as const] : [],
		),
	);
}

// Hosts inside a boundary's arms: their records nest under the
// boundary in arm-relative coordinates instead of riding the flat streams.
function boundaryArmHostIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	return new Set(
		input.payloadArena.view.asyncBoundaries.flatMap((boundary) =>
			boundary.armRecords.flatMap((set) => set.locators.map((locator) => locator.hostNodeId)),
		),
	);
}

// Attaches lazy symbol IDs to a planned arm record set (the flat-stream
// wiring, applied inside the boundary's coordinate space). Hosts owned by an
// arm-scoped flip site leave the boundary's sets — their records nest under
// the flip record and re-register on every flip (D1 tier 3 inside arms).
function wiredArmRecordSet(
	input: ProtocolViewPayloadInput,
	set: ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['armRecords'][number],
	boundaryId: string,
	arm: number,
): ProtocolViewArmRecordSet {
	const flipHostIds = armScopedBranchHostIds(input, boundaryId);
	const boundEventSymbols = boundEventSymbolIds(input);
	const eventSymbols = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'event-handler') continue;
		const key = `${symbol.hostNodeId}:${symbol.eventName}`;
		const symbols = eventSymbols.get(key) ?? [];
		symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
		eventSymbols.set(key, symbols);
	}
	const branches = bindArmBranchEventSymbols(input, armScopedBranchRecords(input, boundaryId, arm));
	return {
		locators: set.locators.filter((locator) => !flipHostIds.has(locator.hostNodeId)),
		events: oneRecordPerEvent(set.events)
			.filter((event) => !flipHostIds.has(event.hostNodeId))
			.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
				symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
			})),
		behaviors: withBehaviorSymbols(
			input,
			set.behaviors.filter((behavior) => !flipHostIds.has(behavior.hostNodeId)),
		),
		elementHandles: set.elementHandles.filter((handle) => !flipHostIds.has(handle.hostNodeId)),
		...(branches ? { branches } : {}),
	};
}

// An escalating arm renders whole on flip, so its page records stay in the flat streams that render emits.
function armHostIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	const escalatingIds = escalatingBranchIds(input);
	return new Set(
		renderDataOf(input).branches.flatMap((branch) =>
			escalatingIds.has(branch.branchSiteId) ? [] : branch.armChunkIds.flatMap((chunkId) => [...branchArmHostPaths(input, chunkId).keys()]),
		),
	);
}

// Arm records address the child components a flip rebuilds too: their hosts
// exist only while the arm is taken, so no page-absolute locator can name them.
function branchArmHostPaths(
	input: ProtocolViewPayloadInput,
	chunkId: string,
): ReadonlyMap<string, ArmHostPlacement & { readonly path: ReadonlyArray<number> }> {
	return addressedOnly(
		armHostPaths(
			renderDataOf(input),
			input.semanticGraph,
			chunkId,
			input.source?.importedModuleInterfaces,
		),
	);
}

// A host no address can name carries no record; the build refuses it with its own diagnostic.
function addressedOnly<Placement extends { readonly path: ReadonlyArray<number> | null }>(
	placements: ReadonlyMap<string, Placement>,
): ReadonlyMap<string, Placement & { readonly path: ReadonlyArray<number> }> {
	return new Map(
		[...placements].filter(
			(entry): entry is [string, Placement & { readonly path: ReadonlyArray<number> }] =>
				entry[1].path !== null,
		),
	);
}

// Does one item of this repeat render one root element? Either the row chunk
// owns element hosts, or the row's root IS a child component, whose own chunk
// owns them. A row that renders neither (text only) is left out: the reconcile
// addresses rows as the parent's child ELEMENTS, so a row with no element of
// its own has nothing to move.
function rowRootsOneElement(
	input: ProtocolViewPayloadInput,
	render: { readonly rowElementCount: number; readonly rowChunkId: string },
): boolean {
	if (render.rowElementCount > 0) return true;
	const chunk = renderDataOf(input).chunks.find((candidate) => candidate.id === render.rowChunkId);
	if ((chunk?.slots ?? []).some((slot) => slot.kind === 'child-component')) return true;
	// A row that is one @if or @switch is the one element its shown arm renders.
	const slot = chunk?.slots[0];
	const branch = renderDataOf(input).branches.find(
		(candidate) => slot?.kind === 'branch' && candidate.branchSiteId === slot.branchSiteId,
	);
	const alwaysShowsAnArm =
		branch?.kind === 'switch'
			? branch.armTests?.includes(null) === true
			: (branch?.armChunkIds.length ?? 0) >= 2;
	return (
		slot?.kind === 'branch' &&
		alwaysShowsAnArm &&
		rowBranchIsRow(chunk!, slot) &&
		slot.armTemplateIds.every((chunkId) => {
			const arm = renderDataOf(input).chunks.find((candidate) => candidate.id === chunkId);
			return arm !== undefined && armRootsOneElement(arm);
		})
	);
}

function hostPathsForChunk(
	input: ProtocolViewPayloadInput,
	chunkId: string,
	relativeToRoot = false,
): ReadonlyMap<string, ReadonlyArray<number>> {
	const chunk = renderDataOf(input).chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return new Map();
	// Render data folds unaddressed elements into counts, so siblings are counted from the full markup.
	const chunks = input.semanticGraph?.markup.chunks ?? [];
	const branchSites = input.semanticGraph?.branchSites ?? [];
	return new Map(
		chunk.hosts.flatMap((host) => {
			const address = elementAddress({
				chunks,
				branchSites,
				...(input.semanticGraph && input.source?.importedModuleInterfaces
					? {
							componentEdges: input.semanticGraph.componentEdges,
							importedModuleInterfaces: input.source.importedModuleInterfaces,
						}
					: {}),
				chunkId,
				path: host.coordinate.path,
			});
			if (!address) return [];
			return [
				[
					host.hostNodeId,
					relativeToRoot && host.coordinate.path[0] === 0 ? address.slice(1) : address,
				] as const,
			];
		}),
	);
}

function eventSymbolsForHost(
	input: ProtocolViewPayloadInput,
	hostNodeId: string,
	eventName: string,
): ReadonlyArray<string> {
	return input.symbolResolver.symbols
		.filter(
			(symbol): symbol is Extract<PlannedSymbol, { kind: 'event-handler' }> =>
				symbol.kind === 'event-handler' &&
				symbol.hostNodeId === hostNodeId &&
				symbol.eventName === eventName,
		)
		.sort((left, right) => left.order - right.order)
		.map((symbol) => symbol.id);
}

function armScopedBranchHostIds(
	input: ProtocolViewPayloadInput,
	boundaryId: string,
): ReadonlySet<string> {
	return new Set(
		renderDataOf(input).branches
			.filter((branch) => branch.asyncBoundaryId === boundaryId)
			.flatMap((branch) =>
				branch.armChunkIds.flatMap((chunkId) => hostIdsForChunkTree(input, chunkId)),
			),
	);
}

function hostIdsForChunkTree(
	input: ProtocolViewPayloadInput,
	chunkId: string,
	seen = new Set<string>(),
): ReadonlyArray<string> {
	if (seen.has(chunkId)) return [];
	seen.add(chunkId);
	const data = renderDataOf(input);
	const chunk = data.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return [];
	const childChunkIds = chunk.slots.flatMap((slot) => {
		if (slot.kind === 'branch') return slot.armTemplateIds;
		if (slot.kind === 'repeat')
			return [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])];
		if (slot.kind === 'async')
			return [
				slot.armTemplateIds.try,
				...(slot.armTemplateIds.pending ? [slot.armTemplateIds.pending] : []),
				...(slot.armTemplateIds.catch ? [slot.armTemplateIds.catch] : []),
			];
		if (slot.kind === 'dynamic-host') return [slot.childChunkId];
		return [];
	});
	return [
		...chunk.hosts.map((host) => host.hostNodeId),
		...childChunkIds.flatMap((childChunkId) => hostIdsForChunkTree(input, childChunkId, seen)),
	];
}

function armScopedBranchRecords(
	input: ProtocolViewPayloadInput,
	boundaryId: string,
	arm: number,
): ReadonlyArray<NonNullable<ProtocolViewArmRecordSet['branches']>[number]> | undefined {
	const branches = renderDataOf(input).branches.filter(
		(branch) =>
			branch.asyncBoundaryId === boundaryId && branch.asyncBoundaryArm === arm,
	);
	if (branches.length === 0) return undefined;
	const branchSymbols = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'branch-update' ? [[symbol.branchSiteId, symbol] as const] : [],
		),
	);
	return branches.map((branch, rank) =>
		branch.update === 'boundary'
			? {
					id: branch.branchSiteId,
					testReads: branchSymbols.get(branch.branchSiteId)?.testReads ?? [],
				}
			: ({
		id: branch.branchSiteId,
		symbolId: branchSymbols.get(branch.branchSiteId)?.id,
		testReads: branchSymbols.get(branch.branchSiteId)?.testReads ?? [],
		startAnchor: { strategy: 'arm-branch-comment', index: rank * 2 },
		endAnchor: { strategy: 'arm-branch-comment', index: rank * 2 + 1 },
		...branchContentReadsField(input, branch.branchSiteId),
		armRecords: branchArmRecords(input, branch.branchSiteId),
		...(branch.armTests ? { armTests: branch.armTests } : {}),
		...(branch.declaredEmptyArms
			? { declaredEmptyArms: branch.declaredEmptyArms }
			: {}),
	}));
}

// Per-arm records for gate-supported branch sites: everything the resume
// runtime must rewire when an arm flips in, addressed by arm-relative host
// paths (the keyed-repeat rowEvents convention).
function branchArmRecords(input: ProtocolViewPayloadInput, branchSiteId: string) {
	const branch = renderDataOf(input).branches.find(
		(entry) => entry.branchSiteId === branchSiteId,
	);
	if (!branch) return undefined;
	const eventSymbols = new Map<string, string[]>();
	const boundEventSymbols = boundEventSymbolIds(input);
	const boundDomUpdateSymbols = boundDomUpdateSymbolIds(input);
	const domUpdateSymbols = new Map<string, string>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
			eventSymbols.set(key, symbols);
		}
		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				boundDomUpdateSymbols.get(symbol.id) ?? symbol.id,
			);
		}
	}
	return branch.armChunkIds.map((chunkId) => {
		const hostIds = branchArmHostPaths(input, chunkId);
		return {
			events: oneRecordPerEvent(input.payloadArena.view.events)
				.filter((event) => hostIds.has(event.hostNodeId))
				.map((event) => ({
					hostPath: hostIds.get(event.hostNodeId)!.path,
					eventName: event.eventName,
					syncPolicy: event.syncPolicy,
					symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
				})),
			domUpdates: input.payloadArena.view.domUpdates
				.filter((domUpdate) => hostIds.has(domUpdate.hostNodeId))
				.map((domUpdate) => {
					const placement = hostIds.get(domUpdate.hostNodeId)!;
					const live = armChildRead(
						placement.props,
						domUpdate.graphNodeId,
						domUpdate.path ?? [],
					);
					return {
						...domUpdate,
						...(live ? live : {}),
						hostPath: placement.path,
						symbolId: domUpdateSymbols.get(
							`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
						),
					};
				}),
			behaviors: withBehaviorSymbols(
				input,
				input.payloadArena.view.behaviors.filter((behavior) => hostIds.has(behavior.hostNodeId)),
			).map((behavior) => ({
				...behavior,
				hostPath: hostIds.get(behavior.hostNodeId)!.path,
			})),
			elementHandles: input.payloadArena.view.elementHandles
				.filter((handle) => hostIds.has(handle.hostNodeId))
				.map((handle) => ({
					...handle,
					hostPath: hostIds.get(handle.hostNodeId)!.path,
				})),
		};
	});
}

/**
 * One record per element and event name, whatever the plurality of handlers.
 *
 * `onClick={[a, b]}` collects two semantic events on one host, and the runtime
 * files exactly one record per element and event name - a second record would
 * replace the first and only the last handler would ever run. The symbols of
 * every entry already ride the first record's `symbolIds`, in authored order.
 */
function oneRecordPerEvent<T extends { readonly hostNodeId: string; readonly eventName: string }>(
	events: ReadonlyArray<T>,
): ReadonlyArray<T> {
	const seen = new Set<string>();
	return events.filter((event) => {
		const key = `${event.hostNodeId}:${event.eventName}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * A spread-carried handler MERGES with the part's own rather than replacing it,
 * which is the platform's own semantics for two listeners on one element (and
 * Qwik's); React's last-writer-wins is the deliberate divergence.
 *
 * The part's own symbols stay first: a part writes its handler expecting to act,
 * and a consumer passing one through `{...rest}` is adding to that, not taking
 * it over. A forwarded event on a host with no record of its own becomes one.
 */
function mergeForwardedEvents<
	T extends {
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly symbolIds: ReadonlyArray<string>;
	},
	F extends {
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly symbolIds: ReadonlyArray<string>;
	},
>(own: ReadonlyArray<T>, forwarded: ReadonlyArray<F>): ReadonlyArray<T | F> {
	if (forwarded.length === 0) return own;
	const merged: Array<T | F> = [...own];
	const appended: F[] = [];
	for (const event of forwarded) {
		const at = merged.findIndex(
			(candidate) =>
				candidate.hostNodeId === event.hostNodeId && candidate.eventName === event.eventName,
		);
		if (at < 0) {
			appended.push(event);
			continue;
		}
		merged[at] = {
			...merged[at]!,
			symbolIds: [...merged[at]!.symbolIds, ...event.symbolIds],
		};
	}
	return [...merged, ...appended];
}

function boundEventSymbolIds(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	return boundSymbolIds(input, new Set(['event-handler']));
}

function boundDomUpdateSymbolIds(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	return boundSymbolIds(input, new Set(['dom-update']));
}

function boundSymbolIds(
	input: ProtocolViewPayloadInput,
	kinds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
	const baseSymbolIds = new Set(
		input.symbolResolver.symbols.flatMap((symbol) =>
			kinds.has(symbol.kind) ? [symbol.id] : [],
		),
	);
	return new Map(
		(input.captureAnalysis?.boundResolverRows ?? []).flatMap((row) =>
			baseSymbolIds.has(row.baseSymbolId) ? [[row.baseSymbolId, row.id] as const] : [],
		),
	);
}

function bindArmBranchEventSymbols(
	input: ProtocolViewPayloadInput,
	branches: NonNullable<ProtocolViewArmRecordSet['branches']> | undefined,
): NonNullable<ProtocolViewArmRecordSet['branches']> | undefined {
	if (!branches) return undefined;
	const boundEventSymbols = boundEventSymbolIds(input);
	return branches.map((branch) => ({
		...branch,
		...(branch.armRecords
			? {
					armRecords: branch.armRecords.map((arm) => ({
						...arm,
						events: arm.events.map((event) => ({
							...event,
							symbolIds: event.symbolIds.map(
								(symbolId) => boundEventSymbols.get(symbolId) ?? symbolId,
							),
						})),
					})),
				}
			: {}),
	}));
}

function behaviorSymbolFields(
	input: ProtocolViewPayloadInput,
	symbolId: string | undefined,
): { readonly symbolId: string | undefined; readonly usesGraph?: true } {
	const usesGraph = input.symbolResolver.symbols.some(
		(symbol) => symbol.id === symbolId && symbol.kind === 'behavior' && symbol.graphAccess,
	);
	return usesGraph ? { symbolId, usesGraph: true } : { symbolId };
}

// Symbols are listed in module order and a host keeps its behaviors in authored order, so the nth on a host names its nth symbol.
function withBehaviorSymbols<Behavior extends { readonly hostNodeId: string }>(
	input: ProtocolViewPayloadInput,
	behaviors: ReadonlyArray<Behavior>,
): Array<Behavior & ReturnType<typeof behaviorSymbolFields>> {
	const symbolsByHost = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols)
		if (symbol.kind === 'behavior')
			symbolsByHost.set(symbol.hostNodeId, [
				...(symbolsByHost.get(symbol.hostNodeId) ?? []),
				symbol.id,
			]);
	const taken = new Map<string, number>();
	return behaviors.map((behavior) => {
		const rank = taken.get(behavior.hostNodeId) ?? 0;
		taken.set(behavior.hostNodeId, rank + 1);
		return {
			...behavior,
			...behaviorSymbolFields(input, symbolsByHost.get(behavior.hostNodeId)?.[rank]),
		};
	});
}
