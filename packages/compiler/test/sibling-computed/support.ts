import type { CompileTsrxModuleResult } from '../../src/index.ts';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { COMPUTED_READ_CALLED_CODE } from '../../src/passes/foreign-scope.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

export type CompileInput = {
	readonly filename: string;
	readonly source: string;
	readonly importSource?: string;
};

export async function compileOne(filename: string, source: string) {
	return (await compileTsrxModulesWithInterfaces([{ filename, source }]))[0]!;
}

export async function compileAll(modules: ReadonlyArray<CompileInput>) {
	return compileTsrxModulesWithInterfaces(modules);
}

export function callRefusals(compiled: CompileTsrxModuleResult) {
	return collectTsrxModuleDiagnostics(compiled).filter(
		(item) => item.severity === 'error' && item.code === COMPUTED_READ_CALLED_CODE,
	);
}

export function errors(compiled: CompileTsrxModuleResult) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

export function servedSource(compiled: CompileTsrxModuleResult) {
	return compiled.publicRenderModule.ssrModuleSource ?? '';
}

/** The one `set(...)` line the served module emits for a factory cell. */
export function servedDeriveLine(compiled: CompileTsrxModuleResult, graphNodeId: string) {
	return servedSource(compiled)
		.split('\n')
		.find((line) => line.includes(`RenderStateValues.set(${JSON.stringify(graphNodeId)}`));
}

/** The browser module that re-derives one cell. */
export function clientDeriveModule(compiled: CompileTsrxModuleResult, graphNodeId: string) {
	const symbol = compiled.symbolResolver.symbols.find(
		(item) => item.kind === 'sync-computed-derive' && item.graphNodeId === graphNodeId,
	);
	return symbol
		? compiled.symbolModules.modules.find((module) => module.symbolId === symbol.id)?.source
		: undefined;
}
