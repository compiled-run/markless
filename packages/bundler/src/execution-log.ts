import type { MarklessExecutionLogMode } from './types.ts';

export const MARKLESS_EXECUTION_LOG_MODULE_ID = 'virtual:markless:dev-log';

export function normalizeExecutionLogMode(
	mode: MarklessExecutionLogMode | undefined,
): MarklessExecutionLogMode {
	return mode ?? 'auto';
}

export function injectExecutionLogModuleHook(
	source: string,
	moduleId: string,
	mode: MarklessExecutionLogMode | undefined,
): string {
	if (normalizeExecutionLogMode(mode) === 'never') return source;
	return `globalThis.__mxLog?.add(${JSON.stringify(moduleId)});\n${source}`;
}

export function executionLogVirtualModuleSource(): string {
	return `
globalThis.__mxLog?.add(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});
function modules(log) {
	return log ? [...log] : [];
}
function bytesText(items, sizes) {
	if (!sizes) return items.length === 1 ? '1 module executed' : items.length + ' modules executed';
	let total = 0;
	for (const id of items) total += sizes[id] || 0;
	return (total / 1024).toFixed(1) + ' KB est. executed';
}
function causeRows(input) {
	const before = input.before || new Set();
	const after = input.after || new Set();
	const woken = [...after].filter((id) => !before.has(id));
	const record = input.eventRecord;
	const cause = record ? input.eventName + ' matched event record ' + record.hostNodeId : input.eventName + ' matched runtime records';
	const rows = woken.map((id) => 'woke ' + id + ' <- ' + cause);
	if (record && !(input.view?.behaviors || []).some((b) => b.hostNodeId === record.hostNodeId)) rows.push('skip behavior — no matching record touched');
	return rows;
}
export function installMarklessExecutionLog(input = {}) {
	const log = globalThis.__mxLog;
	if (!log || log.__marklessInstalled) return;
	log.__marklessInstalled = true;
	const moduleSizes = input.moduleSizes;
	const preloaded = input.preloadedModuleCount || document.querySelectorAll('link[rel="modulepreload"]').length;
	const current = modules(log);
	if (input.printResumeSummary !== false) {
		const summary = 'markless: resumed — ' + bytesText(current, moduleSizes) + ', ' + preloaded + ' modules preloaded (' + current.length + ' executed)';
		console.log(summary);
		document.documentElement?.setAttribute('data-markless-log-summary', summary);
	}
	globalThis.__mxLogInteraction = (event) => {
		const after = modules(log);
		const before = event.before || new Set();
		const woken = after.filter((id) => !before.has(id));
		const untouched = Math.max(0, after.length - woken.length);
		console.groupCollapsed('markless: ' + event.eventName + ' [' + (event.selector || 'event target') + '] · woke ' + woken.length + ' modules · ' + untouched + ' untouched');
		for (const row of causeRows({ ...event, after: new Set(after) })) console.log(row);
		console.groupEnd();
	};
}
export function logMarklessInteraction(event) {
	installMarklessExecutionLog({ printResumeSummary: false });
	globalThis.__mxLogInteraction?.(event);
}
`;
}
