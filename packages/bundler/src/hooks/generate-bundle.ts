// Runs the post-order generateBundle hook: fails closed on any linked child the
// pass could not classify, then finalizes the client bundle.
import type { MarklessBuildMetadataBundle } from '../build/build-metadata.ts';
import { type FinalizeBundleContext, finalizeBundle } from '../build/bundle-finalize.ts';
import { throwLinkedModuleChildDiagnostics } from '../link-driver.ts';
import type { MarklessHookContext } from './hook-context.ts';

export async function generateBundleHook(
	ctx: MarklessHookContext,
	pluginContext: FinalizeBundleContext,
	bundle: MarklessBuildMetadataBundle & Record<string, unknown>,
) {
	const { internalOptions, linkedChildren } = ctx;
	const { moduleMetadata, executionLogEmittedIds } = ctx.state;
	throwLinkedModuleChildDiagnostics(moduleMetadata, [...linkedChildren.values()]);
	if (ctx.getEnvironment(pluginContext) !== 'client') return;
	await finalizeBundle(pluginContext, bundle, {
		options: internalOptions,
		moduleMetadata,
		root: ctx.getRoot(),
		executionLogEmittedIds,
		executionAttributionTables: ctx.attributionTables,
	});
}
