export type MarklessExecutionLogMode = 'auto' | 'never' | 'always';
export type MarklessExecutionLogLocation = { readonly origin: string; readonly search: string };
export type MarklessExecutionLogStorage = { readonly getItem: (key: string) => string | null };
export type MarklessExecutionEventRecord = { readonly hostNodeId: string; readonly symbolIds?: ReadonlyArray<string> };
export type MarklessExecutionView = { readonly behaviors?: ReadonlyArray<{ readonly hostNodeId: string; readonly symbolId?: string }>; readonly domUpdates?: ReadonlyArray<{ readonly hostNodeId: string; readonly symbolId?: string }> };

export function shouldActivateMarklessExecutionLog(input: {
	readonly mode: MarklessExecutionLogMode;
	readonly location: MarklessExecutionLogLocation;
	readonly localStorage?: MarklessExecutionLogStorage;
}): boolean {
	if (input.mode === 'always') return true;
	if (input.mode === 'never') return false;
	if (isLocalOrigin(input.location.origin) || new URLSearchParams(input.location.search).has('markless-log')) return true;
	try {
		return input.localStorage?.getItem('marklessLog') === '1';
	} catch {
		return false;
	}
}

export function formatMarklessResumeSummary(input: {
	readonly executedModules: ReadonlyArray<string>;
	readonly preloadedModuleCount: number;
	readonly moduleSizes?: ReadonlyMap<string, number>;
}): string {
	const executed = input.executedModules.length;
	return `markless: resumed — ${formatExecutedSize(input.executedModules, input.moduleSizes)}, ${input.preloadedModuleCount} modules preloaded (${executed} executed)`;
}

export function describeMarklessExecutionCauses(input: {
	readonly eventName: string;
	readonly eventRecord?: MarklessExecutionEventRecord | null;
	readonly before: ReadonlySet<string>;
	readonly after: ReadonlySet<string>;
	readonly view?: MarklessExecutionView;
}): string[] {
	const woken = [...input.after].filter((moduleId) => !input.before.has(moduleId));
	const cause = input.eventRecord
		? `${input.eventName} matched event record ${input.eventRecord.hostNodeId}`
		: `${input.eventName} matched runtime records`;
	const rows = woken.map((moduleId) => `woke ${moduleId} <- ${cause}`);
	if (input.eventRecord && !(input.view?.behaviors ?? []).some((behavior) => behavior.hostNodeId === input.eventRecord?.hostNodeId)) {
		rows.push('skip behavior — no matching record touched');
	}
	return rows;
}

function isLocalOrigin(origin: string): boolean {
	return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(origin);
}

function formatExecutedSize(
	modules: ReadonlyArray<string>,
	moduleSizes: ReadonlyMap<string, number> | undefined,
): string {
	if (!moduleSizes) return modules.length === 1 ? '1 module executed' : `${modules.length} modules executed`;
	let total = 0;
	for (const moduleId of modules) total += moduleSizes.get(moduleId) ?? 0;
	return `${(total / 1024).toFixed(1)} KB est. executed`;
}
