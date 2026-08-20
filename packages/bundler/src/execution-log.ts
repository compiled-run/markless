import type { ExecutionAttributionTables } from '@markless/compiler';
import type { MarklessExecutionLogMode } from './types.ts';
import type { GlobalInjections } from './types.ts';

export const MARKLESS_EXECUTION_LOG_MODULE_ID = 'virtual:markless:dev-log';

// The runtime names these on dispatch records, so the size map must key them
// even though no hook injects them; a new dispatch site must be declared here
// or the bundler suite fails.
export const EXECUTION_LOG_DISPATCH_MODULE_IDS = ['web:render-csr', 'web:resume-events'] as const;

// The one cumulative ledger every producer publishes into: the emitted
// instrument, the inline activation script, and the inline resumer.
export const MARKLESS_EXECUTION_LEDGER_GLOBAL = '__marklessExecutionLedger';

// Chunk-raw-bytes is the honest unit for a build map at chunk granularity.
export const MARKLESS_EXECUTION_LEDGER_INIT =
	"{ unit: 'chunk-raw-bytes', load: { app: 0, framework: 0, instrument: 0, inline: 0, modules: [] }, total: { app: 0, framework: 0, instrument: 0, inline: 0 }, turns: [], incomplete: null }";

// The first TRUSTED one of these ends the load window. Only raw input counts:
// click/input/change are derived and a page can dispatch them itself, which
// would close load on work the user never asked for.
export const EXECUTION_LOG_GESTURE_EVENTS = [
	'pointerdown',
	'touchstart',
	'keydown',
] as const;

export const EXECUTION_LOG_FRAMEWORK_ID_PATTERN =
	'/^(?:web|runtime|serializer|router|core|analyzer):/';

export type { ExecutionAttributionTables };

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

const EXECUTION_LOG_HOOK_LINE = /^globalThis\.__mxLog\?\.add\("(?:[^"\\]|\\.)*"\);\n/;

// The transform pass injects per-source-module symbol log ids ("symbol:N")
// that collide across source files. The plugin re-keys the hook to the symbol
// virtual module id (which embeds the source filename) so the executed id is
// exactly the size-map join key. No-op when the source carries no hook
// (production symbol modules).
export function hasExecutionLogModuleHook(source: string): boolean {
	return EXECUTION_LOG_HOOK_LINE.test(source);
}

export function requalifyExecutionLogModuleHook(source: string, moduleId: string): string {
	if (!EXECUTION_LOG_HOOK_LINE.test(source)) return source;
	return source.replace(
		EXECUTION_LOG_HOOK_LINE,
		`globalThis.__mxLog?.add(${JSON.stringify(moduleId)});\n`,
	);
}

export function executionLogVirtualModuleSource(
	options: {
		readonly moduleSizes?: ReadonlyMap<string, number>;
		readonly attribution?: ExecutionAttributionTables;
		readonly sizesUrl?: string;
	} = {},
): string {
	if (!options.moduleSizes) return executionLogVirtualModuleSourceWithOwnSize(options, null);
	// The module logs its own execution, so the dev estimate join must cover it
	// too: measure the emitted source and embed that size (build sizes come
	// from the emitted execution-sizes asset instead).
	return executionLogVirtualModuleSourceWithOwnSize(
		options,
		executionLogVirtualModuleSourceWithOwnSize(options, 0).length,
	);
}

function executionLogVirtualModuleSourceWithOwnSize(
	options: {
		readonly moduleSizes?: ReadonlyMap<string, number>;
		readonly attribution?: ExecutionAttributionTables;
		readonly sizesUrl?: string;
	},
	ownRawSize: number | null,
): string {
	const moduleSizes = options.moduleSizes
		? Object.fromEntries([
				...[...options.moduleSizes].map(([id, raw]) => [id, { raw, estimated: true }]),
				[
					MARKLESS_EXECUTION_LOG_MODULE_ID,
					{ raw: ownRawSize ?? 0, estimated: true, instrument: true },
				],
			])
		: null;
	return `
globalThis.__mxLog?.add(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});
const marklessDefaultModuleSizes = ${JSON.stringify(moduleSizes)};
const marklessDefaultAttribution = ${JSON.stringify(options.attribution ?? null)};
const marklessSizesUrl = ${JSON.stringify(options.sizesUrl ?? null)};
let marklessSizesPromise;
let marklessAttribution;
let marklessInstallPromise;
let marklessRenderSummaryTurn;
function modules(log) { return log ? [...log] : []; }
function sizeRecord(input) { return !input ? undefined : typeof input === 'number' ? { raw: input, estimated: true } : input; }
function normalizeSizes(input) { if (!input) return undefined; const map = new Map(); for (const id of Object.keys(input)) if (id !== 'attribution' && id !== 'unshipped') map.set(id, sizeRecord(input[id])); return map; }
async function loadModuleSizes(input) {
	if (input.moduleSizes) return normalizeSizes(input.moduleSizes);
	if (marklessDefaultModuleSizes) { marklessAttribution = marklessDefaultAttribution; return normalizeSizes(marklessDefaultModuleSizes); }
	if (!marklessSizesUrl) return undefined;
	marklessSizesPromise ||= fetch(marklessSizesUrl).then((response) => response.ok ? response.json() : undefined).then((payload) => { marklessAttribution = payload && payload.attribution; return normalizeSizes(payload); }).catch(() => undefined);
	return marklessSizesPromise;
}
function symbolParts(id) { const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(id); if (!match) return null; try { return { source: decodeURIComponent(match[1]), symbolId: decodeURIComponent(match[2]) }; } catch { return null; } }
function baseSymbolId(id) { if (!id.startsWith('bound:')) return null; const separator = id.indexOf(':', 'bound:'.length); if (separator < 0) return null; try { return decodeURIComponent(id.slice('bound:'.length, separator)); } catch { return null; } }
function routeFile() { const text = document.querySelector?.('script[type="@markless/core/route"]')?.textContent; if (!text) return null; try { const value = JSON.parse(text).file; return typeof value === 'string' ? value : null; } catch { return null; } }
// Attribution tables are keyed by the bare path this lookup can name: the
// document's route file, or — for a routeless page — the build's single root,
// which is the only page it can be.
function attributionScopes(tables) { if (!tables) return undefined; const route = routeFile(); if (route) { if (route.includes('..') || route.includes('\\\\')) return undefined; const canonical = route.replace(/^\\/+/, ''); return Object.prototype.hasOwnProperty.call(tables, canonical) ? tables[canonical] : undefined; } const roots = Object.keys(tables); return roots.length === 1 ? tables[roots[0]] : undefined; }
// A handler renders inside one component but is owned by whichever component
// created the closure — a prop-passed onClick renders at the child's scope and
// belongs to the parent. The owner is therefore somewhere on the host's render
// ancestry, so once the host's OWN scope is one the table names, the chain is
// walked outward and the first scope holding exactly one candidate wins. Never a
// guess: a host in a scope the table does not name is refused outright, a scope
// with zero or several candidates is skipped, and an id nobody owns uniquely
// stays unmapped.
function scopeChain(scope) { const chain = []; for (let current = scope; ; ) { chain.push(current); if (!current) return chain; const next = current.replace(/c\\d+:$/, ''); if (next === current) return chain; current = next; } }
function qualifySymbolIds(ids, hostNodeId, sizes, tables) { const scopes = attributionScopes(tables); if (!scopes) return ids; const host = /^((?:c\\d+:)*)[^:]+$/.exec(hostNodeId); const hostScope = host && host[1]; return ids.map((id) => { const own = /^((?:c\\d+:)+)(.*)$/.exec(id); const scope = own ? own[1] : hostScope; if (scope === null || scope === undefined || !Object.prototype.hasOwnProperty.call(scopes, scope)) return id; const local = own ? own[2] : id; const base = baseSymbolId(local); const sizeSymbolId = base || local; if (!sizeSymbolId.startsWith('symbol:')) return id; for (const candidate of scopeChain(scope)) { if (!Object.prototype.hasOwnProperty.call(scopes, candidate)) continue; const matches = [...(sizes?.keys() || [])].filter((key) => { const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(key); if (!match || match[1] !== scopes[candidate]) return false; try { return decodeURIComponent(match[2]) === sizeSymbolId; } catch { return false; } }); if (matches.length !== 1) continue; if (!base) return matches[0]; const match = /^virtual:markless:symbol:([^:]+):/.exec(matches[0]); return match ? 'virtual:markless:symbol:' + match[1] + ':' + encodeURIComponent(local) : id; } return id; }); }
function canonicalId(id, sizes) {
	if (!sizes || sizes.has(id)) return id;
	const qualified = symbolParts(id); const local = qualified ? qualified.symbolId : id.replace(/^(?:c\\d+:)+/, ''); const sizeSymbolId = baseSymbolId(local) || local;
	if (!sizeSymbolId.startsWith('symbol:')) return id;
	const matches = [...sizes.keys()].filter((key) => { const parts = symbolParts(key); return !!parts && parts.symbolId === sizeSymbolId && (!qualified || parts.source === qualified.source); });
	return matches.length === 1 ? matches[0] : id;
}
function displayId(id) { const parts = symbolParts(id); return parts ? parts.symbolId + ' (' + (parts.source.split('/').pop() || parts.source) + ')' : id; }
function displayObservedId(id, sizes) { const parts = symbolParts(id); return displayId(baseSymbolId(parts ? parts.symbolId : id) ? id : canonicalId(id, sizes)); }
function accounting(items, sizes) {
	const ids = [...new Set(items.map((id) => canonicalId(id, sizes)))];
	if (!sizes) return { appBytes: ids.length ? null : 0, instrumentBytes: 0, appModules: ids.length, instrumentModules: 0, estimated: { app: false, instrument: false }, unmappedIds: [] };
	let appBytes = 0, instrumentBytes = 0, appModules = 0, instrumentModules = 0, appEstimated = false, instrumentEstimated = false; const unmappedIds = [];
	for (const id of ids) { const record = sizes.get(id); if (!record) { appModules++; unmappedIds.push(id); continue; } const bytes = record.raw; if (record.instrument) { instrumentModules++; instrumentBytes += bytes; instrumentEstimated ||= !!record.estimated; } else { appModules++; appBytes += bytes; appEstimated ||= !!record.estimated; } }
	return { appBytes: unmappedIds.length ? null : appBytes, instrumentBytes, appModules, instrumentModules, estimated: { app: appEstimated, instrument: instrumentEstimated }, unmappedIds };
}
function rowKb(items, sizes) { const a = accounting(items, sizes); if (a.unmappedIds.length) return 'bytes unknown'; const total = (a.appBytes || 0) + (a.instrumentBytes || 0); return (total / 1024).toFixed(1) + ' KB' + (a.estimated.app || a.estimated.instrument ? ' est. source' : ''); }
// One cumulative ledger owns every number the console prints. A module's charge
// is the whole raw byte length of the chunk that absorbed it (several modules in
// one chunk are each charged the whole chunk), which is what unit says.
function marklessLedger() { return (globalThis.${MARKLESS_EXECUTION_LEDGER_GLOBAL} ||= ${MARKLESS_EXECUTION_LEDGER_INIT}); }
function ledgerCategory(id, record) { return record && record.instrument ? 'instrument' : ${EXECUTION_LOG_FRAMEWORK_ID_PATTERN}.test(id) ? 'framework' : 'app'; }
function ledgerCharge(l, ids, sizes) {
	const seen = (l.chargedIds ||= new Set());
	const seenChunks = (l.chargedChunks ||= new Set());
	const delta = { app: 0, framework: 0, instrument: 0, gzip: 0, modules: [], unmapped: [] };
	for (const raw of ids) {
		const id = canonicalId(raw, sizes);
		const record = sizes && sizes.get(id);
		// The unit is the chunk, so the dedupe unit is the chunk: one chunk reached
		// under two names (a symbol id and the emitted specifier Rolldown rewrote
		// its hook to) is one charge, not two. Dev estimates carry no chunk, so
		// there the id is still the unit.
		const chunk = record && record.chunk;
		if (chunk ? seenChunks.has(chunk) : seen.has(id)) continue;
		if (chunk) seenChunks.add(chunk); else seen.add(id);
		if (!record) { delta.unmapped.push(id); continue; }
		if (record.estimated) l.unit = 'estimated-source-bytes';
		delta[ledgerCategory(id, record)] += record.raw; delta.gzip += record.gzip || 0; delta.modules.push(id);
	}
	if (delta.unmapped.length) l.incomplete = { reason: 'unmapped-id', ids: [...new Set([...(l.incomplete ? l.incomplete.ids : []), ...delta.unmapped])] };
	return delta;
}
// Load is everything charged before the FIRST USER GESTURE, which the activation
// script latches on the gesture itself (loadClosed) rather than on the kind of
// whichever turn reports first. On an SSR page nothing runs until the click, and
// the instrument and the wake entry both arrive with it; their render/resume
// turns are work that gesture caused, so their charge joins the gesture's turn —
// merged into it if it already exists, carried until it does if it does not.
function ledgerApply(l, kind, label, delta) {
	const gesture = kind !== 'render' && kind !== 'resume';
	if (gesture) l.loadClosed = true;
	for (const name of ['app', 'framework', 'instrument']) { l.total[name] += delta[name]; if (!l.loadClosed) l.load[name] += delta[name]; }
	l.totalGzip = (l.totalGzip || 0) + delta.gzip;
	if (!l.loadClosed) { l.loadGzip = (l.loadGzip || 0) + delta.gzip; for (const id of delta.modules) l.load.modules.push(id); }
	if (!gesture && l.loadClosed) {
		const open = l.open;
		if (open) { open.delta.app += delta.app; open.delta.framework += delta.framework; open.delta.instrument += delta.instrument; for (const id of delta.modules) open.modules.push(id); return open; }
		const held = (l.carry ||= { app: 0, framework: 0, instrument: 0, modules: [] });
		held.app += delta.app; held.framework += delta.framework; held.instrument += delta.instrument; for (const id of delta.modules) held.modules.push(id);
		delta = { app: 0, framework: 0, instrument: 0, modules: [] };
	}
	const carry = gesture ? l.carry : undefined;
	if (carry) l.carry = undefined;
	const turn = { kind, label, delta: { app: delta.app + (carry ? carry.app : 0), framework: delta.framework + (carry ? carry.framework : 0), instrument: delta.instrument + (carry ? carry.instrument : 0) }, modules: carry ? [...carry.modules, ...delta.modules] : delta.modules };
	l.turns.push(turn); if (gesture) l.open = turn;
	return turn;
}
function ledgerKb(bytes) { return (bytes / 1024).toFixed(1) + ' KB'; }
// The instrument is dev-only weight, so it stays out of the headline totals and
// keeps its own category, exactly as the pre-ledger lines did.
function ledgerVisible(part) { return part.app + part.framework + part.inline; }
function ledgerLine(l, turn) {
	let line = 'markless: ' + ledgerKb(ledgerVisible(l.load)) + ' executed at load';
	if (turn && turn.kind !== 'render' && turn.kind !== 'resume') line += ' · this ' + turn.kind + ' +' + ledgerKb(turn.delta.app + turn.delta.framework);
	line += ' · total ' + ledgerKb(ledgerVisible(l.total));
	if (l.totalGzip) line += ' (gzip ' + ledgerKb(l.totalGzip) + ')';
	if (l.incomplete) line += ' · ' + l.incomplete.ids.length + ' unmapped (excluded)';
	return line;
}
function ledgerMirror(l, turn, text, attribute) {
	const root = document.documentElement; if (!root) return;
	root.setAttribute(attribute, text);
	root.setAttribute('data-markless-log-unit', l.unit);
	root.setAttribute('data-markless-log-load-bytes', String(ledgerVisible(l.load)));
	root.setAttribute('data-markless-log-total-bytes', String(ledgerVisible(l.total)));
	root.setAttribute('data-markless-log-inline-bytes', String(l.total.inline));
	if (turn) {
		root.setAttribute('data-markless-log-app-bytes', String(turn.delta.app));
		root.setAttribute('data-markless-log-framework-bytes', String(turn.delta.framework));
		root.setAttribute('data-markless-log-instrument-bytes', String(turn.delta.instrument));
		root.setAttribute('data-markless-log-turn-bytes', String(turn.delta.app + turn.delta.framework));
		root.setAttribute('data-markless-log-turn-modules', turn.modules.join(' '));
		// The headline carries no selector, so the turn's identity lives here.
		root.setAttribute('data-markless-log-turn-label', turn.kind + (turn.label ? ' ' + turn.label : ''));
	}
	if (l.incomplete) root.setAttribute('data-markless-log-incomplete', String(l.incomplete.ids.length)); else root.removeAttribute('data-markless-log-incomplete');
}
function warmIds(event) { return [...new Set([event.dispatchModuleId, ...((event.eventRecord && event.eventRecord.symbolIds) || [])].filter(Boolean))]; }
function causeRows(input) {
	const before = input.before || new Set(); const after = input.after || new Set(); const woken = [...after].filter((id) => !before.has(id)); const record = input.eventRecord;
	const cause = record ? input.eventName + ' matched event record ' + record.hostNodeId : input.eventName + ' matched runtime records';
	const label = (id) => displayObservedId(id, input.moduleSizes);
	const rows = woken.map((id) => 'woke ' + label(id) + (input.moduleSizes ? ' (' + rowKb([id], input.moduleSizes) + (input.moduleSizes.get(canonicalId(id, input.moduleSizes))?.instrument ? ' instrument' : '') + ')' : '') + ' <- ' + cause);
	if (record) for (const id of warmIds(input)) rows.push('ran warm ' + label(id) + (input.moduleSizes ? ' (' + rowKb([id], input.moduleSizes) + (input.moduleSizes.get(canonicalId(id, input.moduleSizes))?.instrument ? ' instrument' : '') + ')' : '') + ' <- ' + cause);
	if (record && !(input.view?.behaviors || []).some((b) => b.hostNodeId === record.hostNodeId)) rows.push('skip behavior — no matching record touched');
	return rows;
}
function mirrorInteraction(l, turn, text) {
	const root = document.documentElement; if (!root) return;
	root.setAttribute('data-markless-log-interactions', String(Number(root.getAttribute('data-markless-log-interactions') || '0') + 1));
	ledgerMirror(l, turn, text, 'data-markless-log-last');
}
export async function installMarklessExecutionLog(input = {}) {
	const log = globalThis.__mxLog; if (!log || globalThis.__mxLogInteraction) return;
	if (marklessInstallPromise) return marklessInstallPromise;
	marklessInstallPromise = (async () => {
	const moduleSizes = await loadModuleSizes(input); const current = modules(log);
	if (input.printResumeSummary !== false) {
		const l = marklessLedger(); const turn = ledgerApply(l, 'resume', undefined, ledgerCharge(l, current, moduleSizes)); const summary = ledgerLine(l, turn);
		// This summary publishes into the ledger and mirrors; it never prints. The
		// ledger's turn line is the one printed line, and a resume that lands
		// beside a render turn would otherwise print the same load figure twice.
		// A turn merged into an open gesture belongs to that gesture, so it mirrors
		// onto the interaction attribute instead of the load one.
		ledgerMirror(l, turn, summary, turn.kind === 'resume' ? 'data-markless-log-summary' : 'data-markless-log-last');
	}
	globalThis.__mxLogInteraction = (event) => {
		const capturedAfter = modules(event.after || log);
		const symbolIds = qualifySymbolIds((event.eventRecord && event.eventRecord.symbolIds) || [], event.eventRecord && event.eventRecord.hostNodeId, moduleSizes, marklessAttribution);
		if (event.eventRecord) event = { ...event, eventRecord: { ...event.eventRecord, symbolIds } };
		const after = capturedAfter; const before = event.before || new Set(); if (log.has(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)}) && !after.includes(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)})) after.push(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)}); const woken = after.filter((id) => !before.has(id)); const warm = warmIds(event);
		const l = marklessLedger(); const label = '[' + (event.selector || 'event target') + ']';
		if (event.noMatch) {
			const turn = ledgerApply(l, event.eventName, label, ledgerCharge(l, [], moduleSizes)); const line = ledgerLine(l, turn) + ' · no event record matched ' + label;
			console.info(line); mirrorInteraction(l, turn, line); return;
		}
		const turn = ledgerApply(l, event.eventName, label, ledgerCharge(l, [...woken, ...warm], moduleSizes)); const header = ledgerLine(l, turn);
		console.groupCollapsed(header);
		console.log(event.eventName + ' ' + label + ' · woke ' + woken.length + ' modules · ran warm ' + warm.length + ' modules');
		for (const row of causeRows({ ...event, after: new Set(after), moduleSizes })) console.log(row);
		console.groupEnd(); mirrorInteraction(l, turn, header);
	};
	log.__marklessInstalled = true;
	})();
	return marklessInstallPromise;
}
export async function logMarklessInteraction(event) { await installMarklessExecutionLog({ printResumeSummary: false }); globalThis.__mxLogInteraction?.(event); }
export async function logMarklessSpecializedInteraction(input, before) {
	const target = input.element ?? input.event?.target;
	const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : 'element';
	await logMarklessInteraction({ eventName: input.event?.type ?? 'event', eventRecord: input.eventRecord, before, selector: tag + (target?.id ? '#' + target.id : ''), after: new Set(globalThis.__mxLog) });
}
function marklessRenderSummaryTurnEnd() {
	// Each injected entry module calls in from its own dynamic-import
	// resolution, so a microtask window closes between callers of one render;
	// a frame holds them all. The timeout is the backstop for a document that
	// never paints, and whichever lands first ends the turn.
	if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
	return new Promise((resolve) => { let ended; const end = () => { if (ended) return; ended = true; resolve(); }; requestAnimationFrame(end); setTimeout(end, 50); });
}
// Only the console line coalesces: the attribute mirror keeps its per-call
// last-wins timing, which the interaction mirror interleaves with.
function coalesceMarklessRenderSummaryLine(summary) {
	if (marklessRenderSummaryTurn) { marklessRenderSummaryTurn.summary = summary; return marklessRenderSummaryTurn.printed; }
	const turn = { summary };
	turn.printed = marklessRenderSummaryTurnEnd().then(() => { marklessRenderSummaryTurn = undefined; console.log(turn.summary); });
	marklessRenderSummaryTurn = turn;
	return turn.printed;
}
export async function logMarklessRenderSummary(input = {}) {
	const log = globalThis.__mxLog; if (!log) return;
	const moduleSizes = await loadModuleSizes(input); const l = marklessLedger();
	const turn = ledgerApply(l, 'render', undefined, ledgerCharge(l, modules(log), moduleSizes));
	const summary = ledgerLine(l, turn);
	if (turn.kind !== 'render') { ledgerMirror(l, turn, summary, 'data-markless-log-last'); return; }
	ledgerMirror(l, turn, summary, 'data-markless-log-summary');
	return coalesceMarklessRenderSummaryLine(summary);
}
`;
}

export function executionLogActivationInjection(
	mode: MarklessExecutionLogMode | undefined,
): GlobalInjections | null {
	if (normalizeExecutionLogMode(mode) === 'never') return null;
	const predicate =
		mode === 'always'
			? 'true'
			: "/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::|$)/.test(l.origin) || new URLSearchParams(l.search).has('markless-log') || (() => { try { return localStorage.getItem('marklessLog') === '1'; } catch { return false; } })()";
	return {
		tag: 'script',
		location: 'head' as const,
		// The script charges its own shipped byte length: inline document scripts
		// are real executed JS that no module-granularity ledger can see. It also
		// latches the end of load on the first user gesture — the only observer
		// early enough to see it, and the only honest boundary for "at load".
		children: `(() => { const l = location; if (${predicate}) { globalThis.__mxLog = globalThis.__mxLog || new Set(); const g = globalThis.${MARKLESS_EXECUTION_LEDGER_GLOBAL} = globalThis.${MARKLESS_EXECUTION_LEDGER_GLOBAL} || ${MARKLESS_EXECUTION_LEDGER_INIT}; const s = document.currentScript && document.currentScript.textContent; if (s) { g.total.inline += s.length; if (!g.loadClosed) g.load.inline += s.length; } const c = (e) => { if (e.isTrusted) g.loadClosed = true; }; for (const t of ${JSON.stringify(EXECUTION_LOG_GESTURE_EVENTS)}) addEventListener(t, c, { capture: true, passive: true }); } })();`,
	};
}
