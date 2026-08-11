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

type ArmDomUpdate = ResumeViewRecord['domUpdates'][number] & {
	readonly hostPath: ReadonlyArray<number>;
};
type ArmBehavior = ResumeBehaviorRecord & { readonly hostPath: ReadonlyArray<number> };
type ArmHandle = ResumeViewRecord['elementHandles'][number] & {
	readonly hostPath: ReadonlyArray<number>;
};
type RegisteredResumeBranch = ResumeBranchRecord & {
	readonly armBoundaryId?: string;
};

export function wireBranches(input: any) {
	const branchesById = new Map<string, ResumeBranchRecord>(),
		currentArmByBranchId = new Map<string, number>(),
		startupArmBehaviorHostIds: string[] = [];
	// Arm-scoped flip subscriptions dispose and rewire on every arm commit
	// (the anchors are replaced); escalated records wire once per site.
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
			if (!branch || arm === undefined || !branch.armRecords?.[arm]) continue;
			for (const hostNodeId of materializeBranchArmRecords(input, branch, arm))
				await activate(hostNodeId);
		}
	}
	function disposeRemovedRangeHosts(
		entries: ReadonlyArray<DomJournalEntry>,
		disposeHost: (hostNodeId: string) => void,
		asyncBoundaries: Map<
			string,
			{
				readonly startAnchor: ResumeDomComment;
				readonly endAnchor: ResumeDomComment;
			}
		>,
	): void {
		if (!entries.some((entry) => entry.type === 'removeRange')) return;
		disposeRemovedHosts(input, entries, disposeHost, branchesById, asyncBoundaries);
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
		let currentArm = readBranchArm(input.graph, branch);
		currentArmByBranchId.set(branch.id, currentArm);
		for (const testRead of branch.testReads) {
			const release = onceRelease(
				input.graph.subscribe({
					id: `branch-test:${branch.id}:${testRead.graphNodeId}:${testRead.path.join('.')}`,
					graphNodeId: testRead.graphNodeId,
					path: testRead.path,
					async run() {
						// Spec D8: pending is for FIRST APPEARANCES only — including flips.
						// While the deciding read's async computed is re-running the flip
						// holds its prior arm (see resume-runtime.ts holdPendingFlip). The
						// compiler emits at most one test read per branch (symbol-resolver),
						// so this subscription's read IS the arm decider readBranchArm uses.
						if (input.holdPendingFlip?.(testRead.graphNodeId)) return;
						const newArm = readBranchArm(input.graph, branch);
						if (newArm === currentArm) return;
						const symbol = await input.loadSymbol(branch.symbolId);
						const update = await symbol({
							graph: input.graph,
							arm: newArm,
							branchId: branch.sourceId ?? branch.id,
							composedBranchId: branch.id,
							element: input.root,
							getElementHandle: input.elementHandles.get,
						});
						if (!isResumeBranchUpdate(update)) return;
						currentArm = update.arm;
						currentArmByBranchId.set(branch.id, update.arm);
						const html = branchHtmlToString(update.html);
						const fragment = input.renderBranchHtml
							? input.renderBranchHtml(html)
							: html;
						if (
							branchFragmentEmpty(fragment) &&
							!branch.declaredEmptyArms?.includes(update.arm)
						)
							throw branchArmEmptyError(branch, update.arm);
						return [
							{ type: 'removeRange', locator: `branch:${branch.id}` },
							{ type: 'insertRange', locator: `branch:${branch.id}:start`, fragment },
						] as DomJournalResult;
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
	}

	// Escalated arm-scoped toggles (content needs component execution): the
	// test read re-renders the whole arm through the boundary's update module.
	function wireEscalatedRecord(record: {
		readonly id: string;
		readonly testReads?: ResumeBranchRecord['testReads'];
		readonly armBoundaryId?: string;
	}): void {
		if (!record.armBoundaryId || !record.testReads?.length || wiredEscalationIds.has(record.id))
			return;
		wiredEscalationIds.add(record.id);
		// Pending re-runs need no hold here: resettleBoundary routes through
		// settleAsyncBoundaryRange, which ignores non-settled snapshots.
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

	// Re-registration API for commitArm (T103/T104): a fresh arm brings fresh
	// arm-branch anchors, so previous flip subscriptions release first (no
	// leaks) and the current arm's in-branch records register like startup.
	function registerArmBranches(
		boundaryId: string,
		records: ReadonlyArray<RegisteredResumeBranch>,
	): string[] {
		for (const release of armFlipReleasesByBoundary.get(boundaryId) ?? []) release();
		armFlipReleasesByBoundary.delete(boundaryId);
		const behaviorHostIds: string[] = [];
		for (const record of records) {
			if (!record.testReads?.length) continue;
			if (
				!record.symbolId ||
				!isLiveComment(record.startAnchor) ||
				!isLiveComment(record.endAnchor)
			) {
				wireEscalatedRecord({ ...record, armBoundaryId: boundaryId });
				continue;
			}
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

function onceRelease(release: () => void): () => void {
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (typeof release === 'function') release();
	};
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
	for (const update of set.domUpdates as ReadonlyArray<ArmDomUpdate>) {
		if (!update.symbolId) continue;
		const host = claim(update.hostPath);
		if (!host) continue;
		input.storeHostSubscription(
			host.hostNodeId,
			input.graph.subscribe({
				id: `arm-dom-update:${host.hostNodeId}:${update.graphNodeId}:${update.path.join('.')}`,
				graphNodeId: update.graphNodeId,
				path: update.path,
				async run(value: unknown) {
					const symbol = await input.loadSymbol(update.symbolId!);
					return (await symbol({
						graph: input.graph,
						element: host.element,
						getElementHandle: input.elementHandles.get,
						domUpdate: update,
						value,
					})) as DomJournalResult | void;
				},
			}),
		);
	}
	const byHost = new Map<string, ResumeBehaviorRecord[]>();
	for (const behavior of set.behaviors as ReadonlyArray<ArmBehavior>) {
		const host = claim(behavior.hostPath);
		if (!host) continue;
		const records = byHost.get(host.hostNodeId) ?? [];
		records.push({ ...behavior, hostNodeId: host.hostNodeId });
		byHost.set(host.hostNodeId, records);
	}
	for (const [hostNodeId, records] of byHost) input.addBehaviorRecords(hostNodeId, records);
	for (const handle of set.elementHandles as ReadonlyArray<ArmHandle>) {
		const host = claim(handle.hostPath);
		if (host) input.elementHandles.register(host.hostNodeId, handle, host.element);
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

function materializeBranchLocators(
	root: ResumeDomElement,
	branches: NonNullable<ResumeViewRecord['branches']>,
): Array<RegisteredResumeBranch> {
	const records: RegisteredResumeBranch[] = [],
		comments = walkComments(root);
	for (const branch of branches) {
		if (!branch.symbolId || !branch.testReads?.length) continue;
		// Arm-scoped records arrive with LIVE anchors (resolved in the owning
		// boundary's own arm-branch census by expandBoundaryArmRecords).
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

function disposeRemovedHosts(
	input: any,
	entries: ReadonlyArray<DomJournalEntry>,
	disposeHost: (hostNodeId: string) => void,
	branchesById: Map<string, ResumeBranchRecord>,
	asyncBoundaries: Map<
		string,
		{
			readonly startAnchor: ResumeDomComment;
			readonly endAnchor: ResumeDomComment;
		}
	>,
): void {
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
		for (const id of hostIdsInsideRemovedElements(
			input.elementsByHostId,
			elementsBetweenAnchors(input.root, range.startAnchor, range.endAnchor),
		))
			disposeHost(id);
	}
}

// Local copies of the resume-locators DOM-walk helpers: importing that module
// here regroups it (plus the resume-errors chunk) into this wall-counted
// chunk, which costs more than the duplication saves (T120 measurement).
function elementsBetweenAnchors(
	root: ResumeDomElement,
	startAnchor: ResumeDomComment,
	endAnchor: ResumeDomComment,
): Set<ResumeDomElement> {
	const inside = new Set<ResumeDomElement>();
	let within = false;
	function visit(node: ResumeDomNode): void {
		if (node === startAnchor) {
			within = true;
			return;
		}
		if (node === endAnchor) {
			within = false;
			return;
		}
		if (within && node.nodeType === 1) inside.add(node as ResumeDomElement);
		for (const child of node.childNodes ?? []) visit(child);
	}
	visit(root);
	return inside;
}

function hostIdsInsideRemovedElements(
	elementsByHostId: Map<string, ResumeDomElement>,
	removed: Set<ResumeDomElement>,
): string[] {
	const ids: string[] = [];
	for (const [id, element] of elementsByHostId)
		for (const removedElement of removed)
			if (containsElement(removedElement, element)) {
				ids.push(id);
				break;
			}
	return ids;
}

function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
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

// Shared diagnostic shape (message text stays authored per site; docsUrl
// always mirrors the code).
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
