import type { CompileTsrxModuleResult, PlannedSymbol } from '../../src/index.ts';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

export async function compileOne(filename: string, source: string) {
	return (await compileTsrxModulesWithInterfaces([{ filename, source }]))[0]!;
}

export function errors(compiled: CompileTsrxModuleResult) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

export function said(compiled: CompileTsrxModuleResult) {
	return errors(compiled)
		.map((item) => `${item.code} ${item.message}`)
		.join('\n');
}

export function symbolModuleSource(
	compiled: CompileTsrxModuleResult,
	kind: PlannedSymbol['kind'],
) {
	const symbol = compiled.symbolResolver.symbols.find((item) => item.kind === kind);
	return symbol
		? compiled.symbolModules.modules.find((module) => module.symbolId === symbol.id)?.source
		: undefined;
}
