import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	createNativeViewPayload,
	type CompilerDiagnostic,
	type NativeViewArtifact,
} from '@markless/compiler';
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
}): Promise<NativeBuild> {
	const compiled = await compileTsrxModule({ ...input, symbols: [] });
	const native: NativeViewArtifact = createNativeViewPayload(compiled.semanticGraph);
	const errors = collectTsrxModuleDiagnostics(compiled).filter((diagnostic) => diagnostic.severity === 'error');
	return {
		payload: errors.length > 0 ? null : native.payload,
		styles: compiled.publicRenderPlan.styleScopes,
		diagnostics: [...errors, ...native.diagnostics],
	};
}
