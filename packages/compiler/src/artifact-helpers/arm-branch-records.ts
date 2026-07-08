import type {
	PayloadArenaArtifact,
	PlannedSymbol,
	ProtocolViewArmBranchRecord,
	PublicRenderPlanArtifact,
	PublicRenderPlanBranchArms,
} from '../artifacts.ts';

// Builds the arm-scoped branch records (D1 tier 3 inside arms) that nest
// under an async boundary's armRecords. Both protocol-view (SSR payload) and
// the tier-4 arm-render module (CSR plan JSON) embed the same records, so the
// construction lives here once. Reads: the public render plan's arm-scoped
// branchArms entries + escalations, the payload arena's flat view streams,
// and the planned symbols. Produces: per-(boundary, arm) records with flip
// symbol ids, test reads, arm-local anchor indexes, and hostPath-keyed
// per-arm record sets the resume runtime rewires on every flip.
export function armScopedBranchRecords(input: {
	readonly publicRenderPlan: Pick<
		PublicRenderPlanArtifact,
		'branchArms' | 'armBranchEscalations'
	>;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
	readonly payloadView: PayloadArenaArtifact['view'];
	readonly boundaryId: string;
	readonly arm: number;
}): ReadonlyArray<ProtocolViewArmBranchRecord> | undefined {
	const branchSymbols = new Map(
		input.symbols.flatMap((symbol) =>
			symbol.kind === 'branch-update' ? [[symbol.branchSiteId, symbol] as const] : [],
		),
	);
	const flips = (input.publicRenderPlan.branchArms ?? [])
		.filter(
			(entry) =>
				entry.asyncBoundaryId === input.boundaryId &&
				entry.asyncBoundaryArm === input.arm &&
				entry.armAnchorRank !== undefined,
		)
		.map(
			(entry): ProtocolViewArmBranchRecord => ({
				id: entry.branchSiteId,
				symbolId: branchSymbols.get(entry.branchSiteId)?.id,
				testReads: branchSymbols.get(entry.branchSiteId)?.testReads ?? [],
				...(entry.armTests ? { armTests: entry.armTests } : {}),
				...(entry.declaredEmptyArms ? { declaredEmptyArms: entry.declaredEmptyArms } : {}),
				startAnchor: { strategy: 'arm-branch-comment', index: entry.armAnchorRank! * 2 },
				endAnchor: { strategy: 'arm-branch-comment', index: entry.armAnchorRank! * 2 + 1 },
				armRecords: armBranchArmRecords(entry, input.payloadView, input.symbols),
			}),
		);
	const escalations = (input.publicRenderPlan.armBranchEscalations ?? [])
		.filter(
			(escalation) =>
				escalation.asyncBoundaryId === input.boundaryId &&
				escalation.asyncBoundaryArm === input.arm,
		)
		.map(
			(escalation): ProtocolViewArmBranchRecord => ({
				id: escalation.branchSiteId,
				testReads: branchSymbols.get(escalation.branchSiteId)?.testReads ?? [],
			}),
		);
	const records = [...flips, ...escalations];
	return records.length > 0 ? records : undefined;
}

// Hosts owned by arm-scoped flip records: the branch record re-registers them
// per flip, so the boundary's own planned record sets must not claim them.
export function armScopedBranchHostIds(
	branchArms: PublicRenderPlanArtifact['branchArms'] | undefined,
	boundaryId: string,
): ReadonlySet<string> {
	return new Set(
		(branchArms ?? [])
			.filter((entry) => entry.asyncBoundaryId === boundaryId)
			.flatMap((entry) => [
				...(entry.ownedHostIds ?? []),
				...(entry.armHosts ?? []).flatMap((arm) => arm.map((host) => host.hostNodeId)),
			]),
	);
}

// Per flip arm: everything the resume runtime rewires when the arm flips in,
// addressed by arm-relative host paths (the keyed-repeat rowEvents
// convention) — mirror of the top-level branch armRecords wiring.
function armBranchArmRecords(
	entry: PublicRenderPlanBranchArms,
	payloadView: PayloadArenaArtifact['view'],
	symbols: ReadonlyArray<PlannedSymbol>,
): ProtocolViewArmBranchRecord['armRecords'] {
	if (!entry.armHosts) return undefined;
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
	const behaviorSymbols = new Map<string, string[]>();
	for (const symbol of symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const ids = eventSymbols.get(key) ?? [];
			ids[symbol.order] = symbol.id;
			eventSymbols.set(key, ids);
		}
		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${armDomUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				symbol.id,
			);
		}
		if (symbol.kind === 'behavior') {
			const ids = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			ids[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, ids);
		}
	}
	return entry.armHosts.map((armHostList) => {
		const hostIds = new Map(armHostList.map((host) => [host.hostNodeId, host.hostPath]));
		return {
			events: payloadView.events
				.filter((event) => hostIds.has(event.hostNodeId))
				.map((event) => ({
					hostPath: hostIds.get(event.hostNodeId)!,
					eventName: event.eventName,
					syncPolicy: event.syncPolicy,
					symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
				})),
			domUpdates: payloadView.domUpdates
				.filter((domUpdate) => hostIds.has(domUpdate.hostNodeId))
				.map((domUpdate) => ({
					...domUpdate,
					hostPath: hostIds.get(domUpdate.hostNodeId)!,
					symbolId: domUpdateSymbols.get(
						`${domUpdate.hostNodeId}:${armDomUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
					),
				})),
			behaviors: payloadView.behaviors
				.filter((behavior) => hostIds.has(behavior.hostNodeId))
				.map((behavior, index) => ({
					...behavior,
					hostPath: hostIds.get(behavior.hostNodeId)!,
					symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
				})),
			elementHandles: payloadView.elementHandles
				.filter((handle) => hostIds.has(handle.hostNodeId))
				.map((handle) => ({
					...handle,
					hostPath: hostIds.get(handle.hostNodeId)!,
				})),
		};
	}) as ProtocolViewArmBranchRecord['armRecords'];
}

function armDomUpdateTargetKey(
	target: PayloadArenaArtifact['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	if (target.kind === 'text') {
		return `text:${target.prefix ?? ''}:${target.suffix ?? ''}:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	}
	if (target.kind === 'class')
		return `class:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	return target.kind;
}
