import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	buildSemanticGraph,
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	type SemanticGraphArtifact,
	type CompilerDiagnostic,
	type NativeViewArtifact,
} from '@markless/compiler';
import { buildRouteManifestFromFileIds } from '@markless/router';
import type { NativeViewPayload } from '@markless/serializer';

export type NativeBuild = {
	readonly payload: NativeViewPayload | null;
	/** The component's scoped CSS as the compiler compiled it for web; Dragon compiles the same text for each platform. */
	readonly styles: ReadonlyArray<{ readonly scopeId: string; readonly cssText: string }>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

/** Compiles one `.tsrx` module through the real compiler, then lowers its analysis to the native view payload. */
export async function compileNativeComponent(input: {
	readonly filename: string;
	readonly source: string;
	/** The module's page file when it is a page (`pages/[fruit].tsrx`); the router derives its route. */
	readonly page?: string;
	/**
	 * Reads a module this one imports (`./Stepper.tsrx`), so its components can be built in place; the caller owns file
	 * access. Without it, an imported component is refused.
	 */
	readonly readModule?: (
		specifier: string,
		importer: string,
	) => { readonly filename: string; readonly source: string } | undefined;
}): Promise<NativeBuild> {
	const route = input.page ? buildRouteManifestFromFileIds([input.page]).routes[0] : undefined;
	if (input.page && !route) throw new Error(`${input.page} is not a page the router routes`);
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
	});
	const importedModules: Record<string, SemanticGraphArtifact> = {};
	for (const entry of compiled.semanticGraph.moduleImports) {
		if (entry.typeOnly || !entry.source.startsWith('.') || importedModules[entry.source]) continue;
		const module = input.readModule?.(entry.source, input.filename);
		if (module)
			importedModules[entry.source] = await buildSemanticGraph({ ...module, nativeFacts: NATIVE_FACT_COLLECTORS });
	}
	const native: NativeViewArtifact = createNativeViewPayload(compiled.semanticGraph, {
		...(route ? { route: { pattern: route.pattern, params: route.params.map((param) => param.name) } } : {}),
		importedModules,
	});
	const errors = collectTsrxModuleDiagnostics(compiled).filter((diagnostic) => diagnostic.severity === 'error');
	return {
		payload: errors.length > 0 ? null : native.payload,
		styles: compiled.publicRenderPlan.styleScopes,
		diagnostics: [...errors, ...native.diagnostics],
	};
}
