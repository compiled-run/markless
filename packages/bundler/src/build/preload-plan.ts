import { joinURL } from 'ufo';
import type { MarklessBundleGraph } from '../types.ts';

export type ModulePreloadPlanInput = {
	readonly bundleGraph: MarklessBundleGraph | undefined;
	readonly roots: readonly ModulePreloadRoot[];
	readonly base?: string;
	readonly minProbability?: number;
	readonly maxPreloads?: number;
};

export type ModulePreloadRoot =
	| string
	| {
			readonly name: string;
			readonly priority?: ModulePreloadPriority;
			readonly fetchPriority?: ModulePreloadFetchPriority;
	  };

export type ModulePreloadPriority = 'high' | 'auto' | 'low';
export type ModulePreloadFetchPriority = 'high' | 'auto' | 'low';

export type ModulePreloadPlanEntry = {
	readonly href: string;
	readonly name: string;
	readonly priority: ModulePreloadPriority;
	readonly fetchPriority?: ModulePreloadFetchPriority;
	readonly probability: number;
};

type BundleGraphEdgeKind = 'static' | 'dynamic';

type ParsedBundleGraphEdge = {
	readonly name: string;
	readonly kind: BundleGraphEdgeKind;
	readonly probability: number;
};

type ParsedBundleGraphRecord = {
	readonly name: string;
	readonly deps: readonly ParsedBundleGraphEdge[];
};

const DEFAULT_MIN_PROBABILITY = 0.5;
const JAVASCRIPT_MODULE_RE = /\.(?:mjs|js)(?:[?#].*)?$/;
const PRIORITY_RANK: Record<ModulePreloadPriority, number> = {
	high: 2,
	auto: 1,
	low: 0,
};

export function planModulePreloadUrls(input: ModulePreloadPlanInput): string[] {
	return planModulePreloads(input).map((preload) => preload.href);
}

export function planModulePreloads(input: ModulePreloadPlanInput): ModulePreloadPlanEntry[] {
	const minProbability = input.minProbability ?? DEFAULT_MIN_PROBABILITY;
	const maxPreloads = input.maxPreloads ?? Number.POSITIVE_INFINITY;
	const graph = parseBundleGraph(input.bundleGraph);
	const planned = new Map<
		string,
		ModulePreloadPlanEntry & {
			readonly order: number;
		}
	>();
	const bestVisitByNode = new Map<
		string,
		{ readonly probability: number; readonly priorityRank: number }
	>();
	let order = 0;

	const addModule = (
		name: string,
		probability: number,
		priority: ModulePreloadPriority,
		fetchPriority: ModulePreloadFetchPriority | undefined,
	) => {
		if (!isPreloadableModuleName(name)) return;
		const href = preloadHref(input.base, name);
		const existing = planned.get(href);
		const nextRank = PRIORITY_RANK[priority];
		const existingRank = existing ? PRIORITY_RANK[existing.priority] : -1;
		if (
			existing &&
			(existingRank > nextRank ||
				(existingRank === nextRank && existing.probability >= probability))
		) {
			return;
		}
		planned.set(href, {
			fetchPriority,
			href,
			name,
			order: existing?.order ?? order++,
			priority,
			probability,
		});
	};

	const visit = (
		name: string,
		probability: number,
		priority: ModulePreloadPriority,
		fetchPriority: ModulePreloadFetchPriority | undefined,
		seen: ReadonlySet<string>,
	) => {
		if (probability < minProbability || planned.size >= maxPreloads) return;

		const priorityRank = PRIORITY_RANK[priority];
		const previousBest = bestVisitByNode.get(name);
		if (
			previousBest &&
			(previousBest.priorityRank > priorityRank ||
				(previousBest.priorityRank === priorityRank &&
					previousBest.probability >= probability))
		) {
			return;
		}
		bestVisitByNode.set(name, { priorityRank, probability });

		if (seen.has(name)) return;
		const nextSeen = new Set(seen);
		nextSeen.add(name);

		const record = graph.get(name);
		if (!record) {
			addModule(name, probability, priority, fetchPriority);
			return;
		}

		for (const dep of record.deps.filter((item) => item.kind === 'static')) {
			visit(dep.name, probability * dep.probability, priority, fetchPriority, nextSeen);
		}
		addModule(name, probability, priority, fetchPriority);
		for (const dep of record.deps.filter((item) => item.kind === 'dynamic')) {
			const edgeProbability = JAVASCRIPT_MODULE_RE.test(name) ? dep.probability : 1;
			visit(dep.name, probability * edgeProbability, priority, fetchPriority, nextSeen);
		}
	};

	for (const root of input.roots) {
		const normalized = normalizeRoot(root);
		visit(normalized.name, 1, normalized.priority, normalized.fetchPriority, new Set());
	}

	return [...planned.values()]
		.sort((left, right) => {
			const priority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
			if (priority !== 0) return priority;
			return left.order - right.order;
		})
		.slice(0, maxPreloads)
		.map(({ order: _order, ...preload }) => preload);
}

function parseBundleGraph(
	graph: MarklessBundleGraph | undefined,
): ReadonlyMap<string, ParsedBundleGraphRecord> {
	const records = new Map<string, ParsedBundleGraphRecord>();
	if (!graph) return records;

	let index = 0;
	while (index < graph.length) {
		const name = graph[index++];
		if (typeof name !== 'string') continue;

		const deps: ParsedBundleGraphEdge[] = [];
		let probability = 1;
		let kind: BundleGraphEdgeKind = 'static';
		while (typeof graph[index] === 'number') {
			const marker = graph[index++] as number;
			if (marker < 0) {
				probability = -marker / 10;
				kind = 'dynamic';
				continue;
			}

			const dep = graph[marker];
			if (typeof dep === 'string') {
				deps.push({ name: dep, kind, probability });
			}
		}
		records.set(name, { name, deps });
	}

	return records;
}

function preloadHref(base: string | undefined, name: string): string {
	if (!base || /^(?:[a-z]+:)?\/\//i.test(name)) return name;
	return joinURL(base, name);
}

function isPreloadableModuleName(name: string): boolean {
	return JAVASCRIPT_MODULE_RE.test(name) || isViteDevModuleUrl(name);
}

function isViteDevModuleUrl(name: string): boolean {
	return (
		(name.startsWith('/') || name.startsWith('@id/')) && /(?:^|[?&])import(?:[&#]|$)/.test(name)
	);
}

function normalizeRoot(root: ModulePreloadRoot): {
	readonly name: string;
	readonly priority: ModulePreloadPriority;
	readonly fetchPriority?: ModulePreloadFetchPriority;
} {
	if (typeof root === 'string') {
		return { name: root, priority: 'auto', fetchPriority: 'auto' };
	}
	const priority = root.priority ?? 'auto';
	return {
		name: root.name,
		priority,
		fetchPriority: root.fetchPriority ?? priorityToFetchPriority(priority),
	};
}

function priorityToFetchPriority(
	priority: ModulePreloadPriority,
): ModulePreloadFetchPriority | undefined {
	if (priority === 'auto') return 'auto';
	return priority;
}
