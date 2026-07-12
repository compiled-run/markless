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
	readonly instrument?: true;
};
export type MarklessExecutionModuleSizes = ReadonlyMap<string, MarklessExecutionModuleSize>;
export type MarklessExecutionAttribution = Readonly<
	Record<string, Readonly<Record<string, string>>>
>;
export type MarklessExecutionAccounting = {
	readonly appBytes: number | null;
	readonly instrumentBytes: number | null;
	readonly appModules: number;
	readonly instrumentModules: number;
	readonly estimated: { readonly app: boolean; readonly instrument: boolean };
	readonly unmappedIds: ReadonlyArray<string>;
};

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
	const accounting = accountMarklessExecution(input.executedModules, input.moduleSizes);
	return `markless: resumed — ${formatCategory(accounting, 'app')} executed, ${input.preloadedModuleCount} modules preloaded (${accounting.appModules} app executed) · ${formatCategory(accounting, 'instrument')}`;
}

export function describeMarklessExecutionCauses(input: {
	readonly eventName: string;
	readonly eventRecord?: MarklessExecutionEventRecord | null;
	readonly before: ReadonlySet<string>;
	readonly after: ReadonlySet<string>;
	readonly view?: MarklessExecutionView;
	readonly dispatchModuleId?: string;
	readonly moduleSizes?: MarklessExecutionModuleSizes;
	readonly attribution?: MarklessExecutionAttribution;
	readonly routeFile?: string;
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
		for (const moduleId of warmModuleIds(
			input.dispatchModuleId,
			qualifiedSymbolIds(
				input.eventRecord.symbolIds ?? [],
				input.eventRecord.hostNodeId,
				input.moduleSizes,
				input.attribution,
				input.routeFile,
			),
		)) {
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

function qualifiedSymbolIds(
	ids: ReadonlyArray<string>,
	hostNodeId: string,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
	attribution: MarklessExecutionAttribution | undefined,
	routeFile: string | undefined,
): ReadonlyArray<string> {
	if (
		!moduleSizes ||
		!attribution ||
		!routeFile ||
		routeFile.includes('..') ||
		routeFile.includes('\\')
	)
		return ids;
	const canonicalRoute = routeFile.replace(/^\/+/, '');
	const scopes = Object.prototype.hasOwnProperty.call(attribution, canonicalRoute)
		? attribution[canonicalRoute]
		: undefined;
	if (!scopes) return ids;
	const hostMatch = /^((?:c\d+:)*)[^:]+$/.exec(hostNodeId);
	const hostScope = hostMatch?.[1];
	return ids.map((id) => {
		const ownScope = /^((?:c\d+:)+)(.*)$/.exec(id);
		const scope = ownScope?.[1] ?? hostScope;
		if (scope === undefined || !Object.prototype.hasOwnProperty.call(scopes, scope)) return id;
		const localId = ownScope?.[2] ?? id;
		if (!localId.startsWith('symbol:')) return id;
		const encodedSource = scopes[scope];
		const matches = [...moduleSizes.keys()].filter((key) => {
			const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(key);
			if (!match || match[1] !== encodedSource) return false;
			try {
				return decodeURIComponent(match[2]!) === localId;
			} catch {
				return false;
			}
		});
		return matches.length === 1 ? matches[0]! : id;
	});
}

export function formatMarklessExecutedSize(
	modules: ReadonlyArray<string>,
	moduleSizes?: MarklessExecutionModuleSizes,
): string {
	const accounting = accountMarklessExecution(modules, moduleSizes);
	return `${formatCategory(accounting, 'app')} executed · ${formatCategory(accounting, 'instrument')}`;
}

export function accountMarklessExecution(
	modules: ReadonlyArray<string>,
	moduleSizes?: MarklessExecutionModuleSizes,
): MarklessExecutionAccounting {
	const canonicalIds = [...new Set(modules.map((id) => canonicalModuleId(id, moduleSizes)))];
	if (!moduleSizes) {
		return {
			appBytes: canonicalIds.length === 0 ? 0 : null,
			instrumentBytes: 0,
			appModules: canonicalIds.length,
			instrumentModules: 0,
			estimated: { app: false, instrument: false },
			unmappedIds: [],
		};
	}
	let appBytes = 0;
	let instrumentBytes = 0;
	let appModules = 0;
	let instrumentModules = 0;
	let appEstimated = false;
	let instrumentEstimated = false;
	const unmappedIds: string[] = [];
	for (const id of canonicalIds) {
		const size = moduleSizes.get(id);
		if (!size) {
			unmappedIds.push(id);
			appModules++;
			continue;
		}
		const bytes = size.estimated ? size.raw : (size.gzip ?? size.raw);
		if (size.instrument) {
			instrumentModules++;
			instrumentBytes += bytes;
			instrumentEstimated ||= !!size.estimated;
		} else {
			appModules++;
			appBytes += bytes;
			appEstimated ||= !!size.estimated;
		}
	}
	return {
		appBytes: unmappedIds.length ? null : appBytes,
		instrumentBytes,
		appModules,
		instrumentModules,
		estimated: { app: appEstimated, instrument: instrumentEstimated },
		unmappedIds,
	};
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

function formatCategory(
	accounting: MarklessExecutionAccounting,
	category: 'app' | 'instrument',
): string {
	const bytes = category === 'app' ? accounting.appBytes : accounting.instrumentBytes;
	const modules = category === 'app' ? accounting.appModules : accounting.instrumentModules;
	if (bytes === null) {
		const count = `${modules} ${category} module${modules === 1 ? '' : 's'}`;
		return category === 'app' && accounting.unmappedIds.length
			? `${count} (bytes unknown; ${accounting.unmappedIds.length} unmapped)`
			: count;
	}
	return `${(bytes / 1024).toFixed(1)} KB${accounting.estimated[category] ? ' est.' : ''} ${category}`;
}

function formatExecutedKb(
	modules: ReadonlyArray<string>,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes) return modules.length === 1 ? '1 module' : `${modules.length} modules`;
	const accounting = accountMarklessExecution(modules, moduleSizes);
	if (accounting.unmappedIds.length) return 'bytes unknown';
	const total = (accounting.appBytes ?? 0) + (accounting.instrumentBytes ?? 0);
	const estimated = accounting.estimated.app || accounting.estimated.instrument;
	return `${(total / 1024).toFixed(1)} KB${estimated ? ' est.' : ''}`;
}

function moduleKbSuffix(
	moduleId: string,
	moduleSizes: MarklessExecutionModuleSizes | undefined,
): string {
	if (!moduleSizes) return '';
	const canonicalId = canonicalModuleId(moduleId, moduleSizes);
	const instrument = moduleSizes.get(canonicalId)?.instrument ? ' instrument' : '';
	return ` (${formatExecutedKb([moduleId], moduleSizes)}${instrument})`;
}

function warmModuleIds(
	dispatchModuleId: string | undefined,
	symbolIds: ReadonlyArray<string> | undefined,
): string[] {
	return [
		...new Set([dispatchModuleId, ...(symbolIds ?? [])].filter((id): id is string => !!id)),
	];
}
