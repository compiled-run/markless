import { compileTsrxModule } from '../src/index.ts';
import type { CompileTsrxModuleResult, ModuleGraphInterfaceArtifact } from '../src/index.ts';

type CompileInput = {
	readonly filename: string;
	readonly source: string;
	readonly importSource?: string;
};

export async function compileTsrxModulesWithInterfaces(
	modules: ReadonlyArray<CompileInput>,
): Promise<ReadonlyArray<CompileTsrxModuleResult>> {
	const importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact> = {};
	const results: CompileTsrxModuleResult[] = [];

	for (const module of modules) {
		const result = await compileTsrxModule({
			filename: module.filename,
			source: module.source,
			symbols: [],
			importedModuleInterfaces,
		});

		results.push(result);
		importedModuleInterfaces[module.importSource ?? module.filename] = result.moduleGraphInterface;
	}

	return results;
}
