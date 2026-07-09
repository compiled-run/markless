export type MarklessExecutionLogMode = 'auto' | 'never' | 'always';
export { describeMarklessEventTarget } from './execution-log-target.ts';
export type MarklessExecutionLogLocation = { readonly origin: string; readonly search: string };
export type MarklessExecutionLogStorage = { readonly getItem: (key: string) => string | null };
export type MarklessExecutionEventRecord = {
	readonly hostNodeId: string;
	readonly symbolIds?: ReadonlyArray<string>;
};
export type MarklessExecutionView = {
	readonly behaviors?: ReadonlyArray<{ readonly hostNodeId: string; readonly symbolId?: string }>;
	readonly domUpdates?: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly symbolId?: string;
	}>;
};
export type MarklessExecutionModuleSize = {
	readonly raw: number;
	readonly gzip?: number;
	readonly chunk?: string;
	readonly estimated?: boolean;
};
export type MarklessExecutionModuleSizes = ReadonlyMap<string, MarklessExecutionModuleSize>;
const MARKLESS_EXECUTION_LOG_MODULE_ID = 'virtual:markless:dev-log';

export function shouldActivateMarklessExecutionLog(input: {
	readonly mode: MarklessExecutionLogMode;
	readonly location: MarklessExecutionLogLocation;
	readonly localStorage?: MarklessExecutionLogStorage;
}): boolean {
	if (input.mode === 'always') return true;
	if (input.mode === 'never') return false;
	if (
		isLocalOrigin(input.location.origin) ||
		new URLSearchParams(input.location.search).has('markless-log')
	)
		return true;
	try {
		return input.localStorage?.getItem('marklessLog') === '1';
	} catch {
		return false;
	}
}

export function formatMarklessResumeSummary(input: {
	readonly executedModules: ReadonlyArray<string>;
	readonly preloadedModuleCount: number;
	readonly moduleSizes?: MarklessExecutionModuleSizes;
}): string {
	const executed = input.executedModules.filter(
		(moduleId) => moduleId !== MARKLESS_EXECUTION_LOG_MODULE_ID,
	).length;
	return `markless: resumed — ${formatExecutedSize(input.executedModules, input.moduleSizes)}, ${input.preloadedModuleCount} modules preloaded (${executed} executed)`;
}

export function describeMarklessExecutionCauses(input: {
	readonly eventName: string;
	readonly eventRecord?: MarklessExecutionEventRecord | null;
	readonly before: ReadonlySet<string>;
	readonly after: ReadonlySet<string>;
	readonly view?: MarklessExecutionView;
	readonly dispatchModuleId?: string;
	readonly moduleSizes?: MarklessExecutionModuleSizes;
}): string[] {
	const woken = [...input.after].filter((moduleId) => !input.before.has(moduleId));
	const cause = input.eventRecord
		? `${input.eventName} matched event record ${input.eventRecord.hostNodeId}`
		: `${input.eventName} matched runtime records`;
	const label = (moduleId: string) =>
		formatMarklessModuleId(canonicalModuleId(moduleId, input.moduleSizes));
	const rows = woken.map(
		(moduleId) =>
			`woke ${label(moduleId)}${moduleKbSuffix(moduleId, input.moduleSizes)} <- ${cause}`,
	);
	if (input.eventRecord) {
		for (const moduleId of warmModuleIds(input.dispatchModuleId, input.eventRecord.symbolIds)) {
			rows.push(
				`ran warm ${label(moduleId)}${moduleKbSuffix(moduleId, input.moduleSizes)} <- ${cause}`,
			);
		}
	}
	if (
		input.eventRecord &&
		!(input.view?.behaviors ?? []).some(
			(behavior) => behavior.hostNodeId === input.eventRecord?.hostNodeId,
		)
	) {
		rows.push('skip behavior — no matching record touched');
	}
	return rows;
}

export function formatMarklessExecutedSize(
	modules: ReadonlyArray<string>,
	moduleSizes?: MarklessExecutionModuleSizes,
): string {
	return `${formatExecutedKb(modules, moduleSizes)} executed`;
}

// Short display form for console rows: qualified symbol execution-log ids
// (the symbol virtual module id — see @markless/bundler source-module.ts, the
// id shape's single source of truth) render as "symbol:N (Source.tsrx)".
export function formatMarklessModuleId(moduleId: string): string {
	const parts = symbolModuleIdParts(moduleId);
	if (!parts) return moduleId;
	const sourceName = parts.source.split('/').pop() || parts.source;
	return `${parts.symbolId} (${sourceName})`;
}

function symbolModuleIdParts(
	moduleId: string,
): { readonly source: string; readonly symbolId: string } | null {
	const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(moduleId);
	if (!match) return null;
	try {
		return { source: decodeURIComponent(match[1]!), symbolId: decodeURIComponent(match[2]!) };
	} catch {
		return null;
	}
}

// Size maps key symbols by qualified id, but payload event records carry the
// module-local id ("symbol:N", possibly behind "c<i>:" child-route prefixes).
// Join those to a qualified entry only when exactly one source module matches;
// an ambiguous id must read as unknown rather than joining a wrong size.
function canonicalModuleId(
	moduleId: string,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes || moduleSizes.has(moduleId)) return moduleId;
	const localId = moduleId.replace(/^(?:c\d+:)+/, '');
	if (!localId.startsWith('symbol:')) return moduleId;
	const matches = [...moduleSizes.keys()].filter(
		(key) => symbolModuleIdParts(key)?.symbolId === localId,
	);
	return matches.length === 1 ? matches[0]! : moduleId;
}

function isLocalOrigin(origin: string): boolean {
	return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(origin);
}

function formatExecutedSize(
	modules: ReadonlyArray<string>,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes)
		return modules.length === 1 ? '1 module executed' : `${modules.length} modules executed`;
	return formatMarklessExecutedSize(modules, moduleSizes);
}

function formatExecutedKb(
	modules: ReadonlyArray<string>,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes) return modules.length === 1 ? '1 module' : `${modules.length} modules`;
	const sizes = uniqueSizeRecords(modules, moduleSizes, false);
	const toolingSizes = uniqueSizeRecords(modules, moduleSizes, true);
	const estimated = [...moduleSizes.values()].some((size) => size.estimated);
	const total = sizeTotal(sizes);
	const toolingTotal = sizeTotal(toolingSizes);
	const tooling =
		toolingTotal > 0
			? ` (tooling ${(toolingTotal / 1024).toFixed(1)} KB${estimated ? ' est.' : ''})`
			: '';
	return `${(total / 1024).toFixed(1)} KB${estimated ? ' est.' : ''}${tooling}`;
}

function moduleKbSuffix(
	moduleId: string,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes) return '';
	return ` (${formatExecutedKb([moduleId], moduleSizes)})`;
}

function warmModuleIds(
	dispatchModuleId: string | undefined,
	symbolIds: ReadonlyArray<string> | undefined,
): string[] {
	return [
		...new Set([dispatchModuleId, ...(symbolIds ?? [])].filter((id): id is string => !!id)),
	];
}

function uniqueSizeRecords(
	modules: ReadonlyArray<string>,
	moduleSizes: MarklessExecutionModuleSizes,
	tooling: boolean,
): MarklessExecutionModuleSize[] {
	const seen = new Set<string>();
	const records: MarklessExecutionModuleSize[] = [];
	for (const moduleId of new Set(modules.map((id) => canonicalModuleId(id, moduleSizes)))) {
		const isTooling = moduleId === MARKLESS_EXECUTION_LOG_MODULE_ID;
		if (isTooling !== tooling) continue;
		const size = moduleSizes.get(moduleId);
		if (!size) continue;
		const key = size.chunk ?? moduleId;
		if (seen.has(key)) continue;
		seen.add(key);
		records.push(size);
	}
	return records;
}

function sizeTotal(sizes: ReadonlyArray<MarklessExecutionModuleSize>): number {
	return sizes.reduce((sum, size) => sum + (size.estimated ? size.raw : (size.gzip ?? size.raw)), 0);
}
