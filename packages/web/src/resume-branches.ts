import type { DomJournalEntry, DomJournalResult, RuntimeGraph } from '@markless/runtime';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import type {
	ResumeBehaviorRecord,
	ResumeBranchRecord,
	ResumeBranchUpdate,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from './resume-types.ts';

type Hosted<T> = T & { readonly hostPath: ReadonlyArray<number> };
type RegisteredResumeBranch = ResumeBranchRecord & {
	readonly armBoundaryId?: string;
};

export function wireBranches(input: any) {
	const branchesById = new Map<string, ResumeBranchRecord>(),
		currentArmByBranchId = new Map<string, number>(),
		startupArmBehaviorHostIds: string[] = [];
	// Arm-scoped flips rewire on every commit (anchors are replaced); escalated
	// records wire once per site.
	const armFlipReleasesByBoundary = new Map<string, Array<() => void>>(),
		wiredEscalationIds = new Set<string>();
	const { registerArmBranches, wireBranchRecord, wireEscalatedRecord } = createBranchRegistration(
		input,
		{
			branchesById,
			currentArmByBranchId,
			armFlipReleasesByBoundary,
			wiredEscalationIds,
		},
	);
	for (const branch of materializeBranchLocators(input.root, input.view.branches ?? []))
		wireBranchRecord(branch);
	for (const record of input.view.branches ?? [])
		if (record.armBoundaryId && !record.symbolId) wireEscalatedRecord(record);
	for (const branch of branchesById.values()) {
		const arm = currentArmByBranchId.get(branch.id);
		if (
			arm === undefined ||
			input.skipStartupBranchIds?.has(branch.id) ||
			!branch.armRecords?.[arm]
		)
			continue;
		startupArmBehaviorHostIds.push(...materializeBranchArmRecords(input, branch, arm));
	}
	async function materializeFlippedBranchArms(
		entries: ReadonlyArray<DomJournalEntry>,
		activate: (hostNodeId: string) => Promise<void>,
	): Promise<void> {
		const flipped: ResumeBranchRecord[] = [];
		for (const entry of entries) {
			if (
				entry.type !== 'insertRange' ||
				!entry.locator.startsWith('branch:') ||
				!entry.locator.endsWith(':start')
			)
				continue;
			const branchId = entry.locator.slice('branch:'.length, -':start'.length),
				branch = branchesById.get(branchId),
				arm = currentArmByBranchId.get(branchId);
			if (!branch) continue;
			flipped.push(branch);
			if (arm === undefined || !branch.armRecords?.[arm]) continue;
			for (const hostNodeId of materializeBranchArmRecords(input, branch, arm))
				await activate(hostNodeId);
		}
		if (flipped.length)
			await (await import('./resume-arm-records.ts')).bumpArmRosterRevisions(input.graph, flipped);
	}
	async function disposeRemovedRangeHosts(
		entries: ReadonlyArray<DomJournalEntry>,
		disposeHost: (hostNodeId: string) => void,
		asyncBoundaries: Map<
			string,
			{
				readonly startAnchor: ResumeDomComment;
				readonly endAnchor: ResumeDomComment;
			}
		>,
	): Promise<void> {
		if (!entries.some((entry) => entry.type === 'removeRange')) return;
		const { hostIdsInsideRange } = await import('./dom-journal.ts');
		for (const entry of entries) {
			if (entry.type !== 'removeRange') continue;
			const branch = entry.locator.startsWith('branch:')
				? branchesById.get(entry.locator.slice('branch:'.length))
				: undefined;
			const range =
				branch ??
				(entry.locator.startsWith('async-boundary:')
					? asyncBoundaries.get(entry.locator.slice('async-boundary:'.length))
					: undefined);
			if (!range) continue;
			for (const id of hostIdsInsideRange(
				input.root,
				range.startAnchor,
				range.endAnchor,
				input.elementsByHostId,
			))
				disposeHost(id);
		}
	}
	return {
		branchesById,
		startupArmBehaviorHostIds,
		materializeFlippedBranchArms,
		disposeRemovedRangeHosts,
		registerArmBranches,
	};
}

function createBranchRegistration(
	input: any,
	state: {
		readonly branchesById: Map<string, ResumeBranchRecord>;
		readonly currentArmByBranchId: Map<string, number>;
		readonly armFlipReleasesByBoundary: Map<string, Array<() => void>>;
		readonly wiredEscalationIds: Set<string>;
	},
) {
	const { branchesById, currentArmByBranchId, armFlipReleasesByBoundary, wiredEscalationIds } =
		state;
	function wireBranchRecord(branch: RegisteredResumeBranch): void {
		branchesById.set(branch.id, branch);
		for (const armRecordSet of branch.armRecords ?? [])
			for (const armEvent of armRecordSet.events) input.eventTypes.add(armEvent.eventName);
		const paintArm = (arm: number) => {
			currentArmByBranchId.set(branch.id, arm);
			if (branch.idrefSites?.length)
				void import('./resume-arm-records.ts').then((records) =>
					records.syncBranchIdrefSites(input.elementsByHostId, branch, arm),
				);
		};
		let currentArm = wiredBranchArm(input.graph, branch);
		paintArm(currentArm);
		async function replaceArmRange(arm: number) {
			const painted = currentArm;
			const symbol = await input.loadSymbol(branch.symbolId);
			let graph = composedBranchGraph(input.graph, branch);
			if (branch.elementHandleIds)
				graph = (await import('./resume-arm-records.ts')).armElementHandleIdGraph(graph, branch);
			const update = await symbol({
				graph,
				arm,
				branchId: branch.sourceId ?? branch.id,
				composedBranchId: branch.id,
				element: input.root,
				getElementHandle: input.elementHandles.get,
			});
			if (!isResumeBranchUpdate(update)) return;
			currentArm = update.arm;
			paintArm(update.arm);
			const html = branchHtmlToString(update.html);
			// Escalated arms are arm-relative against DOM that does not exist yet.
			if (update.armRecords) return input.commitArm(branch, { ...update, html });
			const fragment = input.renderBranchHtml ? input.renderBranchHtml(html) : html;
			// `resolved` means the module found this arm's parts, so empty text is a value.
			if (
				branchFragmentEmpty(fragment) &&
				update.resolved !== true &&
				!branch.declaredEmptyArms?.includes(update.arm)
			)
				throw branchArmEmptyError(branch, update.arm);
			// A replay putting this arm back as it stands moves nothing, so nothing
			// splices and nothing announces.
			if (update.arm === painted) {
				const { domRangeMatchesFragment } = await import('./dom-journal.ts');
				if (domRangeMatchesFragment(branch.startAnchor, branch.endAnchor, fragment)) return;
			}
			return [
				{ type: 'removeRange', locator: `branch:${branch.id}` },
				{ type: 'insertRange', locator: `branch:${branch.id}:start`, fragment },
			] as DomJournalResult;
		}
		function wireRead(kind: 'test' | 'content', read: ResumeBranchRecord['testReads'][number]) {
			const release = onceRelease(
				input.graph.subscribe({
					id: `branch-${kind}:${branch.id}:${read.graphNodeId}:${read.path.join('.')}`,
					graphNodeId: read.graphNodeId,
					path: read.path,
					async run() {
						// While the deciding read's async computed re-runs, the flip holds
						// its prior arm; one test read per branch, so this subscription IS
						// the decider readBranchArm uses.
						if (kind === 'test' && input.holdPendingFlip?.(read.graphNodeId)) return;
						const arm = branch.testReads.length
							? readBranchArm(input.graph, branch)
							: currentArm;
						if (kind === 'test' ? arm === currentArm : arm !== currentArm) return;
						return replaceArmRange(arm);
					},
				}),
			);
			if (branch.armBoundaryId) {
				const releases = armFlipReleasesByBoundary.get(branch.armBoundaryId) ?? [];
				releases.push(release);
				armFlipReleasesByBoundary.set(branch.armBoundaryId, releases);
			}
			input.storeContainerSubscription(release);
		}
		for (const testRead of branch.testReads) wireRead('test', testRead);
		for (const contentRead of branch.contentReads ?? []) wireRead('content', contentRead);
	}

	// Escalated toggles need component execution, so the test read re-renders the
	// arm through the boundary's update module.
	function wireEscalatedRecord(record: {
		readonly id: string;
		readonly testReads?: ResumeBranchRecord['testReads'];
		readonly armBoundaryId?: string;
	}): void {
		if (!record.armBoundaryId || !record.testReads?.length || wiredEscalationIds.has(record.id))
			return;
		wiredEscalationIds.add(record.id);
		// No hold needed: resettleBoundary ignores non-settled snapshots.
		for (const testRead of record.testReads)
			input.storeContainerSubscription(
				input.graph.subscribe({
					id: `arm-branch-escalation:${record.id}:${testRead.graphNodeId}:${testRead.path.join('.')}`,
					graphNodeId: testRead.graphNodeId,
					path: testRead.path,
					run: () => input.resettleBoundary?.(record.armBoundaryId),
				}),
			);
	}

	// A fresh arm brings fresh anchors, so prior flip subscriptions leak unless
	// they release first.
	function registerArmBranches(
		boundaryId: string,
		records: ReadonlyArray<RegisteredResumeBranch>,
	): string[] {
		for (const release of armFlipReleasesByBoundary.get(boundaryId) ?? []) release();
		armFlipReleasesByBoundary.delete(boundaryId);
		const behaviorHostIds: string[] = [];
		for (const record of records) {
			// A decided branch wires with no test; unwirable is a record with neither
			// a test to read nor an arm the render painted.
			const flips = Boolean(record.testReads?.length);
			if (!flips && typeof record.takenArm !== 'number') continue;
			const live = isLiveComment(record.startAnchor) && isLiveComment(record.endAnchor);
			if (flips && (!record.symbolId || !live)) {
				wireEscalatedRecord({ ...record, armBoundaryId: boundaryId });
				continue;
			}
			if (!live) continue;
			const branch = { ...record, armBoundaryId: boundaryId };
			wireBranchRecord(branch);
			const arm = currentArmByBranchId.get(branch.id);
			if (arm === undefined || !branch.armRecords?.[arm]) continue;
			behaviorHostIds.push(...materializeBranchArmRecords(input, branch, arm));
		}
		return behaviorHostIds;
	}

	return { registerArmBranches, wireBranchRecord, wireEscalatedRecord };
}

// An arm symbol rebuilds from the part-local prop ids its own module spells, which
// the record's rewritten reads never touch. Reading the served table here rather than
// through fns/composition.ts keeps the compose path out of resume's static closure;
// composed-arm-projection.test.ts pins the two ends together.
export function composedBranchGraph(graph: RuntimeGraph, branch: ResumeBranchRecord): RuntimeGraph {
	const routes = branch.composedGraphProps;
	if (!routes?.length) return graph;
	const scope = branch.composedInstancePath ?? '';
	return {
		...graph,
		read(id: string, path: ReadonlyArray<string> = []) {
			// Resume scoped this symbol, so the id arrives carrying the instance
			// path; `prop:` is not page space, so taking it back off is exact.
			const local = id.startsWith(scope) ? id.slice(scope.length) : id;
			const spread = local === 'prop:props';
			const prop = local.startsWith('prop:') && local.slice('prop:'.length);
			const route = routes.find((one) => one.name === (spread ? path[0] : prop));
			return route
				? graph.read(route.graphNodeId, [...(route.path ?? []), ...path.slice(+spread)])
				: graph.read(id, path);
		},
	};
}

function onceRelease(release: () => void): () => void {
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (typeof release === 'function') release();
	};
}

// The PAINTED arm wins: a minted condition computed holds no value until its first
// demand refresh, so the graph would answer the else arm and the first real update
// would be discarded as a no-change.
function wiredBranchArm(graph: RuntimeGraph, branch: ResumeBranchRecord): number {
	return typeof branch.takenArm === 'number' ? branch.takenArm : readBranchArm(graph, branch);
}

function readBranchArm(graph: RuntimeGraph, branch: ResumeBranchRecord): number {
	const read = branch.testReads[0]!,
		value = graph.read(read.graphNodeId, read.path);
	if (branch.armTests) {
		for (let i = 0; i < branch.armTests.length; i++)
			if (branch.armTests[i] !== null && value === branch.armTests[i]) return i;
		return branch.armTests.indexOf(null);
	}
	return value ? 0 : 1;
}

function isResumeBranchUpdate(value: unknown): value is ResumeBranchUpdate {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null;
	return typeof update?.arm === 'number' && isBranchHtml(update.html);
}

function isBranchHtml(value: unknown): value is ResumeBranchUpdate['html'] {
	if (typeof value === 'string') return true;
	return (
		Array.isArray(value) &&
		value.every(
			(record) =>
				typeof record === 'string' ||
				(typeof record === 'object' &&
					record !== null &&
					typeof (record as { readonly text?: unknown }).text === 'string'),
		)
	);
}

function branchHtmlToString(html: ResumeBranchUpdate['html']): string {
	return typeof html === 'string'
		? html
		: html.map((record) => (typeof record === 'string' ? record : record.text)).join('');
}

function materializeBranchArmRecords(
	input: any,
	branch: ResumeBranchRecord,
	armIndex: number,
): string[] {
	const set = branch.armRecords?.[armIndex];
	if (!set) return [];
	const { elementHandles, graph } = input;
	const armNodes = nodesBetweenAnchors(input.root, branch.startAnchor, branch.endAnchor);
	const claim = (hostPath: ReadonlyArray<number>) => {
		const element = armRecordHost(armNodes, hostPath);
		if (!element) return;
		const hostNodeId = `branch:${branch.id}:arm:${String(armIndex)}:${hostPath.join('.')}`;
		input.disposedHosts.delete(hostNodeId);
		input.elementsByHostId.set(hostNodeId, element);
		return { hostNodeId, element };
	};
	for (const armEvent of set.events) {
		const host = claim(armEvent.hostPath);
		if (host)
			input.events.addEventRecord(host.element, {
				hostNodeId: host.hostNodeId,
				eventName: armEvent.eventName,
				syncPolicy: armEvent.syncPolicy,
				symbolIds: armEvent.symbolIds,
			});
	}
	for (const update of set.domUpdates as ReadonlyArray<
		Hosted<ResumeViewRecord['domUpdates'][number]>
	>) {
		if (!update.symbolId) continue;
		const host = claim(update.hostPath);
		if (!host) continue;
		input.storeHostSubscription(
			host.hostNodeId,
			graph.subscribe({
				// Target in the id: one graph node can drive two attributes on a host.
				id: `arm-dom-update:${host.hostNodeId}:${update.target?.kind ?? ''}:${update.target && 'name' in update.target ? update.target.name : ''}:${update.graphNodeId}:${update.path.join('.')}`,
				graphNodeId: update.graphNodeId,
				path: update.path,
				async run(value: unknown) {
					const symbol = await input.loadSymbol(update.symbolId!);
					return (await symbol({
						graph,
						element: host.element,
						getElementHandle: elementHandles.get,
						// The page id the record carries names nothing while the arm is live.
						domUpdate: { ...update, hostNodeId: host.hostNodeId },
						value,
					})) as DomJournalResult | void;
				},
			}),
		);
	}
	const byHost = new Map<string, ResumeBehaviorRecord[]>();
	for (const behavior of set.behaviors as ReadonlyArray<Hosted<ResumeBehaviorRecord>>) {
		const host = claim(behavior.hostPath);
		if (!host) continue;
		const records = byHost.get(host.hostNodeId) ?? [];
		records.push({ ...behavior, hostNodeId: host.hostNodeId });
		byHost.set(host.hostNodeId, records);
	}
	for (const [hostNodeId, records] of byHost) input.addBehaviorRecords(hostNodeId, records);
	for (const handle of set.elementHandles as ReadonlyArray<
		Hosted<ResumeViewRecord['elementHandles'][number]>
	>) {
		const host = claim(handle.hostPath);
		// The branch id names the instance the arm rendered in.
		if (host) elementHandles.register(host.hostNodeId, handle, host.element, branch.id, graph);
	}
	return [...byHost.keys()];
}

function isLiveComment(value: unknown): value is ResumeDomComment {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { readonly nodeType?: number }).nodeType === 8
	);
}

// A branch whose test is a constant or absent prop keeps the arm it painted.
function isDecidedBranch(branch: {
	readonly testReads?: ReadonlyArray<unknown>;
	readonly takenArm?: number;
	readonly armRecords?: ReadonlyArray<unknown>;
}): boolean {
	return (
		!branch.testReads?.length &&
		typeof branch.takenArm === 'number' &&
		Boolean(branch.armRecords?.[branch.takenArm])
	);
}

function materializeBranchLocators(
	root: ResumeDomElement,
	branches: NonNullable<ResumeViewRecord['branches']>,
): Array<RegisteredResumeBranch> {
	const records: RegisteredResumeBranch[] = [],
		comments = walkComments(root);
	for (const branch of branches) {
		if (!branch.symbolId || !branch.testReads?.length) {
			if (!isDecidedBranch(branch)) continue;
		}
		// Arm-scoped records arrive with LIVE anchors, resolved by
		// expandBoundaryArmRecords in the owning boundary's own census.
		const live = isLiveComment(branch.startAnchor) && isLiveComment(branch.endAnchor);
		const startAnchor = live
				? (branch.startAnchor as unknown as ResumeDomComment)
				: comments[branch.startAnchor.index],
			endAnchor = live
				? (branch.endAnchor as unknown as ResumeDomComment)
				: comments[branch.endAnchor.index];
		if (!startAnchor)
			throw missingCommentAnchorError(branch.id, 'startAnchor', branch.startAnchor.index);
		if (!endAnchor)
			throw missingCommentAnchorError(branch.id, 'endAnchor', branch.endAnchor.index);
		records.push({ ...branch, startAnchor, endAnchor } as RegisteredResumeBranch);
	}
	return records;
}

function nodesBetweenAnchors(
	root: ResumeDomElement,
	startAnchor: ResumeDomNode,
	endAnchor: ResumeDomNode,
): ResumeDomNode[] {
	const nodes: ResumeDomNode[] = [];
	function visit(node: ResumeDomNode): boolean {
		let within = false;
		for (const child of node.childNodes ?? []) {
			if (child === startAnchor) {
				within = true;
				continue;
			}
			if (child === endAnchor) return true;
			if (within) nodes.push(child);
			else if (visit(child)) return true;
		}
		return within;
	}
	visit(root);
	return nodes;
}

function armRecordHost(
	armNodes: ReadonlyArray<ResumeDomNode>,
	hostPath: ReadonlyArray<number>,
): ResumeDomElement | undefined {
	const [firstIndex, ...childPath] = hostPath,
		top = firstIndex === undefined ? undefined : armNodes[firstIndex];
	return top?.nodeType === 1 ? rowEventHost(top as ResumeDomElement, childPath) : undefined;
}

function rowEventHost(
	rowRoot: ResumeDomElement,
	hostPath: ReadonlyArray<number>,
): ResumeDomElement | undefined {
	let current: ResumeDomNode | undefined = rowRoot;
	for (const index of hostPath) {
		current = current.childNodes?.[index];
		if (!current) return;
	}
	return current.nodeType === 1 ? (current as ResumeDomElement) : undefined;
}

function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	// Arm-branch anchors index in their boundary's own census, never here.
	const comments: ResumeDomComment[] = [];
	(function visit(node: ResumeDomNode): void {
		if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))
			comments.push(node as ResumeDomComment);
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	return comments;
}

function missingCommentAnchorError(
	id: string,
	name: 'startAnchor' | 'endAnchor',
	index: number,
): Error {
	return branchRuntimeError(
		`Resume locator ${id} ${name} expected a comment at DOM order index ${String(index)}.`,
		'MARKLESS_RESUME_LOCATOR_MISSING',
		{},
	);
}

function branchRuntimeError(message: string, code: string, fields: Record<string, unknown>): Error {
	const error = new Error(message) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = code;
	Object.assign(error, fields);
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}

function branchFragmentEmpty(fragment: unknown): boolean {
	if (typeof fragment === 'string') return fragment.length === 0;
	if (fragment && typeof fragment === 'object' && 'childNodes' in fragment)
		return branchFragmentEmpty(
			Array.from((fragment as { readonly childNodes?: ArrayLike<unknown> }).childNodes ?? []),
		);
	if (!Array.isArray(fragment)) return false;
	return (
		fragment.length === 0 ||
		!fragment.some((node) => node && typeof node === 'object' && 'nodeType' in node)
	);
}

function branchArmEmptyError(branch: ResumeBranchRecord, arm: number): Error {
	return branchRuntimeError(
		`MARKLESS_BRANCH_ARM_EMPTY: Branch ${branch.id} resolved arm ${String(arm)} to an empty fragment.`,
		'MARKLESS_BRANCH_ARM_EMPTY',
		{
			phase: 'runtime',
			branchId: branch.id,
			sourceBranchId: branch.sourceId,
			branchSiteId: branch.sourceId ?? branch.id,
			arm,
			symbolId: branch.symbolId,
		},
	);
}
