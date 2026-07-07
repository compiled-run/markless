import type { DomJournalEntry, DomJournalResult, RuntimeGraph } from '@markless/runtime';
import type { ResumeBehaviorRecord, ResumeBranchRecord, ResumeBranchUpdate, ResumeDomComment, ResumeDomElement, ResumeDomNode, ResumeViewRecord } from './resume-types.ts';

type ArmDomUpdate = ResumeViewRecord['domUpdates'][number] & { readonly hostPath: ReadonlyArray<number> };
type ArmBehavior = ResumeBehaviorRecord & { readonly hostPath: ReadonlyArray<number> };
type ArmHandle = ResumeViewRecord['elementHandles'][number] & { readonly hostPath: ReadonlyArray<number> };

export function wireBranches(input: any) {
	const branchesById = new Map<string, ResumeBranchRecord>(), currentArmByBranchId = new Map<string, number>(), startupArmBehaviorHostIds: string[] = [];
	for (const branch of materializeBranchLocators(input.root, input.view.branches ?? [])) {
		branchesById.set(branch.id, branch); for (const armRecordSet of branch.armRecords ?? []) for (const armEvent of armRecordSet.events) input.eventTypes.add(armEvent.eventName);
		let currentArm = readBranchArm(input.graph, branch); currentArmByBranchId.set(branch.id, currentArm);
		for (const testRead of branch.testReads) input.storeContainerSubscription(input.graph.subscribe({ id: `branch-test:${branch.id}:${testRead.graphNodeId}:${testRead.path.join('.')}`, graphNodeId: testRead.graphNodeId, path: testRead.path, async run() {
			const newArm = readBranchArm(input.graph, branch); if (newArm === currentArm) return;
			const symbol = await input.loadSymbol(branch.symbolId); const update = await symbol({ graph: input.graph, arm: newArm, branchId: branch.sourceId ?? branch.id, composedBranchId: branch.id, element: input.root, getElementHandle: input.elementHandles.get });
			if (!isResumeBranchUpdate(update)) return; currentArm = update.arm; currentArmByBranchId.set(branch.id, update.arm);
			const fragment = input.renderBranchHtml ? input.renderBranchHtml(update.html) : update.html;
			if (branchFragmentEmpty(fragment)) throw branchArmEmptyError(branch, update.arm);
			return [{ type: 'removeRange', locator: `branch:${branch.id}` }, { type: 'insertRange', locator: `branch:${branch.id}:start`, fragment }] as DomJournalResult;
		} }));
	}
	for (const branch of branchesById.values()) { const arm = currentArmByBranchId.get(branch.id); if (arm !== undefined && !input.skipStartupBranchIds?.has(branch.id)) startupArmBehaviorHostIds.push(...materializeBranchArmRecords(input, branch, arm)); }
	async function materializeFlippedBranchArms(entries: ReadonlyArray<DomJournalEntry>, activate: (hostNodeId: string) => Promise<void>): Promise<void> {
		for (const entry of entries) { if (entry.type !== 'insertRange' || !entry.locator.startsWith('branch:') || !entry.locator.endsWith(':start')) continue;
			const branchId = entry.locator.slice('branch:'.length, -':start'.length), branch = branchesById.get(branchId), arm = currentArmByBranchId.get(branchId); if (!branch || arm === undefined) continue;
			for (const hostNodeId of materializeBranchArmRecords(input, branch, arm)) await activate(hostNodeId);
		}
	}
	function disposeRemovedRangeHosts(entries: ReadonlyArray<DomJournalEntry>, disposeHost: (hostNodeId: string) => void, asyncBoundaries: Map<string, { readonly startAnchor: import('./resume-types.ts').ResumeDomComment; readonly endAnchor: import('./resume-types.ts').ResumeDomComment }>): void {
		for (const entry of entries) { if (entry.type !== 'removeRange') continue; const range = entry.locator.startsWith('branch:') ? branchesById.get(entry.locator.slice('branch:'.length)) : entry.locator.startsWith('async-boundary:') ? asyncBoundaries.get(entry.locator.slice('async-boundary:'.length)) : undefined; if (!range) continue;
			for (const id of hostIdsInsideRemovedElements(input.elementsByHostId, elementsBetweenAnchors(input.root, range.startAnchor, range.endAnchor))) disposeHost(id);
		}
	}
	return { branchesById, startupArmBehaviorHostIds, materializeFlippedBranchArms, disposeRemovedRangeHosts };
}

function materializeBranchArmRecords(input: any, branch: ResumeBranchRecord, armIndex: number): string[] {
	const set = branch.armRecords?.[armIndex]; if (!set) return []; const armNodes = nodesBetweenAnchors(input.root, branch.startAnchor, branch.endAnchor);
	const claim = (hostPath: ReadonlyArray<number>) => { const element = armRecordHost(armNodes, hostPath); if (!element) return; const hostNodeId = `branch:${branch.id}:arm:${String(armIndex)}:${hostPath.join('.')}`; input.disposedHosts.delete(hostNodeId); input.elementsByHostId.set(hostNodeId, element); return { hostNodeId, element }; };
	for (const armEvent of set.events) { const host = claim(armEvent.hostPath); if (host) input.events.addEventRecord(host.element, { hostNodeId: host.hostNodeId, eventName: armEvent.eventName, syncPolicy: armEvent.syncPolicy, symbolIds: armEvent.symbolIds }); }
	for (const update of set.domUpdates as ReadonlyArray<ArmDomUpdate>) { if (!update.symbolId) continue; const host = claim(update.hostPath); if (!host) continue; input.storeHostSubscription(host.hostNodeId, input.graph.subscribe({ id: `arm-dom-update:${host.hostNodeId}:${update.graphNodeId}:${update.path.join('.')}`, graphNodeId: update.graphNodeId, path: update.path, async run(value) { const symbol = await input.loadSymbol(update.symbolId!); return await symbol({ graph: input.graph, element: host.element, getElementHandle: input.elementHandles.get, domUpdate: update, value }) as DomJournalResult | void; } })); }
	const byHost = new Map<string, ResumeBehaviorRecord[]>(); for (const behavior of set.behaviors as ReadonlyArray<ArmBehavior>) { const host = claim(behavior.hostPath); if (!host) continue; const records = byHost.get(host.hostNodeId) ?? []; records.push({ ...behavior, hostNodeId: host.hostNodeId }); byHost.set(host.hostNodeId, records); }
	for (const [hostNodeId, records] of byHost) input.addBehaviorRecords(hostNodeId, records);
	for (const handle of set.elementHandles as ReadonlyArray<ArmHandle>) { const host = claim(handle.hostPath); if (host) input.elementHandles.register(host.hostNodeId, handle, host.element); }
	return [...byHost.keys()];
}
function readBranchArm(graph: RuntimeGraph, branch: ResumeBranchRecord): number {
	const read = branch.testReads[0]!, value = graph.read(read.graphNodeId, read.path);
	if (branch.armTests) { for (let i = 0; i < branch.armTests.length; i++) if (branch.armTests[i] !== null && value === branch.armTests[i]) return i; return branch.armTests.indexOf(null); }
	return value ? 0 : 1;
}
function isResumeBranchUpdate(value: unknown): value is ResumeBranchUpdate {
	const update = value as { readonly arm?: unknown; readonly html?: unknown } | null; return typeof update?.arm === 'number' && typeof update?.html === 'string';
}
function materializeBranchLocators(root: ResumeDomElement, branches: NonNullable<ResumeViewRecord['branches']>): ResumeBranchRecord[] {
	const records: ResumeBranchRecord[] = [], comments = walkComments(root);
	for (const branch of branches) { if (!branch.symbolId || !branch.testReads?.length) continue;
		const startAnchor = comments[branch.startAnchor.index], endAnchor = comments[branch.endAnchor.index];
		if (!startAnchor) throw missingCommentAnchorError(branch.id, 'startAnchor', branch.startAnchor.index);
		if (!endAnchor) throw missingCommentAnchorError(branch.id, 'endAnchor', branch.endAnchor.index);
		records.push({ id: branch.id, sourceId: (branch as { readonly sourceId?: string }).sourceId, startAnchor, endAnchor, symbolId: branch.symbolId, testReads: branch.testReads, armTests: branch.armTests, armRecords: branch.armRecords });
	}
	return records;
}
function nodesBetweenAnchors(root: ResumeDomElement, startAnchor: ResumeDomComment, endAnchor: ResumeDomComment): ResumeDomNode[] {
	const nodes: ResumeDomNode[] = []; function visit(node: ResumeDomNode): boolean { let within = false; for (const child of node.childNodes ?? []) { if (child === startAnchor) { within = true; continue; } if (child === endAnchor) return true; if (within) nodes.push(child); else if (visit(child)) return true; } return within; } visit(root); return nodes;
}
function armRecordHost(armNodes: ReadonlyArray<ResumeDomNode>, hostPath: ReadonlyArray<number>): ResumeDomElement | undefined {
	const [firstIndex, ...childPath] = hostPath, top = firstIndex === undefined ? undefined : armNodes[firstIndex];
	return top?.nodeType === 1 ? rowEventHost(top as ResumeDomElement, childPath) : undefined;
}
function rowEventHost(rowRoot: ResumeDomElement, hostPath: ReadonlyArray<number>): ResumeDomElement | undefined {
	let current: ResumeDomNode | undefined = rowRoot; for (const index of hostPath) { current = current.childNodes?.[index]; if (!current) return; }
	return current.nodeType === 1 ? current as ResumeDomElement : undefined;
}
function elementsBetweenAnchors(root: ResumeDomElement, startAnchor: ResumeDomComment, endAnchor: ResumeDomComment): Set<ResumeDomElement> {
	const inside = new Set<ResumeDomElement>(); let within = false; function visit(node: ResumeDomNode): void { if (node === startAnchor) { within = true; return; } if (node === endAnchor) { within = false; return; } if (within && node.nodeType === 1) inside.add(node as ResumeDomElement); for (const child of node.childNodes ?? []) visit(child); } visit(root); return inside;
}
function hostIdsInsideRemovedElements(elementsByHostId: Map<string, ResumeDomElement>, removed: Set<ResumeDomElement>): string[] {
	const ids: string[] = []; for (const [id, element] of elementsByHostId) for (const removedElement of removed) if (containsElement(removedElement, element)) { ids.push(id); break; } return ids;
}
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true; for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true; return false;
}
function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	const comments: ResumeDomComment[] = []; (function visit(node: ResumeDomNode): void { if (node.nodeType === 8) comments.push(node as ResumeDomComment); for (const child of node.childNodes ?? []) visit(child); })(root); return comments;
}
function missingCommentAnchorError(id: string, name: 'startAnchor' | 'endAnchor', index: number): Error {
	const error = new Error(`Resume locator ${id} ${name} expected a comment at DOM order index ${String(index)}.`) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError'; error.code = 'MARKLESS_RESUME_LOCATOR_MISSING'; error.docsUrl = 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING';
	return error;
}
function branchFragmentEmpty(fragment: unknown): boolean {
	if (typeof fragment === 'string') return fragment.length === 0;
	if (fragment && typeof fragment === 'object' && 'childNodes' in fragment) return branchFragmentEmpty(Array.from((fragment as { readonly childNodes?: ArrayLike<unknown> }).childNodes ?? []));
	if (!Array.isArray(fragment)) return false;
	return fragment.length === 0 || !fragment.some((node) => node && typeof node === 'object' && 'nodeType' in node);
}
function branchArmEmptyError(branch: ResumeBranchRecord, arm: number): Error {
	const error = new Error(`MARKLESS_BRANCH_ARM_EMPTY: Branch ${branch.id} resolved arm ${String(arm)} to an empty fragment.`) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError'; error.code = 'MARKLESS_BRANCH_ARM_EMPTY'; error.phase = 'runtime'; error.branchId = branch.id; error.sourceBranchId = branch.sourceId; error.branchSiteId = branch.sourceId ?? branch.id; error.arm = arm; error.symbolId = branch.symbolId; error.docsUrl = 'https://markless.dev/errors/MARKLESS_BRANCH_ARM_EMPTY';
	return error;
}
