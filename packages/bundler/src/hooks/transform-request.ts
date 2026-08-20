// Turns one rolldown transform request into the plan the `transform-plan` pass
// returned and the compiler input the rest of the hook works from.
import { linkedRenderDataReachRoot, planTransformRequest } from '@markless/compiler';
import type { TransformPluginContext } from 'rolldown';
import { withQuery } from 'ufo';
import { normalizeExecutionLogMode } from '../execution-log.ts';
import { moduleIsEntry } from '../link-driver.ts';
import type { MarklessEnvironment, TransformTsrxModuleInput } from '../types.ts';
import {
	MARKLESS_ROUTE_SOURCE_QUERY_RE,
	devBrowserSourceModuleUrl,
	devBrowserVirtualModuleUrl,
	isClientPrimarySourceRequest,
	isPrerenderWakeSourceRequest,
	isRenderDataSourceRequest,
	isResumeSourceRequest,
	isSymbolOnlySourceRequest,
	pathname,
	renderDataReachedFromQuery,
} from '../virtual-ids.ts';
import type { MarklessHookContext } from './hook-context.ts';

// One transform request and everything derived from it before the first pass:
// the request kinds the id encodes, the pass's plan, and the compiler input.
export type TransformRequest = {
	readonly ctx: MarklessHookContext;
	readonly pluginContext: TransformPluginContext;
	readonly code: string;
	readonly id: string;
	readonly source: string;
	readonly currentEnvironment: MarklessEnvironment;
	readonly renderDataRequest: boolean;
	readonly prerenderWakeRequest: boolean;
	readonly clientRouteArtifact: boolean;
	readonly materializedRenderDataReach: string | undefined;
	readonly plan: ReturnType<typeof planTransformRequest>;
	readonly transformInput: TransformTsrxModuleInput;
};

export function planTransformHookRequest(
	ctx: MarklessHookContext,
	pluginContext: TransformPluginContext,
	code: string,
	id: string,
	currentEnvironment: MarklessEnvironment,
): TransformRequest {
	const { internalOptions } = ctx;
	const {
		prerenderWakeSources,
		clientSymbolEntrySources,
		clientRouteArtifactSources,
		clientRouteArtifactMaterializations,
	} = ctx.state;
	const source = pathname(id);
	const renderDataRequest = isRenderDataSourceRequest(id);
	const prerenderWakeRequest = isPrerenderWakeSourceRequest(id);
	const clientRouteArtifact = MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id);
	const materializedRenderDataReach =
		currentEnvironment === 'client' && renderDataRequest
			? linkedRenderDataReachRoot({
					source,
					materializedSources: clientRouteArtifactMaterializations,
					reachedFrom: renderDataReachedFromQuery(id),
				})
			: undefined;
	if (currentEnvironment === 'client' && prerenderWakeRequest) {
		clientSymbolEntrySources.add(source);
		prerenderWakeSources.add(source);
	}
	const clientOutput =
		currentEnvironment === 'client' &&
		((clientSymbolEntrySources.has(source) &&
			internalOptions.prerender !== true &&
			!clientRouteArtifactSources.has(source) &&
			isClientPrimarySourceRequest(id) &&
			moduleIsEntry(pluginContext, id)) ||
			isSymbolOnlySourceRequest(id))
			? ('symbols-only' as const)
			: undefined;
	const plan = planTransformRequest({
		environment: currentEnvironment,
		source,
		requestId: id,
		request: {
			resume: isResumeSourceRequest(id),
			prerenderWake: prerenderWakeRequest,
			renderData: renderDataRequest,
			routeArtifact: clientRouteArtifact,
			clientPrimary: isClientPrimarySourceRequest(id),
		},
		options: {
			dev: internalOptions.dev === true,
			prerender: internalOptions.prerender === true,
			prerenderWakeChannel: internalOptions.prerenderWakeChannel === true,
		},
		hasWakeSources: prerenderWakeSources.size > 0,
		renderDataReached: materializedRenderDataReach !== undefined,
		routeArtifactSource: clientRouteArtifactSources.has(source),
		clientOutput,
		getModuleInfoAvailable: typeof pluginContext.getModuleInfo === 'function',
	});
	const { prerenderRecords } = plan;
	const transformInput: TransformTsrxModuleInput = {
		filename: source,
		source: code,
		dev: plan.dev,
		buildId: internalOptions.buildId,
		executionLog: normalizeExecutionLogMode(internalOptions.executionLog),
		executionLogModuleHooks:
			currentEnvironment === 'client' &&
			normalizeExecutionLogMode(internalOptions.executionLog) !== 'never',
		inlineResumerDebug: internalOptions.inlineResumerDebug === true,
		prerenderRecords,
		directCsr:
			currentEnvironment === 'client' &&
			internalOptions.emitResumeModules !== true &&
			internalOptions.prerender !== true &&
			!renderDataRequest &&
			!prerenderWakeRequest &&
			!isResumeSourceRequest(id) &&
			!isSymbolOnlySourceRequest(id) &&
			!clientRouteArtifact,
		runtimeDemandClass:
			currentEnvironment === 'client' &&
			internalOptions.emitResumeModules === true &&
			!prerenderRecords &&
			!clientRouteArtifactSources.has(source)
				? 'plain-ssr'
				: 'prerender',
		prerenderWakeVariant:
			internalOptions.prerenderWakeChannel === true &&
			(prerenderWakeRequest ||
				(plan.ssrPrerenderArtifacts && clientSymbolEntrySources.has(source))),
		prerenderWakeFacade: prerenderWakeRequest,
		preserveWakeSiblingClaims:
			currentEnvironment === 'client' &&
			(isResumeSourceRequest(id) || isSymbolOnlySourceRequest(id)),
		environment: currentEnvironment,
		clientOutput,
		// Dev resume URL points at the SOURCE module (not the virtual resume
		// module): loading the .tsrx keeps it in the client module graph, which
		// is what lets Vite's own no-accepting-boundary full-reload fire on
		// edits (commit e3c5bcc's design). The source client module re-exports
		// resumeContainerEvent from the virtual resume module in dev only;
		// production builds keep the split (CSR emits no resume code).
		resumeModuleUrl:
			internalOptions.dev === true && currentEnvironment === 'server'
				? devBrowserSourceModuleUrl(source, ctx.getRoot(), internalOptions.publicPath)
				: currentEnvironment === 'server'
					? internalOptions.productionResumeModuleUrls?.get(source)
					: undefined,
		prerenderWakeModuleUrl:
			currentEnvironment === 'server'
				? internalOptions.productionPrerenderWakeModuleUrls?.get(source)
				: undefined,
		settleModuleUrl:
			currentEnvironment === 'server'
				? internalOptions.productionSettleModuleUrls?.get(source)
				: undefined,
		styleModuleUrl:
			internalOptions.dev === true && currentEnvironment === 'server'
				? (virtualId) =>
						withQuery(
							devBrowserVirtualModuleUrl(virtualId, internalOptions.publicPath),
							{
								direct: null,
							},
						)
				: undefined,
		headInjections:
			internalOptions.dev === true && currentEnvironment === 'server'
				? internalOptions.devInjections
				: undefined,
		devResumeReexport: plan.devResumeReexport,
		prerenderRecordData:
			currentEnvironment === 'client' ? ctx.prerenderRecordsBySource?.get(source) : undefined,
	};
	return {
		ctx,
		pluginContext,
		code,
		id,
		source,
		currentEnvironment,
		renderDataRequest,
		prerenderWakeRequest,
		clientRouteArtifact,
		materializedRenderDataReach,
		plan,
		transformInput,
	};
}
