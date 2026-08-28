import {
	STORAGE_SLOT_SYMBOL_KEY,
	storageAttributeName,
	type ProtocolEventAction,
	type ProtocolSyncPolicy,
	type ProtocolSyncPolicyCondition,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type StorageSeedMetadata,
} from '@markless/serializer';
import { renderPayloadScripts } from '@markless/serializer';
import { protocolEventDispatchesMarkless } from '@markless/serializer/protocol';
import {
	classifyResumeRecordDelta,
	mergeResumeRecordDelta,
} from '@markless/serializer/resume-record-delta';
import { __marklessDebugBootstrapSource } from './debug-channel.ts';
import type { MarklessExecutionLogMode } from './dev-log.ts';
import {
	createInlineResumerDebugRegistrationSource,
	createInlineResumerOverlayPrimerSource,
	createPrerenderInlineResumerSource,
	createInlineResumerSelfWakeSource,
	createInlineResumerSource,
	renderPrerenderInlineResumerSource,
	type InlineResumerSourceVariants,
	type PrerenderBootArtifact,
} from './inline/resumer.ts';
import { prepareSsrResumeRecords } from './prerender/records.ts';
import {
	marklessSsrRosterCounted,
	marklessSsrRosterPositionContext,
} from './fns/roster-position.ts';
import { marklessRosterPositions } from './prerender/shared-seed-slot.ts';
import { derivePrerenderResumeRecords } from './prerender/evaluator.ts';

export { prepareSsrResumeRecords } from './prerender/records.ts';

type RosterResumeHost = {
	__marklessRosterResume?: () => Promise<typeof import('./fns/roster-resume.ts')>;
};

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

// The property the bundler stamps a non-root component export with. That export
// is a bare render part: it carries none of its module's page wiring.
export const MARKLESS_COMPONENT_PART_BRAND = 'marklessComponentPart';

export type SsrRenderArtifact = {
	// renderContext carries the per-request prerender/streaming mode the compiled
	// artifact reads; hosts that do not set a mode omit it.
	readonly renderSsr: (props?: unknown, renderContext?: unknown) => SsrRenderOutput;
	/** The export name, when this artifact is a bare part rather than a page surface. */
	readonly marklessComponentPart?: string;
	readonly headInjections?: ReadonlyArray<RenderHeadInjection>;
	readonly storageSeeds?: ReadonlyArray<StorageSeedMetadata>;
	readonly modulePreloads?: ReadonlyArray<ModulePreloadInput>;
	readonly resumeModuleUrl?: string;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly inlineResumerSources?: InlineResumerSourceVariants;
	readonly prerenderBoot?: PrerenderBootArtifact;
};

export type SsrRenderable = (() => SsrRenderOutput) | SsrRenderArtifact;

export type RenderToStringOptions = {
	readonly nonce?: string;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
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
	// Build-computed settled-arm templates plus their fill plan. Inert markup:
	// it sits after the rendered page so no page element or comment index moves.
	readonly armEmission?: string;
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
): Promise<string> {
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
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	const prerenderWakeModuleUrl =
		options.prerenderWakeModuleUrl ?? artifactPrerenderWakeModuleUrl(component);
	const wakeChannelEnabled =
		hasPayload && browserTriggers && prerenderWakeModuleUrl !== undefined;
	const baseline = wakeChannelEnabled
		? await derivePrerenderResumeRecords(component, options.props)
		: undefined;
	const requestRecords = { state, view };
	const classification = baseline
		? classifyResumeRecordDelta(baseline, requestRecords)
		: undefined;
	if (baseline && classification?.kind === 'divergent') {
		const merged = mergeResumeRecordDelta(baseline, classification.delta);
		if (classifyResumeRecordDelta(merged, requestRecords).kind !== 'empty') {
			throw new Error('MARKLESS_RESUME_RECORD_DELTA_PARITY_MISMATCH');
		}
	}
	const payloadRecords =
		classification?.kind === 'divergent' ? classification.delta : requestRecords;
	const payloadScripts =
		hasPayload && browserTriggers && classification?.kind !== 'empty'
			? renderPayloadScripts(payloadRecords)
			: undefined;
	const selectedResumeModuleUrl = wakeChannelEnabled ? prerenderWakeModuleUrl : resumeModuleUrl;
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
	const overlayPrimer = hasOverlayMark(output.html);
	const resumerScript =
		hasPayload && browserTriggers
			? renderInlineResumerScript(
					wakeChannelEnabled
						? createPrerenderInlineResumerSource(
								browserEventNames(view),
								selectedResumeModuleUrl,
								{
									...(typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' &&
									__MARKLESS_DEBUG_ENABLED__
										? {
												debug: {
													bootstrapSource:
														__marklessDebugBootstrapSource(),
												},
											}
										: {}),
									executionLog,
								},
							)
						: (options.resumerSource ?? defaultSource),
					options.nonce,
					selectedResumeModuleUrl,
					selfWake,
					undefined,
					true,
					overlayPrimer,
				)
			: '';
	const storageSeedScript = renderStorageSeedScript(
		artifactStorageSeeds(component),
		options.nonce,
	);

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
	const resumeModuleUrl =
		options.prerenderWakeModuleUrl ??
		options.resumeModuleUrl ??
		artifactPrerenderWakeModuleUrl(component) ??
		artifactResumeModuleUrl(component);
	const optionPreloads =
		typeof options.modulePreloads === 'function'
			? options.modulePreloads(output.html)
			: options.modulePreloads;
	const modulePreloads =
		optionPreloads ?? (browserTriggers ? artifactModulePreloads(component) : undefined);
	const eventNames = browserEventNames(view);
	const selfWake = hasUnsettledAsyncBoundaryRunner(view, state);
	const boot = artifactPrerenderBoot(component);
	// The settle path replaces the self-wake: it fills the arm from the plan and
	// never imports the resume module, so a page only takes it when the build
	// produced BOTH the plan this document ships and the settle module it needs.
	const settle = options.armEmission && selfWake ? boot?.settle : undefined;
	const resumerScript =
		browserTriggers && resumeModuleUrl
			? renderInlineResumerScript(
					settle
						? renderPrerenderInlineResumerSource(settle.boot, eventNames)
						: boot
							? renderPrerenderInlineResumerSource(
									selfWake ? boot.prerenderSelfWake : boot.prerender,
									eventNames,
								)
							: createPrerenderInlineResumerSource(eventNames, resumeModuleUrl),
					options.nonce,
					resumeModuleUrl,
					selfWake && !settle,
					settle?.moduleUrl,
					// The precompiled self-wake variant already carries the self-wake
					// body; only the authored fallback appends it separately.
					!boot,
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
		options.armEmission ?? '',
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
	assertPageRenderable(component);
	// The server has no emitted source module to write the roster loader, and a
	// count is answered through it on this side too.
	(globalThis as RosterResumeHost).__marklessRosterResume ??= () =>
		import('./fns/roster-resume.ts');
	// One position counter per render, minted here because this is the one place
	// a served page's render context is made.
	const context = marklessSsrRosterPositionContext(renderContext);
	if (typeof component === 'function') {
		return marklessSsrRosterCounted(
			context,
			await marklessSsrDeferredCounted(
				context,
				await (component as (props?: unknown, renderContext?: unknown) => SsrRenderOutput)(
					props,
					context,
				),
			),
		);
	}
	if (component && typeof component.renderSsr === 'function') {
		return marklessSsrRosterCounted(
			context,
			await marklessSsrDeferredCounted(
				context,
				await (
					component.renderSsr as (props?: unknown, renderContext?: unknown) => SsrRenderOutput
				)(props, context),
			),
		);
	}
	throw new TypeError('renderToString(App) requires a compiled TSRX artifact.');
}

/**
 * The count-spending expressions this render handed over unevaluated. They are
 * answered first: the placeholder resolver that runs after them only has plain
 * count reads left to replace.
 */
async function marklessSsrDeferredCounted<Surface extends SsrRenderOutput>(
	renderContext: unknown,
	surface: Surface,
): Promise<Surface> {
	const seeds = (renderContext as { readonly sharedSeeds?: ReadonlyMap<string, unknown> } | null)
		?.sharedSeeds;
	const deferred = marklessRosterPositions(seeds)?.deferred;
	if (!deferred || deferred.length === 0) return surface;
	const roster = await (globalThis as RosterResumeHost).__marklessRosterResume?.();
	if (!roster) throw new Error('MARKLESS_ROSTER_COUNT_UNRESOLVED');
	return roster.marklessResolveDeferredCounts(surface, deferred);
}

/**
 * Refuses a bare component part used AS A PAGE. `renderSsrOutput` is the one
 * place a surface becomes a served page - composition reaches a part through
 * `marklessSsrComponentPart` and never comes here - so the refusal costs
 * composition nothing while a part-as-page can no longer be served inert.
 */
export function assertPageRenderable(component: SsrRenderable): void {
	const partName = componentPartName(component);
	if (partName === undefined) return;
	throw new Error(
		`MARKLESS_COMPONENT_PART_AS_PAGE: "${partName}" is published as a bare render part, not a page. ` +
			`A non-root export carries none of its module's page wiring (no resume module, no preloads, no head injections), ` +
			`so a page rendered from it is served complete and inert: no client runtime is ever fetched and no gesture can dispatch. ` +
			`Render "${partName}" inside a page, or make it the module's root export - the root is published merged with the module surface.`,
	);
}

function componentPartName(component: SsrRenderable): string | undefined {
	if (typeof component !== 'object' || component === null) return undefined;
	const name = (component as Record<string, unknown>)[MARKLESS_COMPONENT_PART_BRAND];
	return typeof name === 'string' ? name : undefined;
}

export function artifactResumeModuleUrl(component: SsrRenderable): string | undefined {
	return typeof component === 'object' ? component.resumeModuleUrl : undefined;
}

function artifactPrerenderBoot(component: SsrRenderable): PrerenderBootArtifact | undefined {
	return typeof component === 'object'
		? (component as SsrRenderArtifact).prerenderBoot
		: undefined;
}

function artifactPrerenderWakeModuleUrl(component: SsrRenderable): string | undefined {
	return typeof component === 'object'
		? (component as SsrRenderArtifact & { readonly prerenderWakeModuleUrl?: string })
				.prerenderWakeModuleUrl
		: undefined;
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
		view.events.some(protocolEventDispatchesMarkless) ||
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
		(view.branches ?? []).some(
			(branch) =>
				(branch.armRecords ?? []).some((arm) =>
					arm.events.some(protocolEventDispatchesMarkless),
				) || branchServedArmEventNames(branch).length > 0,
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
				readonly events?: ReadonlyArray<{
					readonly eventName: string;
					readonly action?: ProtocolEventAction;
				}>;
				readonly keyedRepeats?: ProtocolViewPayload['keyedRepeats'];
			};
		}
	).armRecords;
	if (!armRecords || Array.isArray(armRecords)) return [];
	return [
		...(armRecords.events ?? [])
			.filter(protocolEventDispatchesMarkless)
			.map((event) => event.eventName),
		...(armRecords.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	];
}

// An escalating branch's served arm holds the events the page actually painted;
// they are the wake set for that arm just as a boundary's armized events are.
function branchServedArmEventNames(
	branch: NonNullable<ProtocolViewPayload['branches']>[number],
): ReadonlyArray<string> {
	const armRecords = branch.servedArmRecords;
	if (!armRecords) return [];
	return [
		...armRecords.events.filter(protocolEventDispatchesMarkless).map((event) => event.eventName),
		...(armRecords.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	];
}

function browserEventNames(view: ProtocolViewPayload): ReadonlyArray<string> {
	return [
		...new Set([
			...view.events.filter(protocolEventDispatchesMarkless).map((event) => event.eventName),
			...(view.keyedRepeats ?? []).flatMap((repeat) =>
				repeat.rowEvents.map((event) => event.eventName),
			),
			...(view.branches ?? []).flatMap((branch) => [
				...(branch.armRecords ?? []).flatMap((arm) =>
					arm.events.filter(protocolEventDispatchesMarkless).map((event) => event.eventName),
				),
				...branchServedArmEventNames(branch),
			]),
			...view.asyncBoundaries.flatMap(boundaryArmEventNames),
		]),
	].filter((eventName) => eventName !== 'visible');
}

function renderContainerAttributes(containerId: string | undefined): string {
	return containerId
		? ` data-async-container="${escapeAttribute(containerId)}"`
		: ' data-async-container';
}

/**
 * The DOM spelling the compiler lowers the `overlay` mark to, as it lands in the
 * served html.
 *
 * Read off the html rather than the payload because the payload has no overlay
 * record to read - the mark is a static attribute, so the served markup IS where
 * it is written. Owned here rather than imported from the compiler for the same
 * reason `packages/web/src/fns/overlay.ts` owns its own selector: this module is
 * the SSR path, and a compiler import would drag the compiler into it. A false
 * positive (the text appearing in page content) over-ships the primer to one
 * page; a false negative is impossible, which is the direction that matters.
 */
const OVERLAY_MARK_IN_HTML = ' overlay=""';

function hasOverlayMark(html: string): boolean {
	return html.includes(OVERLAY_MARK_IN_HTML);
}

function renderInlineResumerScript(
	source: string,
	nonce: string | undefined,
	resumeModuleUrl: string | undefined,
	selfWake: boolean,
	settleModuleUrl?: string,
	appendSelfWakeSource = true,
	overlayPrimer = false,
): string {
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	const resumeModuleAttribute = resumeModuleUrl
		? ` data-markless-resume-module="${escapeAttribute(resumeModuleUrl)}"`
		: '';
	const settleModuleAttribute = settleModuleUrl
		? ` data-markless-settle-module="${escapeAttribute(settleModuleUrl)}"`
		: '';
	const selfWakeAttribute = selfWake ? ' data-markless-self-wake' : '';
	const selfWakeSource =
		selfWake && appendSelfWakeSource ? createInlineResumerSelfWakeSource(resumeModuleUrl) : '';
	const overlayPrimerSource = overlayPrimer
		? createInlineResumerOverlayPrimerSource(resumeModuleUrl)
		: '';
	return `<script data-async-resumer${nonceAttribute}${resumeModuleAttribute}${settleModuleAttribute}${selfWakeAttribute}>${escapeInlineScript(source + selfWakeSource + overlayPrimerSource)}</script>`;
}

/**
 * Every sync policy the page ships, wherever it was recorded.
 *
 * A repeat row's handler carries its policy on the row record rather than on
 * `events`, so scanning only `events` picks the policy-free resumer for a page
 * whose policies all sit on rows - the policy data is served and nothing on the
 * page can apply it.
 */
function viewSyncPolicies(view: ProtocolViewPayload): ReadonlyArray<ProtocolSyncPolicy> {
	return [
		...view.events,
		...(view.keyedRepeats ?? []).flatMap((repeat) => repeat.rowEvents),
	].flatMap((event) => (event.syncPolicy ? [event.syncPolicy] : []));
}

function hasSyncPolicies(view: ProtocolViewPayload): boolean {
	return viewSyncPolicies(view).length > 0;
}

function hasGraphSyncPolicies(view: ProtocolViewPayload): boolean {
	return viewSyncPolicies(view).some((policy) =>
		syncPolicyBranches(policy).some((branch) => syncPolicyConditionReadsGraph(branch.when)),
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
