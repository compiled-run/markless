// Decides which generated modules an edited source invalidates, then clears them
// from the build state and the development graph.
import {
	linkedManifestHasBrowserTriggers,
	linkedRenderDataOnlyChange,
	renderDataClaimManifest,
} from '@markless/compiler';
import { MARKLESS_EXECUTION_LOG_MODULE_ID, normalizeExecutionLogMode } from './execution-log.ts';
import type { MarklessHookContext } from './hooks/hook-context.ts';
import { recordEmittedClaimOwnership } from './plugin-state.ts';
import { transformTsrxModuleWithPrerenderWakeClosure } from './transform.ts';
import type { MarklessEnvironment } from './types.ts';
import { isRenderDataSourceRequest, pathname, resolveVirtualId } from './virtual-ids.ts';

export function invalidateAllGeneratedModules(
	ctx: MarklessHookContext,
	parent: string,
	currentEnvironment?: MarklessEnvironment,
) {
	const { state, internalOptions, dev, environment } = ctx;
	const {
		virtualModules,
		moduleMetadata,
		prerenderWakeCapabilities,
		moduleLinkArtifacts,
		linkedTransformCache,
		prerenderWakeSources,
	} = state;
	const changedSource = pathname(parent);
	moduleLinkArtifacts.delete(changedSource);
	moduleMetadata.deleteCaptureMetadata(changedSource);
	moduleMetadata.deleteSymbolClaims(changedSource);
	prerenderWakeCapabilities.delete(changedSource);
	prerenderWakeSources.delete(changedSource);
	for (const [key, cached] of linkedTransformCache) {
		if (cached.source !== changedSource) continue;
		moduleMetadata.deleteSymbolClaims(cached.manifestSource);
		linkedTransformCache.delete(key);
	}
	const ids = dev.clear(parent, currentEnvironment);
	const resolvedIds = new Set<string>();
	for (const id of ids) {
		const type = virtualModules.get(id)?.type;
		virtualModules.delete(id);
		const resolvedId = resolveVirtualId(id);
		resolvedIds.add(resolvedId);
		if (type === 'style') resolvedIds.add(`${resolvedId}?direct`);
	}
	const invalidatesClient =
		currentEnvironment === 'client' ||
		(currentEnvironment === undefined && environment === 'client');
	if (
		invalidatesClient &&
		internalOptions.dev === true &&
		normalizeExecutionLogMode(internalOptions.executionLog) !== 'never'
	) {
		resolvedIds.add(resolveVirtualId(MARKLESS_EXECUTION_LOG_MODULE_ID));
	}
	return [...resolvedIds];
}

export async function invalidateEditedGeneratedModules(
	ctx: MarklessHookContext,
	parent: string,
	currentEnvironment: MarklessEnvironment | undefined,
	nextSource: string,
) {
	const { state } = ctx;
	const {
		virtualModules,
		moduleMetadata,
		prerenderWakeCapabilities,
		moduleLinkArtifacts,
		linkedTransformCache,
	} = state;
	const changedSource = pathname(parent);
	const cachedEntries = [...linkedTransformCache].filter(
		([key, cached]) =>
			cached.source === changedSource &&
			(!currentEnvironment || key.startsWith(`${currentEnvironment}\0`)),
	);
	if (cachedEntries.length === 0) {
		return invalidateAllGeneratedModules(ctx, parent, currentEnvironment);
	}

	const nextEntries = await Promise.all(
		cachedEntries.map(async ([key, cached]) => {
			const nextInput = { ...cached.input, source: nextSource };
			return [
				key,
				cached,
				nextInput,
				await transformTsrxModuleWithPrerenderWakeClosure(
					nextInput,
					cached.linkedChildHasBrowserTriggers,
				),
			] as const;
		}),
	);
	if (
		nextEntries.some(([, cached, , next]) => !linkedRenderDataOnlyChange(cached.result, next))
	) {
		return invalidateAllGeneratedModules(ctx, parent, currentEnvironment);
	}

	const renderDataIds = new Set<string>();
	for (const [key, cached, nextInput, next] of nextEntries) {
		linkedTransformCache.set(key, {
			...cached,
			code: nextSource,
			input: nextInput,
			result: next,
		});
		moduleLinkArtifacts.set(changedSource, {
			moduleGraphInterface: next.moduleGraphInterface,
			interfaceHash: next.interfaceHash,
			moduleImports: next.moduleImports,
		});
		moduleMetadata.recordCaptureMetadata(changedSource, next.manifest);
		recordEmittedClaimOwnership(state, {
			source: changedSource,
			emittedModule: cached.manifestSource,
			manifest: next.manifest,
			virtualModules: next.virtualModules,
			...(isRenderDataSourceRequest(cached.manifestSource)
				? {
						overrideManifest: renderDataClaimManifest(
							next.manifest,
							cached.manifestSource,
						),
					}
				: {}),
		});
		prerenderWakeCapabilities.set(
			changedSource,
			linkedManifestHasBrowserTriggers(next.manifest) || cached.linkedChildHasBrowserTriggers,
		);
		for (const module of next.virtualModules) {
			if (module.type !== 'render-data') continue;
			virtualModules.set(module.id, module);
			renderDataIds.add(resolveVirtualId(module.id));
		}
	}
	return [...renderDataIds];
}
