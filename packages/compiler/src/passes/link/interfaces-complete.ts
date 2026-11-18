import type { CompileTsrxModuleResult, LinkedInterfaceCompleteness } from '../../artifacts.ts';

/** Whether every component this module renders from another module has its interface, so the page can be re-rendered here. */
export function prerenderInterfacesComplete(
	compiled: Pick<CompileTsrxModuleResult, 'semanticGraph'>,
	link: LinkedInterfaceCompleteness,
): boolean {
	return compiled.semanticGraph.componentEdges.every(
		(edge) =>
			!edge.importSource ||
			link.artifactChildMaterializations?.[edge.id] !== undefined ||
			link.importedModuleInterfaces?.[edge.importSource] !== undefined,
	);
}
