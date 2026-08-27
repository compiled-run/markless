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

export function idOf(compiled: CompiledModule, componentName: string, name: string): string {
	const binding = bindingOf(compiled, componentName, name);
	if (!binding) throw new Error(`No "${name}" binding declared by ${componentName}.`);
	return binding.id;
}

/** Every emitted surface the graph node id is spelled into, as one string. */
export function emitted(compiled: CompiledModule): string {
	return [
		compiled.publicRenderModule.renderDataModuleSource,
		compiled.publicRenderModule.ssrModuleSource ?? '',
		compiled.symbolModules.modules
			.map((module) => `${module.symbolId}\n${module.source}`)
			.join('\n\n'),
		compiled.symbolResolverModule,
		JSON.stringify(compiled.publicRenderPlan, null, 2),
		JSON.stringify(compiled.protocolState, null, 2),
		JSON.stringify(compiled.protocolView, null, 2),
		JSON.stringify(compiled.payloadScripts, null, 2),
	].join('\n\n');
}
