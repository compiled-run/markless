// Runs the transform hook as named steps: plans the request, produces the
// first-pass transform, then drives the link and emit steps in order.
import { compileTsrxModuleLinkArtifact } from '@markless/compiler';
import type { TransformPluginContext } from 'rolldown';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	injectExecutionLogModuleHook,
	normalizeExecutionLogMode,
} from '../execution-log.ts';
import {
	fallbackImportedSource,
	forceImportedModules,
	linkBarrelComponentInterfaces,
	linkModuleGraph,
	linkedInterfaceClaims,
	linkedInterfaces,
	mergeLinkedModuleChildren,
	resolveImportedModuleInterfaces,
} from '../link-driver.ts';
import { MARKLESS_VIRTUAL_PREFIX, transformTsrxModule } from '../transform.ts';
import type {
	MarklessEnvironment,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from '../types.ts';
import {
	TSRX_SOURCE_FILE,
	executionLogRuntimeModuleId,
	isMarklessRuntimeModule,
	normalizeVirtualId,
	pathname,
} from '../virtual-ids.ts';
import type { MarklessHookContext } from './hook-context.ts';
import {
	emitClientRouteArtifact,
	emitTransformResult,
	recordLinkedTransform,
	registerFinalTransformArtifacts,
	registerFirstPassArtifacts,
} from './transform-emit.ts';
import {
	linkTransformChildren,
	materializeOwnDelegateChildren,
	sealWakeAggregate,
} from './transform-link.ts';
import { type TransformRequest, planTransformHookRequest } from './transform-request.ts';

export async function transformHook(
	ctx: MarklessHookContext,
	pluginContext: TransformPluginContext,
	code: string,
	id: string,
) {
	const currentEnvironment = ctx.getEnvironment(pluginContext);
	const virtualId = normalizeVirtualId(id);
	if (!TSRX_SOURCE_FILE.test(id)) {
		return transformNonTsrxModule(ctx, pluginContext, code, id, currentEnvironment);
	}
	if (virtualId.startsWith(MARKLESS_VIRTUAL_PREFIX)) {
		return null;
	}
	const request = planTransformHookRequest(ctx, pluginContext, code, id, currentEnvironment);
	const { plan, source } = request;
	const { manifestSource, publishesClientClaims } = plan;
	if (publishesClientClaims) {
		ctx.state.moduleMetadata.beginSourceSymbolClaims(source, manifestSource);
	}
	try {
		return await runTransformSteps(request);
	} catch (error) {
		// A compile that threw publishes nothing; release it so readers stop waiting.
		ctx.state.moduleMetadata.releaseSourceSymbolClaims(source, manifestSource);
		throw error;
	}
}

async function runTransformSteps(request: TransformRequest) {
	const { clientRouteArtifact, currentEnvironment } = request;
	const firstPass = await runFirstPassTransform(request);
	let transformed = firstPass.result;
	let linkedTransformInput = firstPass.input;
	const reusedLinkedTransform = firstPass.reused;
	if (currentEnvironment === 'client' && clientRouteArtifact) {
		return await emitClientRouteArtifact(request, transformed);
	}
	if (!reusedLinkedTransform) {
		const rerun = await materializeOwnDelegateChildren(
			request,
			transformed,
			linkedTransformInput,
		);
		transformed = rerun.transformed;
		linkedTransformInput = rerun.input;
	}
	registerFirstPassArtifacts(request, transformed);
	const linked = await linkTransformChildren(
		request,
		transformed,
		linkedTransformInput,
		reusedLinkedTransform,
	);
	transformed = linked.transformed;
	linkedTransformInput = linked.input;
	transformed = await sealWakeAggregate(
		request,
		transformed,
		linkedTransformInput,
		linked.linkedChildHasBrowserTriggers,
	);
	registerFinalTransformArtifacts(request, transformed);
	recordLinkedTransform(request, transformed, linkedTransformInput, linked);
	return await emitTransformResult(request, transformed, linked.resolvedChildren);
}

// Non-TSRX modules never compile, but the client build still accounts and hooks
// them for the execution log.
function transformNonTsrxModule(
	ctx: MarklessHookContext,
	pluginContext: TransformPluginContext,
	code: string,
	id: string,
	currentEnvironment: MarklessEnvironment,
) {
	const { internalOptions } = ctx;
	const { executionLogEstimatedSizes, executionLogEmittedIds } = ctx.state;
	if (
		currentEnvironment === 'client' &&
		internalOptions.dev !== true &&
		internalOptions.prerender === true &&
		normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
		pluginContext.getModuleInfo(id)?.isEntry === true
	) {
		return {
			code: `${code}\nglobalThis.__mxLoadLog ||= () => import(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});\nglobalThis.__mxLoadLog().then(log => log.logMarklessRenderSummary());`,
			map: null,
		};
	}
	// Hooks follow the log mode, not `dev`: the printer and the size
	// map already ship in `auto`, so a dev-only hook gate made the
	// console structurally blind in every built page.
	if (
		currentEnvironment === 'client' &&
		normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
		isMarklessRuntimeModule(id)
	) {
		executionLogEstimatedSizes.set(executionLogRuntimeModuleId(id), code.length);
		executionLogEmittedIds.set(executionLogRuntimeModuleId(id), pathname(id));
		return {
			code: injectExecutionLogModuleHook(
				code,
				executionLogRuntimeModuleId(id),
				internalOptions.executionLog,
			),
			map: null,
		};
	}
	return null;
}

// Serves the cached transform when its imported interfaces and claims still
// match, and otherwise compiles, publishing a provisional link artifact so a
// cycle that diagnoses before linking never waits on itself.
async function runFirstPassTransform(
	request: ReturnType<typeof planTransformHookRequest>,
): Promise<{
	readonly result: TransformTsrxModuleResult;
	readonly input: TransformTsrxModuleInput;
	readonly reused: boolean;
}> {
	const { ctx, pluginContext, code, source, currentEnvironment, plan, transformInput } = request;
	const { internalOptions } = ctx;
	const { moduleMetadata, moduleLinkArtifacts, linkedTransformCache } = ctx.state;
	const { cacheKey, manifestSource } = plan;
	const cached = linkedTransformCache.get(cacheKey);
	let linkedTransformResult: TransformTsrxModuleResult | undefined;
	let linkedTransformInput = transformInput;
	let reusedLinkedTransform = false;
	if (cached?.code === code) {
		const cachedImports = await resolveImportedModuleInterfaces(
			pluginContext,
			manifestSource,
			cached.result.moduleImports,
			fallbackImportedSource,
		);
		await forceImportedModules(
			pluginContext,
			cachedImports,
			moduleLinkArtifacts,
			moduleMetadata,
			internalOptions,
			currentEnvironment,
		);
		const cachedLink = linkedInterfaces(
			cachedImports,
			moduleLinkArtifacts,
			linkedInterfaceClaims(cachedImports, moduleMetadata),
		);
		if (
			cached.importedInterfaceHashes === cachedLink.signature &&
			cached.importedSymbolClaims === cachedLink.claimSignature
		) {
			linkedTransformResult = cached.result;
			linkedTransformInput = cached.input;
			reusedLinkedTransform = true;
		}
	}
	// Same predicate as `!reusedLinkedTransform`, phrased so the result is provably assigned.
	if (linkedTransformResult === undefined) {
		try {
			linkedTransformResult = await transformTsrxModule(transformInput);
		} catch (error) {
			// Imported graph helpers can diagnose before their interface is linked.
			// Publish only this compiler-owned link artifact so cycles never wait.
			// A failing recovery compile must not mask the transform error.
			let provisional: Awaited<ReturnType<typeof compileTsrxModuleLinkArtifact>>;
			try {
				provisional = await compileTsrxModuleLinkArtifact(transformInput);
			} catch {
				throw error;
			}
			moduleLinkArtifacts.set(source, provisional);
			const provisionalImports = await resolveImportedModuleInterfaces(
				pluginContext,
				manifestSource,
				provisional.moduleImports,
				fallbackImportedSource,
			);
			// A consumer whose only import is a plain `.ts` barrel contributes no
			// interface request above, so the barrel walk is the whole recovery:
			// without it the shared call behind the barrel can never resolve.
			let provisionalBarrels: Awaited<ReturnType<typeof linkBarrelComponentInterfaces>>;
			try {
				provisionalBarrels = await linkBarrelComponentInterfaces(
					pluginContext,
					manifestSource,
					provisional.moduleImports,
					moduleLinkArtifacts,
					internalOptions.buildId,
				);
			} catch {
				throw error;
			}
			const provisionalChildren = mergeLinkedModuleChildren(
				provisionalImports,
				provisionalBarrels.children,
			);
			// Nothing new to link against means the recompile would only rethrow.
			if (
				provisionalChildren.length === 0 &&
				Object.keys(provisionalBarrels.interfaces).length === 0
			) {
				throw error;
			}
			await forceImportedModules(
				pluginContext,
				provisionalChildren,
				moduleLinkArtifacts,
				moduleMetadata,
				internalOptions,
				currentEnvironment,
			);
			linkedTransformInput = {
				...transformInput,
				// The barrel's synthetic entries first, so a real compiled interface
				// for the same specifier always wins.
				importedModuleInterfaces: {
					...provisionalBarrels.interfaces,
					...linkModuleGraph(provisionalChildren, {
						moduleArtifacts: moduleLinkArtifacts,
						metadata: moduleMetadata,
					}).interfaces,
				},
			};
			linkedTransformResult = await transformTsrxModule(linkedTransformInput);
		}
	}
	return {
		result: linkedTransformResult,
		input: linkedTransformInput,
		reused: reusedLinkedTransform,
	};
}
