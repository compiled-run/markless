// Records what a transform produced in the build state and returns the module
// the request asked for.
import {
	type LinkedModuleChildResolution,
	linkedRouteArtifactRegistration,
	planRenderDataModule,
	renderDataClaimManifest,
} from '@markless/compiler';
import { invalidateAllGeneratedModules } from '../dev-invalidation.ts';
import {
	delegateLoadOptions,
	linkedInterfaceClaims,
	linkedInterfaces,
	materializeDelegateChildren,
	mergeLinkedModuleChildren,
	warnDelegateImportFailures,
} from '../link-driver.ts';
import { registerRenderDataStyles, registerTransformArtifacts } from '../plugin-state.ts';
import type { TransformTsrxModuleInput, TransformTsrxModuleResult } from '../types.ts';
import {
	clientRouteArtifactReference,
	isClientPrimarySourceRequest,
	isResumeSourceRequest,
} from '../virtual-ids.ts';
import type { LinkedTransformChildren } from './transform-link.ts';
import type { TransformRequest } from './transform-request.ts';

// A route artifact never ships its own module: the client imports the reference
// the router resolves, so this request stops at registration.
export async function emitClientRouteArtifact(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
) {
	const { ctx, pluginContext, source } = request;
	const { clientRouteArtifactMaterializations } = ctx.state;
	const delegates = await materializeDelegateChildren(
		pluginContext,
		source,
		transformed.artifactChildren,
		delegateLoadOptions(ctx),
	);
	warnDelegateImportFailures(pluginContext, delegates);
	const artifactChildMaterializations = delegates.materializations;
	if (Object.keys(artifactChildMaterializations).length > 0) {
		clientRouteArtifactMaterializations.set(source, artifactChildMaterializations);
	}
	registerClientRouteArtifactSource(ctx, source);
	return {
		code: clientRouteArtifactReference(source),
		map: null,
	};
}

// Register the first-pass artifact before loading children so the existing
// cross-module registry can validate both sides of the composition edge.
export function registerFirstPassArtifacts(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
) {
	const { ctx, source, currentEnvironment, renderDataRequest, plan } = request;
	const { internalOptions, dev, state } = ctx;
	const { moduleMetadata, moduleLinkArtifacts } = state;
	const { cacheKey, manifestSource } = plan;
	if (!renderDataRequest) {
		registerTransformArtifacts(state, {
			owner: cacheKey,
			source,
			manifestSource,
			result: transformed,
			dev,
			environment: currentEnvironment,
			finalPublication: false,
			tracksSourceClaimPublication: false,
			updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
		});
	} else {
		moduleMetadata.recordCaptureMetadata(source, transformed.manifest);
		moduleMetadata.recordSymbolClaims(
			manifestSource,
			renderDataClaimManifest(transformed.manifest, manifestSource),
		);
		moduleLinkArtifacts.set(source, {
			interfaceHash: transformed.interfaceHash,
			moduleGraphInterface: transformed.moduleGraphInterface,
			moduleImports: transformed.moduleImports,
		});
	}
}

export function registerFinalTransformArtifacts(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
) {
	const { ctx, source, currentEnvironment, renderDataRequest, plan } = request;
	const { internalOptions, dev, state } = ctx;
	const { moduleMetadata } = state;
	const { cacheKey, manifestSource, publishesClientClaims } = plan;
	if (!renderDataRequest)
		registerTransformArtifacts(state, {
			owner: cacheKey,
			source,
			manifestSource,
			result: transformed,
			dev,
			environment: currentEnvironment,
			finalPublication: true,
			tracksSourceClaimPublication: publishesClientClaims,
			replaceOwnedArtifacts: true,
			updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
		});
	else {
		moduleMetadata.recordCaptureMetadata(source, transformed.manifest);
		moduleMetadata.recordSymbolClaims(
			manifestSource,
			renderDataClaimManifest(transformed.manifest, manifestSource),
		);
	}
}

export function recordLinkedTransform(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
	linkedTransformInput: TransformTsrxModuleInput,
	linked: LinkedTransformChildren,
) {
	const { ctx, code, source, plan } = request;
	const { moduleMetadata, moduleLinkArtifacts, linkedTransformCache } = ctx.state;
	const { cacheKey, manifestSource } = plan;
	const { resolvedInterfaceImports, resolvedChildren, linkedChildHasBrowserTriggers } = linked;
	linkedTransformCache.set(cacheKey, {
		source,
		manifestSource,
		code,
		importedInterfaceHashes: linkedInterfaces(resolvedInterfaceImports, moduleLinkArtifacts)
			.signature,
		importedSymbolClaims: linkedInterfaces(
			resolvedInterfaceImports,
			moduleLinkArtifacts,
			linkedInterfaceClaims(
				mergeLinkedModuleChildren(resolvedInterfaceImports, resolvedChildren),
				moduleMetadata,
			),
		).claimSignature,
		input: linkedTransformInput,
		result: transformed,
		linkedChildHasBrowserTriggers,
	});
}

export async function emitTransformResult(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
	resolvedChildren: ReadonlyArray<LinkedModuleChildResolution>,
) {
	const {
		ctx,
		pluginContext,
		id,
		source,
		currentEnvironment,
		renderDataRequest,
		prerenderWakeRequest,
		plan,
	} = request;
	const { internalOptions, dev, state } = ctx;
	const {
		virtualModules,
		clientSymbolEntrySources,
		importedChildSources,
		emittedClientResolverSources,
		transformedClientPrimarySources,
	} = state;
	const { cacheKey, manifestSource } = plan;
	if (currentEnvironment === 'client' && isClientPrimarySourceRequest(id)) {
		transformedClientPrimarySources.add(source);
	}
	if (currentEnvironment === 'client' && renderDataRequest) {
		const renderDataModule = transformed.virtualModules.find(
			(module) => module.type === 'render-data',
		);
		if (renderDataModule) {
			const styleModules = transformed.virtualModules.filter(
				(module) => module.type === 'style',
			);
			registerRenderDataStyles(state, {
				owner: cacheKey,
				source,
				modules: styleModules,
				dev,
			});
			const renderData = planRenderDataModule({
				source,
				emittedModule: manifestSource,
				moduleSource: renderDataModule.source,
				styleModules: styleModules.map((module) => module.id),
				manifest: transformed.manifest,
				linkedModules: virtualModules.keys(),
			});
			throwIfRenderDataUnlinked(renderData);
			return {
				code: [
					...renderData.styleModules.map(
						(styleModule) => `import ${JSON.stringify(styleModule)};`,
					),
					renderDataModule.source,
				].join('\n'),
				map: null,
			};
		}
	}
	for (const child of resolvedChildren) {
		dev.record(
			child.source,
			[transformed.manifest.resolver.virtualModuleId],
			currentEnvironment,
		);
	}
	if (currentEnvironment === 'client' && isResumeSourceRequest(id)) {
		const resumeModule = transformed.virtualModules.find((module) => module.type === 'resume');
		if (resumeModule) return { code: resumeModule.source, map: null };
	}
	if (currentEnvironment === 'client' && prerenderWakeRequest) {
		const wakeModule = transformed.virtualModules.find(
			(module) => module.type === 'prerender-wake',
		);
		return wakeModule
			? {
					code: `export { resumeContainerEvent } from ${JSON.stringify(wakeModule.id)};`,
					map: null,
				}
			: {
					code: [
						'export async function resumeContainerEvent() {',
						"\tthrow new Error('MARKLESS_PRERENDER_WAKE_ROUTE_INELIGIBLE');",
						'}',
					].join('\n'),
					map: null,
				};
	}

	if (currentEnvironment === 'client' && !internalOptions.dev) {
		// A bundled symbol reaches the graph through its bundle's chunk root; emitting
		// it as its own entry too would restore the per-symbol chunk it replaces.
		const bundledSymbolModuleIds = new Set(
			transformed.virtualModules.flatMap((item) =>
				item.type === 'symbol-bundle' ? [...(item.bundledSymbolModuleIds ?? [])] : [],
			),
		);
		for (const module of transformed.virtualModules.filter((item) => {
			if (item.type === 'symbol') return !bundledSymbolModuleIds.has(item.id);
			if (item.type === 'symbol-bundle') return true;
			if (item.type === 'trigger-group') return true;
			if (item.type === 'settle') return clientSymbolEntrySources.has(source);
			if (item.type === 'resolver') {
				return (
					(importedChildSources.has(source) ||
						(transformed.manifest.captureMetadata?.boundResolverRows?.length ?? 0) >
							0) &&
					!emittedClientResolverSources.has(source)
				);
			}
			return (
				(item.type === 'resume' || item.type === 'prerender-wake') &&
				internalOptions.emitResumeModules === true &&
				clientSymbolEntrySources.has(source)
			);
		})) {
			pluginContext.emitFile({
				type: 'chunk',
				id: module.id,
				preserveSignature: 'strict',
			});
			if (module.type === 'resolver') {
				emittedClientResolverSources.add(source);
			}
		}
	}

	return transformed;
}

// Applies the `claim-manifest` route-artifact verdict: the pass decides whether
// a source may still take ownership, the plugin performs the invalidation.
function registerClientRouteArtifactSource(ctx: TransformRequest['ctx'], source: string): void {
	const { internalOptions } = ctx;
	const { clientRouteArtifactSources, transformedClientPrimarySources } = ctx.state;
	const registration = linkedRouteArtifactRegistration({
		source,
		registered: clientRouteArtifactSources.has(source),
		primaryTransformed: transformedClientPrimarySources.has(source),
		dev: internalOptions.dev === true,
	});
	if (registration.action === 'already-registered') return;
	if (registration.action === 'late') throw new Error(registration.diagnostics[0]!.message);
	if (registration.action === 'reinvalidate') {
		invalidateAllGeneratedModules(ctx, source, 'client');
		transformedClientPrimarySources.delete(source);
		internalOptions.devServer?.invalidateModule?.(source, 'client');
	}
	clientRouteArtifactSources.add(source);
}

// A render-data module that links a scoped style this build never registered
// would ship markup with no CSS behind it, so the pass diagnostic fails the
// load rather than serving the silent version.
function throwIfRenderDataUnlinked(renderData: {
	readonly diagnostics: ReadonlyArray<{ readonly message: string }>;
}) {
	const unlinked = renderData.diagnostics[0];
	if (unlinked) throw new Error(unlinked.message);
}
