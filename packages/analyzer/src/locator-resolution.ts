import type { AnalyzerCanonicalInvariantResult } from './contracts.ts';

export type LocatorKind =
	| 'dom-order-path'
	| 'branch-anchor'
	| 'keyed-row'
	| 'text-binding'
	| 'behavior-host'
	| 'element-handle';

type LocatorIdentity = { readonly id: string; readonly kind: LocatorKind };
export type LocatorPlan = LocatorIdentity &
	(
		| { readonly strategy: 'element-order'; readonly index: number; readonly tagName?: string; readonly hostNodeId?: string }
		| { readonly strategy: 'comment-order'; readonly index: number }
		| { readonly strategy: 'child-path'; readonly path: readonly number[]; readonly fromHostNodeId?: string; readonly nodeType?: number }
		| { readonly strategy: 'host-reference'; readonly hostNodeId: string }
	);

export interface WalkableDomAdapter<Node> {
	childNodes(node: Node): readonly Node[];
	nodeType(node: Node): number;
	tagName?(node: Node): string | undefined;
	commentData?(node: Node): string | undefined;
}

export interface LocatorResolutionEvaluation {
	readonly invariant: AnalyzerCanonicalInvariantResult;
	readonly coverage: {
		readonly covered: readonly LocatorKind[];
		readonly skipped: readonly { readonly kind: string; readonly reason: string }[];
	};
}

export function locatorPlansFromView(view: Record<string, any>): {
	readonly plans: LocatorPlan[];
	readonly skipped: { readonly kind: string; readonly reason: string }[];
} {
	const plans: LocatorPlan[] = [];
	const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
	for (const locator of list(view.locators))
		plans.push({ id: locator.hostNodeId, kind: 'dom-order-path', strategy: 'element-order', index: locator.index, tagName: locator.tagName, hostNodeId: locator.hostNodeId });
	for (const update of list(view.domUpdates))
		if (update.target?.kind === 'text')
			plans.push({ id: update.hostNodeId, kind: 'text-binding', strategy: 'host-reference', hostNodeId: update.hostNodeId });
	for (const behavior of list(view.behaviors))
		plans.push({ id: behavior.hostNodeId, kind: 'behavior-host', strategy: 'host-reference', hostNodeId: behavior.hostNodeId });
	for (const handle of list(view.elementHandles))
		plans.push({ id: handle.handleId, kind: 'element-handle', strategy: 'host-reference', hostNodeId: handle.hostNodeId });
	for (const [group, records] of [['branch', view.branches], ['async', view.asyncBoundaries]] as const)
		for (const record of list(records))
			for (const name of ['startAnchor', 'endAnchor'] as const)
				if (typeof record[name]?.index === 'number')
					plans.push({ id: `${group}:${record.id}:${name}`, kind: 'branch-anchor', strategy: 'comment-order', index: record[name].index });
	const skipped: { kind: string; reason: string }[] = [];
	if (list(view.keyedRepeats).length)
		skipped.push({ kind: 'keyed-row', reason: 'served view payload omits live collection cardinality needed to expand one raw child-node path per row' });
	if (list(view.asyncBoundaries).some((boundary) => boundary.armRecords))
		skipped.push({ kind: 'streamed-arm', reason: 'arm-relative locators require the live boundary-local re-anchoring census' });
	if (list(view.branches).some((branch) => list(branch.armRecords).length))
		skipped.push({ kind: 'branch-arm', reason: 'branch arm host paths require the currently selected graph arm' });
	return { plans, skipped };
}

export function evaluateLocatorResolution<Node>(
	plans: readonly LocatorPlan[],
	roots: readonly Node[],
	adapter: WalkableDomAdapter<Node>,
	skipped: readonly { readonly kind: string; readonly reason: string }[] = [],
): LocatorResolutionEvaluation {
	const hostCandidates = new Map<string, Node[]>();
	for (const plan of plans) {
		if (plan.strategy !== 'element-order' || !plan.hostNodeId) continue;
		const found = roots.flatMap((root) => {
			const node = elementWalk(root, adapter)[plan.index];
			return node && tagMatches(node, plan.tagName, adapter) ? [node] : [];
		});
		hostCandidates.set(plan.hostNodeId, [...(hostCandidates.get(plan.hostNodeId) ?? []), ...found]);
	}
	const failures: string[] = [];
	for (const plan of plans) {
		const found = resolvePlan(plan, roots, hostCandidates, adapter);
		if (found.length !== 1)
			failures.push(
				`${plan.kind} ${plan.id} path ${planPath(plan)} resolved to ${found.length} nodes (expected exactly one)`,
			);
	}
	return {
		invariant: {
			id: 'MLA-S3-LOCATOR-RESOLUTION',
			status: failures.length ? 'fail' : 'pass',
			details: failures,
		},
		coverage: {
			covered: [...new Set(plans.map((plan) => plan.kind))].sort(),
			skipped: [...skipped],
		},
	};
}

function resolvePlan<Node>(plan: LocatorPlan, roots: readonly Node[], hosts: ReadonlyMap<string, Node[]>, adapter: WalkableDomAdapter<Node>): Node[] {
	if (plan.strategy === 'host-reference') return hosts.get(plan.hostNodeId) ?? [];
	if (plan.strategy === 'element-order')
		return roots.flatMap((root) => {
			const node = elementWalk(root, adapter)[plan.index];
			return node && tagMatches(node, plan.tagName, adapter) ? [node] : [];
		});
	if (plan.strategy === 'comment-order')
		return roots.flatMap((root) => {
			const node = commentWalk(root, adapter)[plan.index];
			return node ? [node] : [];
		});
	const starts = plan.fromHostNodeId ? hosts.get(plan.fromHostNodeId) ?? [] : roots;
	return starts.flatMap((start) => {
		let node: Node | undefined = start;
		for (const index of plan.path) node = node && adapter.childNodes(node)[index];
		return node && (plan.nodeType === undefined || adapter.nodeType(node) === plan.nodeType) ? [node] : [];
	});
}

function elementWalk<Node>(root: Node, adapter: WalkableDomAdapter<Node>): Node[] {
	return walk(root, adapter).filter((node) => adapter.nodeType(node) === 1);
}
function commentWalk<Node>(root: Node, adapter: WalkableDomAdapter<Node>): Node[] {
	return walk(root, adapter).filter((node) => {
		const data = adapter.commentData?.(node) ?? '';
		return adapter.nodeType(node) === 8 && !/^\/?markless:arm-branch:/.test(data);
	});
}
function walk<Node>(root: Node, adapter: WalkableDomAdapter<Node>): Node[] {
	const result: Node[] = [];
	(function visit(node: Node) {
		result.push(node);
		for (const child of adapter.childNodes(node)) visit(child);
	})(root);
	return result;
}
function tagMatches<Node>(node: Node, expected: string | undefined, adapter: WalkableDomAdapter<Node>): boolean {
	return !expected || expected === '*' || adapter.tagName?.(node)?.toLowerCase() === expected.toLowerCase();
}
function planPath(plan: LocatorPlan): string {
	if (plan.strategy === 'element-order' || plan.strategy === 'comment-order') return String(plan.index);
	if (plan.strategy === 'host-reference') return plan.hostNodeId;
	return plan.path.join('.');
}
