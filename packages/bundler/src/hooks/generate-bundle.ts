// Runs the post-order generateBundle hook: fails closed on any linked child the
// pass could not classify, then finalizes the client bundle.
import type { MarklessBuildMetadataBundle } from '../build/build-metadata.ts';
import { type FinalizeBundleContext, finalizeBundle } from '../build/bundle-finalize.ts';
import type { HashCharacters } from '../build/content-hash-names.ts';
import type { PackOwnership } from '../build/native-packing.ts';
import { throwLinkedModuleChildDiagnostics } from '../link-driver.ts';
import type { MarklessHookContext } from './hook-context.ts';

export async function generateBundleHook(
	ctx: MarklessHookContext,
	pluginContext: FinalizeBundleContext,
	bundle: MarklessBuildMetadataBundle & Record<string, unknown>,
	hashCharacters?: HashCharacters,
	packs?: PackOwnership,
) {
	const { internalOptions, linkedChildren } = ctx;
	const { moduleMetadata, executionLogEmittedIds } = ctx.state;
	throwLinkedModuleChildDiagnostics(moduleMetadata, [...linkedChildren.values()]);
	if (ctx.getEnvironment(pluginContext) !== 'client') return;
	const refusals = moduleMetadata.propFlow.refusals();
	if (refusals.length > 0) throw new Error(refusals.join('\n\n'));
	await finalizeBundle(pluginContext, bundle, {
		options: internalOptions,
		moduleMetadata,
		root: ctx.getRoot(),
		executionLogEmittedIds,
		executionAttributionTables: ctx.attributionTables,
		hashCharacters,
		packs,
	});
}
