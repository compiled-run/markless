import {
	createStorageCookieReader,
	escapeScriptJson,
	STORAGE_RENDER_CONTEXT_READER,
	STORAGE_SLOT_SYMBOL_KEY,
	storageAttributeName,
	storageCookieName,
	storageSlotEntryKeyFromGraphNodeId,
	type ProtocolEventAction,
	type ProtocolSyncPolicy,
	type ProtocolSyncPolicyCondition,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type StorageSeedMetadata,
} from '@markless/serializer';
import { encodeProtocolPayloadLists, renderPayloadScripts } from '@markless/serializer';
import {
	type ProtocolArmRecordSet,
	protocolEventDispatchesMarkless,
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_EVENT_HOST_DELEGATED_REF,
	PROTOCOL_SYNC_POLICY_TABLE_TYPE,
	PROTOCOL_VISIBLE_EVENT_NAME,
	constantSyncPolicyCode,
	formatEventHostEntries,
	syncPolicyNeverActs,
	type ProtocolEventHostEntry,
} from '@markless/serializer/protocol';
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
	createInlineResumerStorageWakeSource,
	renderPrerenderInlineResumerSource,
	renderInlineResumerPageSource,
	INLINE_PAGE_FORWARDS_UNKNOWN,
	INLINE_PAGE_SCOPED,
	type InlineResumerPage,
	type InlineResumerSourceVariants,
	type PrerenderBootArtifact,
} from './inline/resumer.ts';
import { createInlineDeferTriggerSource, inlineDeferSource } from './inline/defer.ts';
import { prepareSsrResumeRecords } from './prerender/records.ts';
import { CONTAINER_ATTRIBUTE } from './fns/container-region.ts';
import {
	marklessSsrRosterCounted,
	marklessSsrRosterPositionContext,
} from './fns/roster-position.ts';
import { marklessRosterPositions } from './prerender/shared-seed-slot.ts';
import { derivePrerenderResumeRecords } from './prerender/evaluator.ts';
import { createEarlyEventCaptureSource } from './inline/early-events.ts';
import { servedElementTree, servedLocatorPaths, withElementAttributes } from './locator-paths.ts';

export { prepareSsrResumeRecords } from './prerender/records.ts';
export { CONTAINER_RETIRE_PROPERTY } from './payload-resume-registry.ts';

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
		| ((html: string, resumes: boolean) => ReadonlyArray<ModulePreloadInput> | undefined);
	readonly inlineRuntimeRegistry?: Set<string>;
	readonly executionLog?: MarklessExecutionLogMode;
	// Page props forwarded to the compiled renderSsr (router hosts).
	readonly props?: unknown;
	/** The request's Cookie header. storage() cells render from the values saved in it. */
	readonly cookie?: string | null;
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
	const output = await renderSsrOutput(
		component,
		options.props,
		storageRenderContext(options.cookie),
	);
	return assembleSsrContainer(component, output, options);
}

/** The render-context half of `cookie`: compiled storage() cells read their value through it. */
export function storageRenderContext(cookie: string | null | undefined): {
	readonly [STORAGE_RENDER_CONTEXT_READER]?: (key: string) => string | undefined;
} {
	return cookie ? { [STORAGE_RENDER_CONTEXT_READER]: createStorageCookieReader(cookie) } : {};
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
	const executionLog =
		options.executionLog ??
		artifactExecutionLog(component) ??
		artifactInlineResumerSources(component)?.executionLog ??
		'auto';
	const servedView =
		payloadRecords === requestRecords
			? withNamedHostLocators(executionLog === 'never' ? withoutReadSources(view) : view)
			: view;
	const payloadScripts =
		hasPayload && browserTriggers && classification?.kind !== 'empty'
			? renderPayloadScripts(
					payloadRecords === requestRecords
						? { state, view: servedView }
						: payloadRecords,
					encodeProtocolPayloadLists,
				)
			: undefined;
	const selectedResumeModuleUrl = wakeChannelEnabled ? prerenderWakeModuleUrl : resumeModuleUrl;
	const artifactSources = artifactInlineResumerSources(component);
	const optionPreloads =
		typeof options.modulePreloads === 'function'
			? options.modulePreloads(output.html, hasPayload && browserTriggers)
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
						: (options.resumerSource ??
								renderInlineResumerPageSource(
									defaultSource,
									inlineResumerPage(view),
								)),
					options.nonce,
					selectedResumeModuleUrl,
					selfWake,
					undefined,
					true,
					overlayPrimer,
					deferredTriggerSource(view) +
						(selfWake ? '' : storageWakeSource(state, selectedResumeModuleUrl)),
					artifactSources?.defer,
				)
			: '';
	const policyTable = createSyncPolicyTable();
	const pageHtml = resumerScript
		? withEventHostMarks(view, output.html, policyTable)
		: output.html;
	const storageSeedScript = renderStorageSeedScript(
		artifactStorageSeeds(component),
		options.nonce,
	);

	return [
		storageSeedScript,
		renderHeadInjections(artifactHeadInjections(component), options.nonce),
		renderModulePreloadLinks(modulePreloads, options.nonce),
		resumerScript && selectedResumeModuleUrl && !wakeChannelEnabled && !options.resumerSource
			? `<script${options.nonce ? ` nonce="${escapeAttribute(options.nonce)}"` : ''}>${escapeInlineScript(createEarlyEventCaptureSource(browserEventNames(view)))}</script>`
			: '',
		renderContainer(
			options.containerId,
			[
				pageHtml,
				payloadScripts?.stateScript,
				payloadScripts?.viewScript,
				renderSyncPolicyTableScript(policyTable.policies),
				resumerScript,
			],
			resumerScript ? servedView.locators : [],
		),
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
			? options.modulePreloads(output.html, browserTriggers && resumeModuleUrl !== undefined)
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
					false,
					deferredTriggerSource(view) +
						(selfWake ? '' : storageWakeSource(state, resumeModuleUrl)),
					artifactInlineResumerSources(component)?.defer,
				)
			: '';

	const head = [
		renderStorageSeedScript(artifactStorageSeeds(component), options.nonce),
		renderHeadInjections(artifactHeadInjections(component), options.nonce),
		renderModulePreloadLinks(modulePreloads, options.nonce),
	]
		.filter(Boolean)
		.join('');
	const policyTable = createSyncPolicyTable();
	const container = renderContainer(
		options.containerId,
		[
			resumerScript ? withEventHostMarks(view, output.html, policyTable) : output.html,
			options.armEmission,
			renderSyncPolicyTableScript(policyTable.policies),
			resumerScript,
		],
		resumerScript ? view.locators : [],
	);
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
					component.renderSsr as (
						props?: unknown,
						renderContext?: unknown,
					) => SsrRenderOutput
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
	// The cookie is read first: it is the value a server render with this request saw.
	const source = `(()=>{const s=globalThis[Symbol.for(${JSON.stringify(STORAGE_SLOT_SYMBOL_KEY)})]||={},c=document.cookie.split('; ');for(const[k,d,a,f,n]of ${escapeScriptJson(JSON.stringify(seeds.map((seed) => [seed.slotKey, seed.driverKey, storageAttributeName(seed.driverKey), seed.fallback, storageCookieName(seed.driverKey)])))}){let v=f;try{const e=c.find(e=>e.startsWith(n+'='));v=e?decodeURIComponent(e.slice(n.length+1)):localStorage.getItem(d)??f}catch{}s[k]=v;document.documentElement.setAttribute(a,v)}})()`;
	return `<script${nonceAttribute}>${escapeInlineScript(source)}</script>`;
}

// Each storage cell's slot key and the value this render gave it.
function storageWakeSource(
	state: ProtocolStatePayload,
	resumeModuleUrl: string | undefined,
): string {
	const rendered = (state.storage ?? []).flatMap((record) => {
		const value = renderedCellValue(
			state.cells.find((cell) => cell.graphNodeId === record.graphNodeId),
		);
		return value === undefined
			? []
			: [[storageSlotEntryKeyFromGraphNodeId(record.graphNodeId), value] as const];
	});
	if (rendered.length === 0) return '';
	return createInlineResumerStorageWakeSource(
		resumeModuleUrl,
		STORAGE_SLOT_SYMBOL_KEY,
		escapeScriptJson(JSON.stringify(rendered)),
	);
}

function renderedCellValue(
	cell: ProtocolStatePayload['cells'][number] | undefined,
): string | undefined {
	if (typeof cell?.directValue === 'string') return cell.directValue;
	const value = cell?.value;
	if (typeof value === 'string') return value;
	const root = (value as { readonly root?: unknown } | undefined)?.root;
	return typeof root === 'string' ? root : undefined;
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
		...armRecords.events
			.filter(protocolEventDispatchesMarkless)
			.map((event) => event.eventName),
		...(armRecords.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	];
}

// A read's authored `source` text only feeds dev tooling and the execution log; a `never` page serves none.
export function withoutReadSources<Value>(value: Value): Value {
	if (Array.isArray(value)) return value.map(withoutReadSources) as Value;
	if (!value || typeof value !== 'object') return value;
	const record = value as Record<string, unknown>;
	const read = typeof record.source === 'string' && 'graphNodeId' in record && 'path' in record;
	const copy: Record<string, unknown> = {};
	for (const key in record)
		if (!(read && key === 'source')) copy[key] = withoutReadSources(record[key]);
	return copy as Value;
}

// The browser only ever locates a host a top-level record names; arm record sets carry their own locators.
export function withNamedHostLocators(view: ProtocolViewPayload): ProtocolViewPayload {
	const named = new Set<string>();
	for (const record of [
		...view.events,
		...view.domUpdates,
		...view.behaviors,
		...view.elementHandles,
	])
		named.add(record.hostNodeId);
	for (const repeat of view.keyedRepeats ?? []) {
		named.add(repeat.parentHostNodeId);
		if (repeat.ownerHostNodeId) named.add(repeat.ownerHostNodeId);
	}
	for (const branch of view.branches ?? [])
		for (const site of branch.idrefSites ?? []) named.add(site.hostNodeId);
	const locators = view.locators.filter((locator) => named.has(locator.hostNodeId));
	return locators.length === view.locators.length ? view : { ...view, locators };
}

type EventHostMarks = Map<number, ProtocolEventHostEntry[]>;
const DEFERRED_EVENT_NAMES: ReadonlyArray<string> = [
	PROTOCOL_VISIBLE_EVENT_NAME,
	PROTOCOL_IDLE_EVENT_NAME,
];

/** Collects a container's conditional sync policies into its table, one row per distinct policy. */
export function createSyncPolicyTable(): {
	readonly policies: ProtocolSyncPolicy[];
	readonly entry: (policy: ProtocolSyncPolicy | undefined) => ProtocolEventHostEntry['policy'];
} {
	const policies: ProtocolSyncPolicy[] = [];
	const rows = new Map<string, number>();
	return {
		policies,
		entry(policy) {
			if (!policy || syncPolicyNeverActs(policy)) return undefined;
			const constant = constantSyncPolicyCode(policy);
			if (constant) return constant;
			const key = JSON.stringify(policy);
			let row = rows.get(key);
			if (row === undefined) rows.set(key, (row = policies.push(policy) - 1));
			return row;
		},
	};
}

function addEventHostEntry(marks: EventHostMarks, index: number, entry: ProtocolEventHostEntry) {
	const entries = marks.get(index);
	if (!entries) return void marks.set(index, [entry]);
	const same = entries.findIndex((candidate) => candidate.name === entry.name);
	// One entry per event name: the element's own record outranks a scope it also is.
	if (same < 0) entries.push(entry);
	else if (entries[same]!.ref === undefined && entry.ref !== undefined) entries[same] = entry;
}

function writeEventHostMarks(html: string, nameEnds: ReadonlyArray<number>, marks: EventHostMarks) {
	return marks.size
		? withElementAttributes(
				html,
				nameEnds,
				PROTOCOL_EVENT_HOST_ATTRIBUTE,
				new Map(
					[...marks].map(([index, entries]) => [index, formatEventHostEntries(entries)]),
				),
			)
		: html;
}

/**
 * Writes the `m:on` attribute on every served event host: a top-level record by
 * its index in `events`, a keyed repeat parent as the scope of its rows' events,
 * and a host in a served arm by the policy its record carries.
 */
export function withEventHostMarks(
	view: Pick<
		ProtocolViewPayload,
		'locators' | 'events' | 'asyncBoundaries' | 'branches' | 'keyedRepeats'
	>,
	html: string,
	policyTable: ReturnType<typeof createSyncPolicyTable>,
): string {
	const tree = servedElementTree(html);
	const marks: EventHostMarks = new Map();
	const indexes = (locators: ReadonlyArray<{ hostNodeId: string; index: number }>) =>
		new Map(locators.map((locator) => [locator.hostNodeId, locator.index]));
	const shell = indexes(view.locators);
	view.events.forEach((event, ref) => {
		const index = shell.get(event.hostNodeId);
		if (index === undefined) return;
		const dispatches = protocolEventDispatchesMarkless(event);
		// A deferred trigger no listener raises is claimed by its ref alone, so a delegated one is not written.
		if (!dispatches && DEFERRED_EVENT_NAMES.includes(event.eventName)) return;
		const policy = policyTable.entry(event.syncPolicy);
		addEventHostEntry(marks, index, {
			name: event.eventName,
			ref: dispatches ? ref : PROTOCOL_EVENT_HOST_DELEGATED_REF,
			...(policy === undefined ? {} : { policy }),
		});
	});
	for (const repeat of view.keyedRepeats ?? []) {
		const index = shell.get(repeat.parentHostNodeId);
		if (index === undefined) continue;
		for (const event of repeat.rowEvents)
			addEventHostEntry(marks, index, { name: event.eventName });
	}
	for (const [anchor, records] of [
		...view.asyncBoundaries.map(
			(boundary) => [boundary.startAnchor, boundary.armRecords] as const,
		),
		...(view.branches ?? []).map(
			(branch) => [branch.startAnchor, branch.servedArmRecords] as const,
		),
	]) {
		if (!records || Array.isArray(records)) continue;
		const set = records as ProtocolArmRecordSet;
		const offset = tree.commentElementIndexes[anchor.index];
		if (offset === undefined) continue;
		const arm = indexes(set.locators);
		for (const event of set.events ?? []) {
			const policy = policyTable.entry(event.syncPolicy);
			const index = arm.get(event.hostNodeId);
			if (policy === undefined || index === undefined) continue;
			addEventHostEntry(marks, offset + index, { name: event.eventName, policy });
		}
	}
	return writeEventHostMarks(html, tree.nameEnds, marks);
}

/**
 * The same marks for one arm's html streamed on its own: its locators count from
 * the arm's first element and each ref indexes the arm's own events, whose
 * records its executor reads policies from.
 */
export function withArmEventHostMarks(armRecords: ProtocolArmRecordSet, html: string): string {
	const marks: EventHostMarks = new Map();
	const indexes = new Map(
		armRecords.locators.map((locator) => [locator.hostNodeId, locator.index]),
	);
	(armRecords.events ?? []).forEach((event, ref) => {
		const index = indexes.get(event.hostNodeId);
		if (index === undefined) return;
		addEventHostEntry(marks, index + 1, {
			name: event.eventName,
			ref: protocolEventDispatchesMarkless(event) ? ref : PROTOCOL_EVENT_HOST_DELEGATED_REF,
		});
	});
	return writeEventHostMarks(html, servedElementTree(html).nameEnds, marks);
}

function renderSyncPolicyTableScript(policies: ReadonlyArray<ProtocolSyncPolicy>): string {
	return policies.length
		? `<script type="${PROTOCOL_SYNC_POLICY_TABLE_TYPE}">${escapeScriptJson(JSON.stringify(policies))}</script>`
		: '';
}

function hasEvent(view: ProtocolViewPayload, eventName: string): boolean {
	return view.events.some((event) => event.eventName === eventName);
}

// Each deferred lane ships only when the page's records name its event; a visible or idle record in an arm or row hands the container to the runtime.
function deferredTriggerSource(view: ProtocolViewPayload): string {
	const nested = deferredEventNames({ ...view, events: [] });
	const lane = (name: 'visible' | 'idle', eventName: string) => {
		const ownsRoot = nested.includes(eventName);
		return hasEvent(view, eventName) || ownsRoot
			? createInlineDeferTriggerSource(name, ownsRoot)
			: '';
	};
	return lane('visible', PROTOCOL_VISIBLE_EVENT_NAME) + lane('idle', PROTOCOL_IDLE_EVENT_NAME);
}

/**
 * What the classic boot needs to know about this page before any event: the event
 * names it listens for, the ones nested records (rows, arms) use, and whether a
 * press no host claims may still need the runtime.
 */
export function inlineResumerPage(view: ProtocolViewPayload): InlineResumerPage {
	const nested = deferredEventNames({ ...view, events: [] });
	const forwardsUnknownElements =
		(view.keyedRepeats ?? []).some((repeat) => repeat.rowComponent !== undefined) ||
		(view.branches ?? []).some((branch) => branch.escalates);
	const scoped = (view.branches ?? []).length > 0 || view.asyncBoundaries.length > 0;
	return [
		browserEventNames(view),
		nested.filter((eventName) => eventName !== PROTOCOL_VISIBLE_EVENT_NAME),
		(forwardsUnknownElements ? INLINE_PAGE_FORWARDS_UNKNOWN : 0) |
			(scoped ? INLINE_PAGE_SCOPED : 0),
	];
}

function browserEventNames(view: ProtocolViewPayload): ReadonlyArray<string> {
	return deferredEventNames(view).filter(
		(eventName) => eventName !== PROTOCOL_VISIBLE_EVENT_NAME,
	);
}

function deferredEventNames(view: ProtocolViewPayload): ReadonlyArray<string> {
	return [
		...new Set([
			...view.events.filter(protocolEventDispatchesMarkless).map((event) => event.eventName),
			...(view.keyedRepeats ?? []).flatMap((repeat) =>
				repeat.rowEvents.map((event) => event.eventName),
			),
			...(view.branches ?? []).flatMap((branch) => [
				...(branch.armRecords ?? []).flatMap((arm) =>
					arm.events
						.filter(protocolEventDispatchesMarkless)
						.map((event) => event.eventName),
				),
				...branchServedArmEventNames(branch),
			]),
			...view.asyncBoundaries.flatMap(boundaryArmEventNames),
		]),
	];
}

function renderContainer(
	containerId: string | undefined,
	parts: ReadonlyArray<string | undefined>,
	locators: ProtocolViewPayload['locators'],
): string {
	const inner = parts.filter(Boolean).join('');
	const paths = servedLocatorPaths(inner, locators);
	const id = containerId ? `="${escapeAttribute(containerId)}"` : '';
	const located = paths ? ` ${PROTOCOL_LOCATOR_PATHS_ATTRIBUTE}="${paths}"` : '';
	return `${CONTAINER_OPEN}${id}${located}>${inner}${CONTAINER_CLOSE}`;
}

const CONTAINER_OPEN = `<div ${CONTAINER_ATTRIBUTE}`;
const CONTAINER_CLOSE = '</div>';

/**
 * Splits assembled SSR html into what precedes the container, the container's own
 * attributes (` data-async-container ...`, ready to write on another element), and its
 * children, for a host that makes an element of its own the container.
 */
export function splitSsrContainer(
	html: string,
): { readonly before: string; readonly attributes: string; readonly inner: string } | undefined {
	const start = html.indexOf(CONTAINER_OPEN);
	let openEnd = -1;
	for (
		let at = start + CONTAINER_OPEN.length, quoted = false;
		start >= 0 && at < html.length;
		at++
	) {
		if (html[at] === '"') quoted = !quoted;
		else if (html[at] === '>' && !quoted) {
			openEnd = at;
			break;
		}
	}
	if (openEnd < 0 || !html.endsWith(CONTAINER_CLOSE)) return undefined;
	return {
		before: html.slice(0, start),
		attributes: html.slice(start + '<div'.length, openEnd),
		inner: html.slice(openEnd + 1, -CONTAINER_CLOSE.length),
	};
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
	appendedSource = '',
	deferFactory?: string,
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
	// Every deferred lane names the helper; the first one installs it (minified when the build supplied it), the rest reference it.
	const [first, ...rest] = (source + selfWakeSource + overlayPrimerSource + appendedSource).split(
		inlineDeferSource(),
	);
	const body = rest.length
		? `${first}${inlineDeferSource(deferFactory)}${rest.join('globalThis.__mDefer')}`
		: first!;
	return `<script data-async-resumer${nonceAttribute}${resumeModuleAttribute}${settleModuleAttribute}${selfWakeAttribute}>${escapeInlineScript(body)}</script>`;
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
		...view.asyncBoundaries.flatMap((boundary) => {
			const armRecords = boundary.armRecords;
			return armRecords && !Array.isArray(armRecords)
				? ((armRecords as { readonly events?: ProtocolViewPayload['events'] }).events ?? [])
				: [];
		}),
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
