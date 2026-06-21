import {
	planModulePreloads,
	type ModulePreloadPlanEntry,
	type ModulePreloadRoot,
} from './preload-plan.ts';
import type { ArcadeBundleGraph } from '../types.ts';

export type LazySymbolPreloadView = {
	readonly events?: ReadonlyArray<{
		readonly symbolIds?: readonly string[];
	}>;
	readonly domUpdates?: ReadonlyArray<{
		readonly symbolId?: string;
	}>;
	readonly behaviors?: ReadonlyArray<{
		readonly symbolId?: string;
	}>;
	readonly asyncBoundaries?: ReadonlyArray<{
		readonly asyncReads?: ReadonlyArray<{
			readonly runnerSymbolId?: string;
		}>;
	}>;
};

export type PreloadLazySymbolModulesInput = {
	readonly view: LazySymbolPreloadView;
	readonly bundleGraph: ArcadeBundleGraph | undefined;
	readonly base?: string;
	readonly document?: ModulePreloadDocument;
	readonly minProbability?: number;
	readonly maxPreloads?: number;
};

export type AppendedModulePreloads = {
	readonly planned: readonly ModulePreloadPlanEntry[];
	readonly appendedHrefs: readonly string[];
};

type ModulePreloadDocument = {
	readonly baseURI?: string;
	readonly head?: {
		appendChild(node: ModulePreloadLink): unknown;
	};
	createElement(name: 'link'): ModulePreloadLink;
	querySelectorAll(selector: string): Iterable<ModulePreloadExistingLink>;
};

type ModulePreloadExistingLink = {
	readonly href?: string;
	getAttribute?(name: string): string | null;
};

type ModulePreloadLink = ModulePreloadExistingLink & {
	rel: string;
	href: string;
	crossOrigin: string;
	setAttribute?(name: string, value: string): void;
};

const PRIORITY_RANK = {
	high: 2,
	auto: 1,
	low: 0,
} as const;

export function preloadLazySymbolModules(
	input: PreloadLazySymbolModulesInput,
): AppendedModulePreloads {
	const planned = planModulePreloads({
		base: input.base,
		bundleGraph: input.bundleGraph,
		maxPreloads: input.maxPreloads,
		minProbability: input.minProbability,
		roots: lazySymbolPreloadRootsFromView(input.view),
	});
	const appendedHrefs = appendModulePreloadLinks(planned, input.document);
	return { appendedHrefs, planned };
}

export function lazySymbolPreloadRootsFromView(view: LazySymbolPreloadView): ModulePreloadRoot[] {
	const roots = new Map<string, Exclude<ModulePreloadRoot, string>>();

	const add = (name: string | undefined, priority: 'high' | 'low') => {
		if (!name) return;
		const existing = roots.get(name);
		if (existing && PRIORITY_RANK[existing.priority ?? 'auto'] >= PRIORITY_RANK[priority]) {
			return;
		}
		roots.set(name, { name, priority });
	};

	for (const event of view.events ?? []) {
		for (const symbolId of event.symbolIds ?? []) {
			add(symbolId, 'high');
		}
	}
	for (const behavior of view.behaviors ?? []) {
		add(behavior.symbolId, 'high');
	}
	for (const update of view.domUpdates ?? []) {
		add(update.symbolId, 'low');
	}
	for (const boundary of view.asyncBoundaries ?? []) {
		for (const read of boundary.asyncReads ?? []) {
			add(read.runnerSymbolId, 'low');
		}
	}

	return [...roots.values()];
}

export function appendModulePreloadLinks(
	preloads: readonly ModulePreloadPlanEntry[],
	document: ModulePreloadDocument | undefined = defaultDocument(),
): string[] {
	if (!document?.head) return [];

	const seen = existingModulePreloadHrefs(document);
	const appended: string[] = [];
	for (const preload of preloads) {
		const href = preload.href;
		if (!href || hasSeenHref(seen, href, document.baseURI)) continue;

		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = href;
		link.crossOrigin = 'anonymous';
		if (preload.fetchPriority) {
			link.setAttribute?.('fetchpriority', preload.fetchPriority);
		}
		document.head.appendChild(link);
		rememberHref(seen, href, document.baseURI);
		appended.push(href);
	}
	return appended;
}

function defaultDocument(): ModulePreloadDocument | undefined {
	return (globalThis as typeof globalThis & { readonly document?: ModulePreloadDocument })
		.document;
}

function existingModulePreloadHrefs(document: ModulePreloadDocument): Set<string> {
	const hrefs = new Set<string>();
	for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
		const href = link.getAttribute?.('href') ?? link.href;
		if (href) rememberHref(hrefs, href, document.baseURI);
	}
	return hrefs;
}

function hasSeenHref(
	seen: ReadonlySet<string>,
	href: string,
	baseURI: string | undefined,
): boolean {
	return seen.has(href) || (!!baseURI && seen.has(new URL(href, baseURI).href));
}

function rememberHref(seen: Set<string>, href: string, baseURI: string | undefined): void {
	seen.add(href);
	if (baseURI) {
		seen.add(new URL(href, baseURI).href);
	}
}
