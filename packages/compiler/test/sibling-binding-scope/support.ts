import { compileTsrxModule } from '../../src/index.ts';
import type { SemanticGraphBinding } from '../../src/artifacts.ts';

export async function compileModule(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

export type CompiledModule = Awaited<ReturnType<typeof compileModule>>;

export function errorCodes(compiled: CompiledModule): ReadonlyArray<string> {
	return compiled.semanticGraph.diagnostics
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

export function bindingOf(
	compiled: CompiledModule,
	componentName: string,
	name: string,
): SemanticGraphBinding | undefined {
	return compiled.semanticGraph.graphBindings.find(
		(binding) => binding.componentName === componentName && binding.name === name,
	);
}

/** `source` -> `path` for one binding's dependency edges, in authored order. */
export function dependencyEdges(
	binding: SemanticGraphBinding | undefined,
): ReadonlyArray<string> {
	return (binding?.dependencies ?? []).map(
		(dependency) => `${dependency.graphNodeId}:${dependency.path.join('.')}`,
	);
}
