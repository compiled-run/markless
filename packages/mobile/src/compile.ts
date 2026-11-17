import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
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
}): Promise<NativeBuild> {
	const route = input.page ? buildRouteManifestFromFileIds([input.page]).routes[0] : undefined;
	if (input.page && !route) throw new Error(`${input.page} is not a page the router routes`);
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
	});
	const native: NativeViewArtifact = createNativeViewPayload(
		compiled.semanticGraph,
		route ? { route: { pattern: route.pattern, params: route.params.map((param) => param.name) } } : {},
	);
	const errors = collectTsrxModuleDiagnostics(compiled).filter((diagnostic) => diagnostic.severity === 'error');
	return {
		payload: errors.length > 0 ? null : native.payload,
		styles: compiled.publicRenderPlan.styleScopes,
		diagnostics: [...errors, ...native.diagnostics],
	};
}
