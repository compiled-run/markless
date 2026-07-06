import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolSyncPolicy,
	type ProtocolSyncPolicyCondition,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { renderPayloadScripts, serializeRuntimeAsyncSnapshots } from '@markless/serializer';
import type { MarklessExecutionLogMode } from './dev-log.ts';
import { validateKeyedRepeatPayloadKeys } from './repeat-runtime.ts';

export type SsrRenderOutput = {
	readonly html: string;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
};

export type SsrRenderArtifact = {
	readonly renderSsr: (props?: unknown) => SsrRenderOutput;
	readonly headInjections?: ReadonlyArray<RenderHeadInjection>;
	readonly modulePreloads?: ReadonlyArray<ModulePreloadInput>;
	readonly resumeModuleUrl?: string;
	readonly executionLog?: MarklessExecutionLogMode;
};

export type SsrRenderable = (() => SsrRenderOutput) | SsrRenderArtifact;

export type RenderToStringOptions = {
	readonly nonce?: string;
	readonly resumeModuleUrl?: string;
	readonly resumerSource?: string;
	readonly containerId?: string;
	readonly modulePreloads?: ReadonlyArray<ModulePreloadInput>;
	readonly inlineRuntimeRegistry?: Set<string>;
	readonly executionLog?: MarklessExecutionLogMode;
};

export type ModulePreloadInput =
	| string
	| {
			readonly href: string;
			readonly fetchPriority?: 'high' | 'low' | 'auto';
			readonly crossOrigin?: 'anonymous' | 'use-credentials';
	  };

export type RenderHeadInjection = {
	readonly tag: string;
	readonly attributes?: Record<string, string>;
	readonly children?: string;
	readonly location: 'head' | 'body';
};

export async function renderToString(
	component: SsrRenderable,
	options: RenderToStringOptions = {},
): string {
	const output = await renderSsrOutput(component);
	const hasPayload = !!output.state || !!output.view;
	const rawState = output.state ?? emptyStatePayload();
	// Runtime-attached async snapshots carry raw key/value; the served payload
	// needs envelope-encoded fields or resume rejects it on first interaction.
	const state = {
		...rawState,
		computed: serializeRuntimeAsyncSnapshots(rawState.computed ?? []),
	};
	const view = containerScopedView(output.view ?? emptyViewPayload());
	await validateKeyedRepeatPayloadKeys({ state, view });
	const payloadScripts = hasPayload ? renderPayloadScripts({ state, view }) : undefined;
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	const executionLog = options.executionLog ?? artifactExecutionLog(component) ?? 'never';
	const browserTriggers = hasBrowserTriggers(view, state);
	const modulePreloads =
		options.modulePreloads ?? (browserTriggers ? artifactModulePreloads(component) : undefined);
	const resumerScript =
		hasPayload && browserTriggers
			? renderInlineResumerScript(
					options.resumerSource ??
						defaultInlineResumerSource(
							resumeModuleUrl,
							view,
							options.inlineRuntimeRegistry,
							executionLog,
						),
					options.nonce,
				)
			: '';

	return [
		renderHeadInjections(artifactHeadInjections(component), options.nonce),
		renderModulePreloadLinks(modulePreloads, options.nonce),
		`<div${renderContainerAttributes(options.containerId)}>`,
		output.html,
		payloadScripts?.stateScript,
		payloadScripts?.viewScript,
		resumerScript,
		'</div>',
	]
		.filter(Boolean)
		.join('');
}

async function renderSsrOutput(component: SsrRenderable): Promise<SsrRenderOutput> {
	if (typeof component === 'function') return component();
	if (component && typeof component.renderSsr === 'function') return component.renderSsr();
	throw new TypeError('renderToString(App) requires a compiled TSRX artifact.');
}

function artifactResumeModuleUrl(component: SsrRenderable): string | undefined {
	return typeof component === 'object' ? component.resumeModuleUrl : undefined;
}

function artifactModulePreloads(
	component: SsrRenderable,
): ReadonlyArray<ModulePreloadInput> | undefined {
	return typeof component === 'object' ? component.modulePreloads : undefined;
}

function artifactHeadInjections(
	component: SsrRenderable,
): ReadonlyArray<RenderHeadInjection> | undefined {
	return typeof component === 'object' ? component.headInjections : undefined;
}

function artifactExecutionLog(component: SsrRenderable): MarklessExecutionLogMode | undefined {
	return typeof component === 'object' ? component.executionLog : undefined;
}

function renderHeadInjections(
	injections: ReadonlyArray<RenderHeadInjection> | undefined,
	nonce: string | undefined,
): string {
	if (!injections?.length) return '';
	return injections
		.filter((injection) => injection.location === 'head')
		.map((injection) => renderHeadInjection(injection, nonce))
		.join('');
}

function renderHeadInjection(injection: RenderHeadInjection, nonce: string | undefined): string {
	const attributes = { ...injection.attributes };
	if (nonce && injection.tag === 'script' && !attributes.nonce) {
		attributes.nonce = nonce;
	}
	const renderedAttributes = Object.entries(attributes)
		.map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
		.join(' ');
	const suffix = renderedAttributes ? ` ${renderedAttributes}` : '';
	return injection.tag === 'link'
		? `<${injection.tag}${suffix}>`
		: `<${injection.tag}${suffix}>${escapeInlineScript(injection.children ?? '')}</${injection.tag}>`;
}

function renderModulePreloadLinks(
	preloads: ReadonlyArray<ModulePreloadInput> | undefined,
	nonce: string | undefined,
): string {
	if (!preloads?.length) return '';

	const seen = new Set<string>();
	const links: string[] = [];
	for (const preload of preloads) {
		const entry = typeof preload === 'string' ? { href: preload } : preload;
		if (!entry.href || seen.has(entry.href)) continue;
		seen.add(entry.href);

		const attributes = [
			'rel="modulepreload"',
			`href="${escapeAttribute(entry.href)}"`,
			`crossorigin="${escapeAttribute(entry.crossOrigin ?? 'anonymous')}"`,
			entry.fetchPriority ? `fetchpriority="${entry.fetchPriority}"` : '',
			nonce ? `nonce="${escapeAttribute(nonce)}"` : '',
		].filter(Boolean);
		links.push(`<link ${attributes.join(' ')}>`);
	}
	return links.join('');
}

function hasBrowserTriggers(view: ProtocolViewPayload, state: ProtocolStatePayload): boolean {
	return (
		view.events.length > 0 ||
		state.computed.some(
			(computed) =>
				computed.async === false &&
				typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId ===
					'string',
		) ||
		view.behaviors.some((behavior) => !!behavior.symbolId) ||
		view.asyncBoundaries.some((boundary) =>
			boundary.asyncReads.some((read) => !!read.runnerSymbolId),
		) ||
		// Keyed repeat row events live on rowEvents, not view.events.
		(view.keyedRepeats ?? []).some((repeat) => repeat.rowEvents.length > 0) ||
		// Branch arm events live on armRecords, not view.events.
		(view.branches ?? []).some((branch) =>
			(branch.armRecords ?? []).some((arm) => arm.events.length > 0),
		)
	);
}

function containerScopedView(view: ProtocolViewPayload): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.map((locator) => ({
			...locator,
			index: locator.index + 1,
		})),
	};
}

function renderContainerAttributes(containerId: string | undefined): string {
	return containerId
		? ` data-async-container="${escapeAttribute(containerId)}"`
		: ' data-async-container';
}

function renderInlineResumerScript(source: string, nonce: string | undefined): string {
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	return `<script data-async-resumer${nonceAttribute}>${escapeInlineScript(source)}</script>`;
}

function emptyStatePayload(): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function hasSyncPolicies(view: ProtocolViewPayload): boolean {
	return view.events.some((event) => !!event.syncPolicy);
}

function hasGraphSyncPolicies(view: ProtocolViewPayload): boolean {
	return view.events.some(
		(event) =>
			!!event.syncPolicy &&
			syncPolicyBranches(event.syncPolicy).some((branch) =>
				syncPolicyConditionReadsGraph(branch.when),
			),
	);
}

function syncPolicyBranches(
	policy: ProtocolSyncPolicy,
): ReadonlyArray<Extract<ProtocolSyncPolicy, { readonly when: ProtocolSyncPolicyCondition }>> {
	if ('branches' in policy) return policy.branches;
	return [policy];
}

function syncPolicyConditionReadsGraph(condition: ProtocolSyncPolicyCondition): boolean {
	if (condition.type === 'graph-truthy') return true;
	if (condition.type === 'and' || condition.type === 'or') {
		return condition.conditions.some(syncPolicyConditionReadsGraph);
	}
	if (condition.type === 'not') return syncPolicyConditionReadsGraph(condition.condition);
	return false;
}

function shouldEmitInlineRuntime(registry: Set<string> | undefined, key: string): boolean {
	if (!registry) return true;
	if (registry.has(key)) return false;
	registry.add(key);
	return true;
}

function defaultInlineResumerSource(
	resumeModuleUrl: string | undefined,
	view: ProtocolViewPayload,
	inlineRuntimeRegistry?: Set<string>,
	executionLog: MarklessExecutionLogMode = 'never',
): string {
	if (!resumeModuleUrl) {
		return '(() => {})();';
	}

	const includeSyncPolicy = hasSyncPolicies(view);
	const includeGraphSyncPolicy = hasGraphSyncPolicies(view);
	const includeSharedSyncPolicyRuntime =
		includeGraphSyncPolicy && shouldEmitInlineRuntime(inlineRuntimeRegistry, 'sync-policy');
	const sharedSyncPolicySource = includeSharedSyncPolicyRuntime
		? `
	const M = globalThis.__marklessInlineSyncPolicy || (globalThis.__marklessInlineSyncPolicy = {});
	M.d ||= (s, r) => { if (s === null || typeof s !== 'object') return s; if ('$ref' in s) { const x = r.get(s.$ref); if (!x) return undefined; if (x.type === 'object') { const o = {}; for (const [k, v] of x.fields || []) o[k] = M.d(v, r); return o; } if (x.type === 'array') return (x.items || []).map((v) => M.d(v, r)); if (x.type === 'map') return new Map((x.entries || []).map(([k, v]) => [M.d(k, r), M.d(v, r)])); if (x.type === 'set') return new Set((x.values || []).map((v) => M.d(v, r))); if (x.type === 'date') return new Date(x.value); if (x.type === 'regexp') return new RegExp(x.source, x.flags); if (x.type === 'url') return new URL(x.value); if (x.type === 'array-buffer') return new Uint8Array(x.bytes || []).buffer; if (x.type === 'typed-array') { const C = globalThis[x.arrayType]; const b = M.d(x.buffer, r); return C && b instanceof ArrayBuffer ? new C(b, x.byteOffset, x.length) : undefined; } if (x.type === 'data-view') { const b = M.d(x.buffer, r); return b instanceof ArrayBuffer ? new DataView(b, x.byteOffset, x.byteLength) : undefined; } return undefined; } if (s.$type === 'undefined') return undefined; if (s.$type === 'bigint') return BigInt(s.value); if (s.$type === 'date') return new Date(s.value); if (s.$type === 'regexp') return new RegExp(s.source, s.flags); if (s.$type === 'url') return new URL(s.value); return s.value; };
	M.i ||= (r) => { const s0 = r.querySelector('script[type="markless/state"]'); const g = r.__marklessEventOnlyGraph || new Map(); r.__marklessEventOnlyGraph = g; if (s0 && !r.__marklessEventOnlyGraphInitialized) { const s1 = JSON.parse(s0.textContent || 'null'); for (const c of s1.cells || []) { if (!c.value) continue; const r0 = new Map((c.value.records || []).map((r) => [r.id, r])); g.set(c.graphNodeId, M.d(c.value.root, r0)); } r.__marklessEventOnlyGraphInitialized = true; } return g; };
	M.g ||= (r, id, path) => { const g = M.i(r); let value = g.get(id); for (const key of path || []) value = value == null ? undefined : value[key]; return value; };
	M.q ||= (c, e, r) => { if (!c) return false; if (c.type === 'and') return c.conditions.every((x) => M.q(x, e, r)); if (c.type === 'or') return c.conditions.some((x) => M.q(x, e, r)); if (c.type === 'not') return !M.q(c.condition, e, r); if (c.type === 'graph-truthy') return !!M.g(r, c.graphNodeId, c.path); if (c.type === 'constant-truthy') return !!c.value; if (c.type === 'event-equals') return e[c.field] === c.value; return false; };
	M.y ||= (p, e, r) => { for (const b of p.branches || [p]) { if (!M.q(b.when, e, r)) continue; for (const a of b.actions) { if (a === 'preventDefault') e.preventDefault && e.preventDefault(); if (a === 'stopPropagation') e.stopPropagation && e.stopPropagation(); } } };`
		: '';
	const graphConditionSource = includeGraphSyncPolicy
		? `
		if (c.type === 'graph-truthy') return !!globalThis.__marklessInlineSyncPolicy.g(r, c.graphNodeId, c.path);`
		: `
		if (c.type === 'graph-truthy') return false;`;
	const localSyncPolicySource = includeSyncPolicy && !includeSharedSyncPolicyRuntime
		? `
	const q = (c, e) => {
		if (!c) return false;
		if (c.type === 'and') return c.conditions.every((x) => q(x, e));
		if (c.type === 'or') return c.conditions.some((x) => q(x, e));
		if (c.type === 'not') return !q(c.condition, e);
${graphConditionSource}
		if (c.type === 'constant-truthy') return !!c.value;
		if (c.type === 'event-equals') return e[c.field] === c.value;
		return false;
	};
	const y = (p, e) => {
		for (const b of p.branches || [p]) {
			if (!q(b.when, e)) continue;
			for (const a of b.actions) {
				if (a === 'preventDefault') e.preventDefault && e.preventDefault();
				if (a === 'stopPropagation') e.stopPropagation && e.stopPropagation();
			}
		}
	};`
		: '';
	const runSyncPolicy = includeSyncPolicy
		? `
					if (record.syncPolicy) ${includeSharedSyncPolicyRuntime ? 'globalThis.__marklessInlineSyncPolicy.y(record.syncPolicy, e, r)' : 'y(record.syncPolicy, e)'};`
		: '';
	const executionLogPredicate =
		executionLog === 'always'
			? 'true'
			: "/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::|$)/.test(l.origin) || new URLSearchParams(l.search).has('markless-log') || (() => { try { return localStorage.getItem('marklessLog') === '1'; } catch { return false; } })()";
	const executionLogSource =
		executionLog === 'never'
			? ''
			: `
	const logOn = (() => {
		const l = location;
		if (${executionLogPredicate}) return true;
		return false;
	})();
	if (logOn) {
		const log = globalThis.__mxLog = globalThis.__mxLog || new Set();
		const executed = [...log];
		const preloaded = d.querySelectorAll('link[rel="modulepreload"]').length;
		const bytes = executed.length === 1 ? '1 module executed' : executed.length + ' modules executed';
		const summary = 'markless: resumed — ' + bytes + ', ' + preloaded + ' modules preloaded (' + executed.length + ' executed)';
		console.log(summary);
		d.documentElement?.setAttribute('data-markless-log-summary', summary);
	}`;

	return `(() => {
	const d = document;
	const s = d.currentScript;
	const r = s && s.closest('[data-async-container]');
	if (!r) return;
${executionLogSource}
	const p = r.querySelector('script[type="markless/view"]');
	if (!p) return;
	const v = JSON.parse(p.textContent || 'null');
	const w = d.createTreeWalker(r, 1);
	const n = [r];
	let x;
	while ((x = w.nextNode())) n.push(x);
	const h = new Map(v.locators.map((l) => [l.index, l.hostNodeId]));
	const m = new Map();
${sharedSyncPolicySource}
${localSyncPolicySource}
	for (const e of v.events) {
		if (e.eventName === 'visible') continue;
		const k = e.hostNodeId + '\\n' + e.eventName;
		m.set(k, e);
	}
	const rw = new Set([...(v.keyedRepeats ?? []).flatMap((k) => k.rowEvents.map((e) => e.eventName)), ...(v.branches ?? []).flatMap((k) => (k.armRecords ?? []).flatMap((a) => a.events.map((e) => e.eventName)))]);
	for (const t of new Set([...v.events.map((e) => e.eventName), ...rw].filter((e) => e !== 'visible'))) {
		r.addEventListener(t, async (e) => {
			if (r.__asyncResumeRuntimeStarted) return;
			for (let a = e.target; a; a = a.parentElement) {
				const id = h.get(n.indexOf(a));
				const record = id && m.get(id + '\\n' + e.type);
				if (record) {
${runSyncPolicy}
					const mod = await import(${JSON.stringify(resumeModuleUrl)});
					await mod.resumeContainerEvent({ root: r, event: e, element: a, eventRecord: record });
					return;
				}
				if (a === r) break;
			}
			if (rw.has(e.type)) {
				const mod = await import(${JSON.stringify(resumeModuleUrl)});
				await mod.resumeContainerEvent({ root: r, event: e, element: e.target, eventRecord: null });
			}
		}, true);
	}
})();`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}
