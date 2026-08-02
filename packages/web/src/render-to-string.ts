import {
	STORAGE_SLOT_SYMBOL_KEY,
	storageAttributeName,
	type ProtocolSyncPolicy,
	type ProtocolSyncPolicyCondition,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type StorageSeedMetadata,
} from '@markless/serializer';
import { renderPayloadScripts } from '@markless/serializer';
import { __marklessDebugBootstrapSource } from './debug-channel.ts';
import type { MarklessExecutionLogMode } from './dev-log.ts';
import {
	createInlineResumerDebugRegistrationSource,
	createPrerenderInlineResumerSource,
	createInlineResumerSelfWakeSource,
	createInlineResumerSource,
	type InlineResumerSourceVariants,
} from './inline/resumer.ts';
import { prepareSsrResumeRecords } from './prerender/records.ts';

export { prepareSsrResumeRecords } from './prerender/records.ts';

export type SsrRenderOutput = {
	readonly html: string;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly structure?: {
		readonly anchors: ReadonlyArray<{
			readonly kind: 'branch' | 'async';
			readonly id: string;
			readonly html: string;
		}>;
	};
};

export type SsrRenderArtifact = {
	readonly renderSsr: (props?: unknown) => SsrRenderOutput;
	readonly headInjections?: ReadonlyArray<RenderHeadInjection>;
	readonly storageSeeds?: ReadonlyArray<StorageSeedMetadata>;
	readonly modulePreloads?: ReadonlyArray<ModulePreloadInput>;
	readonly resumeModuleUrl?: string;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly inlineResumerSources?: InlineResumerSourceVariants;
};

export type SsrRenderable = (() => SsrRenderOutput) | SsrRenderArtifact;

export type RenderToStringOptions = {
	readonly nonce?: string;
	readonly resumeModuleUrl?: string;
	readonly resumerSource?: string;
	readonly containerId?: string;
	// Static preloads, or a callback resolved against the rendered page html
	// (streaming hosts compute Link-target preloads from the shell output).
	readonly modulePreloads?:
		| ReadonlyArray<ModulePreloadInput>
		| ((html: string) => ReadonlyArray<ModulePreloadInput> | undefined);
	readonly inlineRuntimeRegistry?: Set<string>;
	readonly executionLog?: MarklessExecutionLogMode;
	// Page props forwarded to the compiled renderSsr (router hosts).
	readonly props?: unknown;
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
	const output = await renderSsrOutput(component, options.props, undefined);
	return assembleSsrContainer(component, output, options);
}

// Shared container assembly for the blocking (renderToString) and streaming
// (renderToStream) paths: payload scripts, preload links, head injections,
// and the inline resumer around the rendered page html.
export async function assembleSsrContainer(
	component: SsrRenderable,
	output: SsrRenderOutput,
	options: RenderToStringOptions,
): Promise<string> {
	const hasPayload = !!output.state || !!output.view;
	const { state, view } = await prepareSsrResumeRecords(output);
	const browserTriggers = hasBrowserTriggers(view, state);
	const selfWake = hasUnsettledAsyncBoundaryRunner(view, state);
	const payloadScripts =
		hasPayload && browserTriggers ? renderPayloadScripts({ state, view }) : undefined;
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	const artifactSources = artifactInlineResumerSources(component);
	const executionLog =
		options.executionLog ??
		artifactExecutionLog(component) ??
		artifactSources?.executionLog ??
		'auto';
	const optionPreloads =
		typeof options.modulePreloads === 'function'
			? options.modulePreloads(output.html)
			: options.modulePreloads;
	const modulePreloads =
		optionPreloads ?? (browserTriggers ? artifactModulePreloads(component) : undefined);
	const sourceMatchesRenderMode = artifactSources?.executionLog === executionLog;
	const syncPolicy = hasSyncPolicies(view);
	const graphSyncPolicy = hasGraphSyncPolicies(view);
	const sharedGraphPolicy =
		graphSyncPolicy && shouldEmitInlineRuntime(options.inlineRuntimeRegistry, 'sync-policy');
	const defaultSource =
		sourceMatchesRenderMode && artifactSources
			? graphSyncPolicy
				? sharedGraphPolicy
					? artifactSources.graphSyncPolicyOwner
					: artifactSources.graphSyncPolicyConsumer
				: syncPolicy
					? artifactSources.syncPolicy
					: artifactSources.event
			: defaultInlineResumerSource({
					executionLog,
					graphSyncPolicy,
					resumeModuleUrl,
					sharedGraphPolicy,
					syncPolicy,
				});
	const resumerScript =
		hasPayload && browserTriggers
			? renderInlineResumerScript(
					options.resumerSource ?? defaultSource,
					options.nonce,
					resumeModuleUrl,
					selfWake,
				)
			: '';
	const storageSeedScript = renderStorageSeedScript(artifactStorageSeeds(component), options.nonce);

	return [
		storageSeedScript,
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

// Internal prerender assembly deliberately omits state/view scripts. The
// demanded resume module recreates these records from the linked render closure.
export async function assemblePrerenderContainer(
	component: SsrRenderable,
	output: SsrRenderOutput,
	options: RenderToStringOptions,
): Promise<string> {
	const parts = await assemblePrerenderPageParts(component, output, options);
	return `${parts.head}${parts.container}`;
}

export async function assemblePrerenderPageParts(
	component: SsrRenderable,
	output: SsrRenderOutput,
	options: RenderToStringOptions,
): Promise<{ readonly head: string; readonly container: string }> {
	const { state, view } = await prepareSsrResumeRecords(output);
	const browserTriggers = hasBrowserTriggers(view, state);
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	const optionPreloads =
		typeof options.modulePreloads === 'function'
			? options.modulePreloads(output.html)
			: options.modulePreloads;
	const modulePreloads =
		optionPreloads ?? (browserTriggers ? artifactModulePreloads(component) : undefined);
	const eventNames = browserEventNames(view);
	const resumerScript =
		browserTriggers && resumeModuleUrl
			? renderInlineResumerScript(
					createPrerenderInlineResumerSource(eventNames, resumeModuleUrl),
					options.nonce,
					resumeModuleUrl,
					false,
				)
			: '';

	const head = [
		renderStorageSeedScript(artifactStorageSeeds(component), options.nonce),
		renderHeadInjections(artifactHeadInjections(component), options.nonce),
		renderModulePreloadLinks(modulePreloads, options.nonce),
	]
		.filter(Boolean)
		.join('');
	const container = [
		`<div${renderContainerAttributes(options.containerId)}>`,
		output.html,
		resumerScript,
		'</div>',
	]
		.filter(Boolean)
		.join('');
	return { head, container };
}

// The optional render context is the per-request streaming channel: compiled
// renderSsr threads it into child renders and async runners (T107).
export async function renderSsrOutput(
	component: SsrRenderable,
	props: unknown,
	renderContext: unknown,
): Promise<SsrRenderOutput> {
	if (typeof component === 'function') {
		return (component as (props?: unknown, renderContext?: unknown) => SsrRenderOutput)(
			props,
			renderContext,
		);
	}
	if (component && typeof component.renderSsr === 'function') {
		return (
			component.renderSsr as (props?: unknown, renderContext?: unknown) => SsrRenderOutput
		)(props, renderContext);
	}
	throw new TypeError('renderToString(App) requires a compiled TSRX artifact.');
}

export function artifactResumeModuleUrl(component: SsrRenderable): string | undefined {
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

function artifactStorageSeeds(
	component: SsrRenderable,
): ReadonlyArray<StorageSeedMetadata> | undefined {
	return typeof component === 'object' ? component.storageSeeds : undefined;
}

function artifactExecutionLog(component: SsrRenderable): MarklessExecutionLogMode | undefined {
	return typeof component === 'object' ? component.executionLog : undefined;
}

function artifactInlineResumerSources(
	component: SsrRenderable,
): InlineResumerSourceVariants | undefined {
	return typeof component === 'object' ? component.inlineResumerSources : undefined;
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

function renderStorageSeedScript(
	seeds: ReadonlyArray<StorageSeedMetadata> | undefined,
	nonce: string | undefined,
): string {
	if (!seeds?.length) return '';
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	// Leading-fragment seed: before the framework wakes, read each driver key
	// (fallback on miss/throw), publish it into the landing slot the runtime
	// consumes, and set the no-flash data attribute on <html>. The attribute name
	// is precomputed (sanitized) so a derived markless:<key> becomes data-markless-<key>.
	const source = `(()=>{const s=globalThis[Symbol.for(${JSON.stringify(STORAGE_SLOT_SYMBOL_KEY)})]||={};for(const[k,d,a,f]of ${JSON.stringify(seeds.map((seed) => [seed.slotKey, seed.driverKey, storageAttributeName(seed.driverKey), seed.fallback]))}){let v=f;try{v=localStorage.getItem(d)??f}catch{}s[k]=v;document.documentElement.setAttribute(a,v)}})()`;
	return `<script${nonceAttribute}>${escapeInlineScript(source)}</script>`;
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
		(state.storage?.length ?? 0) > 0 ||
		view.events.length > 0 ||
		state.computed.some(
			(computed) =>
				computed.async === false &&
				typeof (computed as { readonly deriveSymbolId?: unknown }).deriveSymbolId ===
					'string',
		) ||
		view.behaviors.some((behavior) => !!behavior.symbolId) ||
		Object.keys(view.asyncRunners ?? {}).length > 0 ||
		view.asyncBoundaries.some((boundary) =>
			boundary.asyncReads.some((read) => !!read.runnerSymbolId),
		) ||
		// Keyed repeat row events live on rowEvents, not view.events.
		(view.keyedRepeats ?? []).some((repeat) => repeat.rowEvents.length > 0) ||
		// Branch arm events live on armRecords, not view.events.
		(view.branches ?? []).some((branch) =>
			(branch.armRecords ?? []).some((arm) => arm.events.length > 0),
		) ||
		// Async boundary arm events also nest under armRecords (D3).
		view.asyncBoundaries.some((boundary) => boundaryArmEventNames(boundary).length > 0)
	);
}

function hasUnsettledAsyncBoundaryRunner(
	view: ProtocolViewPayload,
	state: ProtocolStatePayload,
): boolean {
	const runners = { ...view.asyncRunners };
	const reachable = new Set<string>();
	for (const boundary of view.asyncBoundaries) {
		for (const read of boundary.asyncReads) {
			reachable.add(read.graphNodeId);
			if (read.runnerSymbolId) runners[read.graphNodeId] ??= read.runnerSymbolId;
		}
	}
	const computedByGraphNode = new Map(
		state.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	for (const graphNodeId of reachable) {
		const computed = computedByGraphNode.get(graphNodeId);
		if (!computed) continue;
		if (runners[graphNodeId]) {
			const status = computed.snapshot?.status;
			if (status !== 'fulfilled' && status !== 'rejected') return true;
		}
		for (const dependency of computed.dependencies ?? []) reachable.add(dependency.graphNodeId);
	}
	return false;
}

// In-arm event names from a boundary's armized record set. CSR-composed pages
// may still carry the compile-time per-arm array, which is not wake-relevant.
function boundaryArmEventNames(
	boundary: ProtocolViewPayload['asyncBoundaries'][number],
): ReadonlyArray<string> {
	const armRecords = (
		boundary as {
			readonly armRecords?: {
				readonly events?: ReadonlyArray<{ readonly eventName: string }>;
				readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
			};
		}
	).armRecords;
	if (!armRecords || Array.isArray(armRecords)) return [];
	return [
		...(armRecords.events ?? []).map((event) => event.eventName),
		...(armRecords.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	];
}

function browserEventNames(view: ProtocolViewPayload): ReadonlyArray<string> {
	return [
		...new Set([
			...view.events.map((event) => event.eventName),
			...(view.keyedRepeats ?? []).flatMap((repeat) =>
				repeat.rowEvents.map((event) => event.eventName),
			),
			...(view.branches ?? []).flatMap((branch) =>
				(branch.armRecords ?? []).flatMap((arm) =>
					arm.events.map((event) => event.eventName),
				),
			),
			...view.asyncBoundaries.flatMap(boundaryArmEventNames),
		]),
	].filter((eventName) => eventName !== 'visible');
}

function renderContainerAttributes(containerId: string | undefined): string {
	return containerId
		? ` data-async-container="${escapeAttribute(containerId)}"`
		: ' data-async-container';
}

function renderInlineResumerScript(
	source: string,
	nonce: string | undefined,
	resumeModuleUrl: string | undefined,
	selfWake: boolean,
): string {
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	const resumeModuleAttribute = resumeModuleUrl
		? ` data-markless-resume-module="${escapeAttribute(resumeModuleUrl)}"`
		: '';
	const selfWakeAttribute = selfWake ? ' data-markless-self-wake' : '';
	const selfWakeSource = selfWake ? createInlineResumerSelfWakeSource(resumeModuleUrl) : '';
	return `<script data-async-resumer${nonceAttribute}${resumeModuleAttribute}${selfWakeAttribute}>${escapeInlineScript(source + selfWakeSource)}</script>`;
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

function defaultInlineResumerSource(options: {
	readonly executionLog: MarklessExecutionLogMode;
	readonly graphSyncPolicy: boolean;
	readonly resumeModuleUrl: string | undefined;
	readonly sharedGraphPolicy: boolean;
	readonly syncPolicy: boolean;
}): string {
	const debug = typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__;
	return createInlineResumerSource({
		debug,
		...(debug
			? {
					debugBootstrapSource: __marklessDebugBootstrapSource(),
					debugRegistrationSource: createInlineResumerDebugRegistrationSource(),
				}
			: {}),
		...options,
	});
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}
