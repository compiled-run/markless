import { buildSemanticGraph, createNativeViewPayload, type NativeViewArtifact } from '@markless/compiler';

/** Compiles one `.tsrx` module to the native view payload its hosts read. */
export async function compileNativeComponent(input: {
	readonly filename: string;
	readonly source: string;
}): Promise<NativeViewArtifact> {
	return createNativeViewPayload(await buildSemanticGraph(input));
}
