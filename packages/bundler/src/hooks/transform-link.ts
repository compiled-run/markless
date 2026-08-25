// Links a transformed module to the children this build resolved: materializes
// its delegates, forces and links its imports through a second pass, and seals
// the wake aggregate the resolver ships.
import {
	type ArtifactChildMaterialization,
	type LinkedModuleChildResolution,
	delegateMaterializationScope,
	linkedChildrenHaveBrowserTriggers,
	linkedImportedClaimsMissing,
	linkedImportedSymbolInputs,
	linkedManifestHasBrowserTriggers,
	linkedModuleChildKey,
	renderDataReachImportSources,
} from '@markless/compiler';
import {
	awaitChildClaimPublications,
	delegateLoadOptions,
	fallbackImportedSource,
	forceImportedModules,
	linkBarrelComponentInterfaces,
	linkModuleGraph,
	linkedInterfaces,
	materializeDelegateChildren,
	mergeLinkedModuleChildren,
	moduleIsEntry,
	resolveImportedChildren,
	resolveImportedModuleInterfaces,
	sourceSymbolManifest,
	throwLinkedModuleChildDiagnostics,
	warnDelegateImportFailures,
} from '../link-driver.ts';
import { transformTsrxModuleWithPrerenderWakeClosure } from '../transform.ts';
import type { TransformTsrxModuleInput, TransformTsrxModuleResult } from '../types.ts';
import { isSymbolOnlySourceRequest, materializedReachedRenderDataSource } from '../virtual-ids.ts';
import { recoverImportedChildMetadata } from './resolve-load.ts';
import type { TransformRequest } from './transform-request.ts';

export type LinkedTransformChildren = {
	readonly transformed: TransformTsrxModuleResult;
	readonly input: TransformTsrxModuleInput;
	readonly resolvedChildren: ReadonlyArray<LinkedModuleChildResolution>;
	readonly resolvedInterfaceImports: ReadonlyArray<LinkedModuleChildResolution>;
	readonly linkedChildHasBrowserTriggers: boolean;
};

// A delegate child renders at build time only where the `delegate-children`
// pass says this request's scope reaches it.
export async function materializeOwnDelegateChildren(
	request: TransformRequest,
	result: TransformTsrxModuleResult,
	input: TransformTsrxModuleInput,
): Promise<{
	readonly transformed: TransformTsrxModuleResult;
	readonly input: TransformTsrxModuleInput;
}> {
	const { ctx, source, currentEnvironment } = request;
	const { clientRouteArtifactMaterializations } = ctx.state;
	let transformed = result;
	let linkedTransformInput = input;
	const artifactChildMaterializations =
		currentEnvironment === 'client' && clientRouteArtifactMaterializations.has(source)
			? clientRouteArtifactMaterializations.get(source)!
			: await scopedDelegateMaterializations(request, transformed);
	if (Object.keys(artifactChildMaterializations).length > 0) {
		linkedTransformInput = {
			...linkedTransformInput,
			artifactChildMaterializations,
		};
		transformed = await transformTsrxModuleWithPrerenderWakeClosure(
			linkedTransformInput,
			false,
		);
	}
	return { transformed, input: linkedTransformInput };
}

async function scopedDelegateMaterializations(
	request: TransformRequest,
	transformed: TransformTsrxModuleResult,
): Promise<Readonly<Record<string, ArtifactChildMaterialization>>> {
	const { ctx, pluginContext, id, source, currentEnvironment, materializedRenderDataReach } =
		request;
	if (
		!delegateMaterializationScope({
			clientEnvironment: currentEnvironment === 'client',
			symbolOnlyRequest: isSymbolOnlySourceRequest(id),
			moduleEntry: moduleIsEntry(pluginContext, id),
			renderDataReached: materializedRenderDataReach !== undefined,
		})
	) {
		return {};
	}
	const delegates = await materializeDelegateChildren(
		pluginContext,
		source,
		transformed.artifactChildren,
		delegateLoadOptions(ctx),
	);
	// A delegate whose import rejected is reported, not swallowed; the edge still skips.
	warnDelegateImportFailures(pluginContext, delegates);
	return delegates.materializations;
}

export async function linkTransformChildren(
	request: TransformRequest,
	result: TransformTsrxModuleResult,
	input: TransformTsrxModuleInput,
	reusedLinkedTransform: boolean,
): Promise<LinkedTransformChildren> {
	const { ctx, pluginContext, currentEnvironment, materializedRenderDataReach, plan } = request;
	const { internalOptions, linkedChildren } = ctx;
	const { moduleMetadata, moduleLinkArtifacts, importedChildSources, prerenderWakeCapabilities } =
		ctx.state;
	const { manifestSource } = plan;
	let transformed = result;
	let linkedTransformInput = input;
	const resolvedInterfaceImports = await resolveImportedModuleInterfaces(
		pluginContext,
		manifestSource,
		transformed.moduleImports,
		fallbackImportedSource,
	);
	const barrelComponents = await linkBarrelComponentInterfaces(
		pluginContext,
		manifestSource,
		transformed.moduleImports,
		moduleLinkArtifacts,
		internalOptions.buildId,
	);
	// The interfaces this module links: the barrel's synthetic entry first, so a
	// real compiled interface for the same specifier always wins.
	const barrelLinkedInterfaces = () => ({
		...barrelComponents.interfaces,
		...linkedInterfaces(barrelComponents.children, moduleLinkArtifacts).interfaces,
	});
	// A barrel names the parts module, not the components; the symbol routes
	// below must already point at the `.tsrx` files, so the link runs before
	// children are resolved from the manifest.
	if (!reusedLinkedTransform && barrelComponents.children.length > 0) {
		await forceImportedModules(
			pluginContext,
			mergeLinkedModuleChildren(barrelComponents.children),
			moduleLinkArtifacts,
			moduleMetadata,
			internalOptions,
			currentEnvironment,
		);
		linkedTransformInput = {
			...linkedTransformInput,
			importedModuleInterfaces: barrelLinkedInterfaces(),
		};
		transformed = await transformTsrxModuleWithPrerenderWakeClosure(linkedTransformInput, false);
	}
	const resolvedChildren = await resolveImportedChildren(
		pluginContext,
		manifestSource,
		transformed.manifest,
		fallbackImportedSource,
	);
	for (const child of resolvedChildren) {
		linkedChildren.set(linkedModuleChildKey(child), child);
		importedChildSources.add(child.source);
	}
	await forceImportedModules(
		pluginContext,
		mergeLinkedModuleChildren(
			resolvedInterfaceImports,
			barrelComponents.children,
			resolvedChildren,
		),
		moduleLinkArtifacts,
		moduleMetadata,
		internalOptions,
		currentEnvironment,
	);
	for (const child of resolvedChildren) {
		if (internalOptions.dev === true) {
			await recoverImportedChildMetadata(ctx, child, currentEnvironment);
			throwLinkedModuleChildDiagnostics(moduleMetadata, [child], transformed.manifest);
		}
	}
	// Last await before the claim reads below; a sibling must not start compiling
	// between the barrier and the read.
	await awaitChildClaimPublications(moduleMetadata, resolvedChildren);
	const linkedChildHasBrowserTriggers = linkedChildrenHaveBrowserTriggers({
		children: resolvedChildren,
		symbolClaimsForSource: (source) => sourceSymbolManifest(moduleMetadata, source),
		browserTriggerCapability: (source) => prerenderWakeCapabilities.get(source),
	});
	if (
		!reusedLinkedTransform &&
		(resolvedChildren.length > 0 ||
			resolvedInterfaceImports.length > 0 ||
			barrelComponents.children.length > 0)
	) {
		const symbols = linkedImportedSymbolInputs({
			children: resolvedChildren,
			captureMetadataForSource: (source) => moduleMetadata.captureMetadataForSource(source),
			symbolClaimsForSource: (source) => sourceSymbolManifest(moduleMetadata, source),
		});
		const linkedGraph = linkModuleGraph(resolvedInterfaceImports, {
			moduleArtifacts: moduleLinkArtifacts,
			metadata: moduleMetadata,
			parentManifest: transformed.manifest,
			...(materializedRenderDataReach
				? {
						renderDataReachRoot: materializedRenderDataReach,
						reachedRenderDataSource: materializedReachedRenderDataSource,
					}
				: {}),
		});
		const renderDataImportSources = materializedRenderDataReach
			? renderDataReachImportSources(linkedGraph)
			: undefined;
		linkedTransformInput = {
			...linkedTransformInput,
			symbols,
			importedModuleInterfaces: { ...barrelLinkedInterfaces(), ...linkedGraph.interfaces },
			...(renderDataImportSources ? { renderDataImportSources } : {}),
		};
		transformed = await transformTsrxModuleWithPrerenderWakeClosure(
			linkedTransformInput,
			linkedChildHasBrowserTriggers,
		);
	}
	return {
		transformed,
		input: linkedTransformInput,
		resolvedChildren,
		resolvedInterfaceImports,
		linkedChildHasBrowserTriggers,
	};
}

// The aggregate pass exists so one resolver carries every sibling's claims; it
// re-runs until the children it names have sealed theirs.
export async function sealWakeAggregate(
	request: TransformRequest,
	result: TransformTsrxModuleResult,
	input: TransformTsrxModuleInput,
	linkedChildHasBrowserTriggers: boolean,
): Promise<TransformTsrxModuleResult> {
	const { ctx, pluginContext, source, currentEnvironment, plan } = request;
	const { internalOptions } = ctx;
	const { moduleMetadata, moduleLinkArtifacts, prerenderWakeCapabilities } = ctx.state;
	let transformed = result;
	prerenderWakeCapabilities.set(
		source,
		plan.wakeCapability(
			linkedManifestHasBrowserTriggers(transformed.manifest),
			linkedChildHasBrowserTriggers,
		),
	);
	if (plan.aggregateEligible) {
		const aggregateInput = {
			...input,
			clientOutput: undefined,
			prerenderWakeFacade: false,
			prerenderWakeVariant: false,
		};
		let aggregate = await transformTsrxModuleWithPrerenderWakeClosure(
			aggregateInput,
			linkedChildHasBrowserTriggers,
		);
		const aggregateChildren = await resolveImportedChildren(
			pluginContext,
			source,
			aggregate.manifest,
			fallbackImportedSource,
		);
		await forceImportedModules(
			pluginContext,
			aggregateChildren,
			moduleLinkArtifacts,
			moduleMetadata,
			internalOptions,
			currentEnvironment,
		);
		const aggregateSymbolInputs = () =>
			linkedImportedSymbolInputs({
				children: aggregateChildren,
				captureMetadataForSource: (child) => moduleMetadata.captureMetadataForSource(child),
				symbolClaimsForSource: (child) => sourceSymbolManifest(moduleMetadata, child),
			});
		let aggregateSymbols = aggregateSymbolInputs();
		for (
			let attempt = 0;
			linkedImportedClaimsMissing({
				children: aggregateChildren,
				symbols: aggregateSymbols,
				captureMetadataForSource: (child) => moduleMetadata.captureMetadataForSource(child),
			});
			attempt += 1
		) {
			if (attempt === 9) {
				throw new Error(
					`MARKLESS_IMPORTED_SYMBOL_CLAIMS_UNREADY: Source ${JSON.stringify(source)} could not seal imported symbol claims after final publications.`,
				);
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			for (const child of aggregateChildren) {
				await moduleMetadata.sealSourceSymbolClaims(child.source);
			}
			aggregateSymbols = aggregateSymbolInputs();
		}
		aggregate = await transformTsrxModuleWithPrerenderWakeClosure(
			{
				...aggregateInput,
				symbols: aggregateSymbols,
			},
			linkedChildHasBrowserTriggers,
		);
		const resolver = aggregate.virtualModules.find((module) => module.type === 'resolver');
		if (resolver) {
			transformed = {
				...transformed,
				virtualModules: transformed.virtualModules.map((module) =>
					module.type === 'resolver' ? resolver : module,
				),
			};
		}
	}
	return transformed;
}
