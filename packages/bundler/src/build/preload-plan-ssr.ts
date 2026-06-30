import { parseURL, withoutLeadingSlash } from 'ufo';
import {
	planModulePreloads,
	type ModulePreloadPlanEntry,
	type ModulePreloadPlanInput,
	type ModulePreloadRoot,
} from './preload-plan.ts';

export type SsrModulePreloadPlanInput = Omit<ModulePreloadPlanInput, 'roots'> & {
	readonly artifact: {
		readonly payloadView?: {
			readonly events?: ReadonlyArray<{
				readonly symbolIds?: ReadonlyArray<string>;
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
	};
	readonly resumeModuleUrl?: string;
};

const SSR_RESUME_MIN_PROBABILITY = 0;

export function planSsrModulePreloads(
	input: SsrModulePreloadPlanInput,
): ModulePreloadPlanEntry[] {
	return planModulePreloads({
		...input,
		minProbability: input.minProbability ?? SSR_RESUME_MIN_PROBABILITY,
		roots: [
			...preloadRootsFromArtifact(input.artifact),
			...(input.resumeModuleUrl
				? [
						{
							name: bundleGraphRootFromUrl(input.resumeModuleUrl, input.base),
							priority: 'high' as const,
						},
					]
				: []),
		],
	});
}

function preloadRootsFromArtifact(
	artifact: SsrModulePreloadPlanInput['artifact'],
): ModulePreloadRoot[] {
	const view = artifact.payloadView;
	return [
		...(view?.events ?? []).flatMap((event) =>
			(event.symbolIds ?? []).map((name) => ({ name, priority: 'high' as const })),
		),
		...(view?.domUpdates ?? []).flatMap((update) =>
			update.symbolId ? [{ name: update.symbolId, priority: 'low' as const }] : [],
		),
		...(view?.behaviors ?? []).flatMap((behavior) =>
			behavior.symbolId ? [{ name: behavior.symbolId, priority: 'high' as const }] : [],
		),
		...(view?.asyncBoundaries ?? []).flatMap((boundary) =>
			(boundary.asyncReads ?? []).flatMap((read) =>
				read.runnerSymbolId
					? [{ name: read.runnerSymbolId, priority: 'low' as const }]
					: [],
			),
		),
	];
}

function bundleGraphRootFromUrl(url: string, base: string | undefined): string {
	const parsed = parseURL(url);
	const pathname = parsed.pathname;
	const pathWithQuery = `${pathname}${parsed.search}`;
	const basePath = base ? parseURL(base).pathname : '';
	if (basePath && pathname.startsWith(basePath)) {
		return `${withoutLeadingSlash(pathname.slice(basePath.length))}${parsed.search}`;
	}
	if (pathname.startsWith('/build/')) {
		return `${pathname.slice('/build/'.length)}${parsed.search}`;
	}
	if (isViteDevModuleUrl(pathWithQuery)) return pathWithQuery;
	return withoutLeadingSlash(pathWithQuery);
}

function isViteDevModuleUrl(name: string): boolean {
	return (
		(name.startsWith('/') || name.startsWith('@id/')) && /(?:^|[?&])import(?:[&#]|$)/.test(name)
	);
}
