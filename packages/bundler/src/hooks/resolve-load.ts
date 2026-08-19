// Answers rolldown's id questions: resolves the ids Markless mints, serves the
// virtual module behind one, and re-requests through the dev server whatever the
// build state no longer holds.
import type { PluginContext } from 'rolldown';
import { withQuery } from 'ufo';
import { MARKLESS_EXECUTION_SIZES } from '../build/execution-sizes.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	executionLogVirtualModuleSource,
} from '../execution-log.ts';
import type { ImportedChild } from '../plugin-state.ts';
import { symbolVirtualModuleSourceFile } from '../source-module.ts';
import { marklessVirtualModuleSourceFile } from '../transform.ts';
import type { MarklessEnvironment } from '../types.ts';
import {
	TSRX_SOURCE_FILE,
	isRelativeImport,
	normalizeVirtualId,
	resolveVirtualId,
	resolverVirtualModuleSourceFile,
	sourceForPrerenderWakeVirtualImporter,
	sourceForResumeVirtualImporter,
	sourceForSymbolVirtualImporter,
	sourceForTriggerGroupVirtualImporter,
	virtualModuleSourceForLoad,
} from '../virtual-ids.ts';
import type { MarklessHookContext } from './hook-context.ts';

export async function resolveIdHook(
	ctx: MarklessHookContext,
	pluginContext: PluginContext,
	source: string,
	importer: string | undefined,
) {
	const { importedChildSources } = ctx.state;
	// Emitted modules import runtime catalog functions as '@markless/web/fns/*'
	// and conditional inline helpers as '@markless/web/inline/*'.
	// Apps depend on @markless/core only, so the bundler resolves the catalog
	// from its own dependency on @markless/web (generated-code-only surface).
	if (source.startsWith('@markless/web/fns/')) {
		const resolved = import.meta.resolve(source);
		if (resolved?.startsWith('file://')) {
			return { id: decodeURIComponent(resolved.slice('file://'.length)) };
		}
	}
	if (source.startsWith('@markless/web/inline/')) {
		const resolvedRoot = import.meta.resolve('@markless/web');
		if (resolvedRoot?.startsWith('file://') && resolvedRoot.endsWith('/index.ts')) {
			const helperPath = source.slice('@markless/web/'.length);
			return {
				id: decodeURIComponent(
					resolvedRoot.slice('file://'.length, -'index.ts'.length) + `${helperPath}.ts`,
				),
			};
		}
	}
	const normalized = normalizeVirtualId(source);
	if (normalized === MARKLESS_EXECUTION_LOG_MODULE_ID) {
		return {
			id: resolveVirtualId(MARKLESS_EXECUTION_LOG_MODULE_ID),
			moduleSideEffects: true,
		};
	}
	const virtualModule = await virtualModuleForRequest(
		ctx,
		normalized,
		ctx.getEnvironment(pluginContext),
	);
	if (virtualModule) {
		const directQuery =
			virtualModule.type === 'style' && /(?:[?&])direct(?:[=&]|$)/.test(source)
				? '?direct'
				: '';
		return {
			id: `${resolveVirtualId(normalized)}${directQuery}`,
			moduleSideEffects: true,
		};
	}
	const missingSymbolSource = symbolVirtualModuleSourceFile(normalized);
	if (missingSymbolSource && importedChildSources.has(missingSymbolSource)) {
		throw new Error(
			`MARKLESS_CHILD_SYMBOL_MISSING: Linked child ${JSON.stringify(missingSymbolSource)} does not provide requested symbol module ${JSON.stringify(normalized)}. Rebuild the child with the current Markless compiler and clear any stale build cache.`,
		);
	}

	const symbolSource = sourceForSymbolVirtualImporter(importer);
	if (symbolSource && isRelativeImport(source)) {
		return await pluginContext.resolve(source, symbolSource, { skipSelf: true });
	}
	const triggerGroupSource = sourceForTriggerGroupVirtualImporter(importer);
	if (triggerGroupSource && isRelativeImport(source)) {
		return await pluginContext.resolve(source, triggerGroupSource, { skipSelf: true });
	}
	const resumeSource =
		sourceForResumeVirtualImporter(importer) ?? sourceForPrerenderWakeVirtualImporter(importer);
	if (resumeSource && isRelativeImport(source)) {
		return await pluginContext.resolve(source, resumeSource, { skipSelf: true });
	}

	return null;
}

export async function loadHook(ctx: MarklessHookContext, pluginContext: PluginContext, id: string) {
	const { internalOptions } = ctx;
	const { moduleMetadata, executionLogEstimatedSizes } = ctx.state;
	if (normalizeVirtualId(id) === MARKLESS_EXECUTION_LOG_MODULE_ID) {
		const embedsDevSizes =
			internalOptions.dev === true && ctx.getEnvironment(pluginContext) === 'client';
		return executionLogVirtualModuleSource({
			moduleSizes: embedsDevSizes ? executionLogEstimatedSizes : undefined,
			attribution: embedsDevSizes
				? ctx.attributionTables(moduleMetadata.symbolClaimMap().values())
				: undefined,
			sizesUrl:
				internalOptions.dev === true
					? undefined
					: (internalOptions.publicPath?.(MARKLESS_EXECUTION_SIZES) ??
						`/${MARKLESS_EXECUTION_SIZES}`),
		});
	}
	const normalizedId = normalizeVirtualId(id);
	const resolverSource = resolverVirtualModuleSourceFile(normalizedId);
	if (
		resolverSource &&
		ctx.getEnvironment(pluginContext) === 'client' &&
		internalOptions.dev !== true &&
		internalOptions.prerenderWakeChannel === true &&
		typeof pluginContext.getModuleInfo === 'function'
	) {
		const queryClaimSources = [
			withQuery(resolverSource, { 'markless-resume': null }),
			withQuery(resolverSource, { 'markless-prerender-wake': null }),
			withQuery(resolverSource, { 'markless-symbols': null }),
		];
		moduleMetadata.expectSourceSymbolClaims(
			resolverSource,
			queryClaimSources.filter((source) => pluginContext.getModuleInfo(source) != null),
		);
		await moduleMetadata.sealSourceSymbolClaims(resolverSource);
	}
	const module = await virtualModuleForRequest(
		ctx,
		normalizedId,
		ctx.getEnvironment(pluginContext),
	);
	if (module) {
		return virtualModuleSourceForLoad(module, {
			dev: internalOptions.dev === true && ctx.getEnvironment(pluginContext) === 'client',
			publicPath: internalOptions.publicPath,
		});
	}
	return null;
}

export async function virtualModuleForRequest(
	ctx: MarklessHookContext,
	normalizedId: string,
	currentEnvironment: MarklessEnvironment,
) {
	const { internalOptions } = ctx;
	const { virtualModules, regeneratingVirtualModules } = ctx.state;
	const registered = virtualModules.get(normalizedId);
	if (registered || internalOptions.dev !== true) return registered;

	const source = marklessVirtualModuleSourceFile(normalizedId);
	if (!source || !TSRX_SOURCE_FILE.test(source) || regeneratingVirtualModules.has(normalizedId)) {
		return undefined;
	}

	regeneratingVirtualModules.add(normalizedId);
	try {
		// Without dropping the cached result the re-request never reaches transform.
		internalOptions.devServer?.invalidateModule?.(source, currentEnvironment);
		await internalOptions.devServer?.transformRequest(source, currentEnvironment);
	} finally {
		regeneratingVirtualModules.delete(normalizedId);
	}
	return virtualModules.get(normalizedId);
}

export async function recoverImportedChildMetadata(
	ctx: MarklessHookContext,
	child: ImportedChild,
	currentEnvironment: MarklessEnvironment,
) {
	const { internalOptions } = ctx;
	const { moduleMetadata, recoveringChildMetadata } = ctx.state;
	if (
		!TSRX_SOURCE_FILE.test(child.source) ||
		moduleMetadata.captureMetadataForSource(child.source) !== undefined ||
		recoveringChildMetadata.has(child.source)
	) {
		return;
	}
	recoveringChildMetadata.add(child.source);
	try {
		internalOptions.devServer?.invalidateModule?.(child.source, currentEnvironment);
		await internalOptions.devServer?.transformRequest(child.source, currentEnvironment);
	} finally {
		recoveringChildMetadata.delete(child.source);
	}
}
