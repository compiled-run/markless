import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	buildSemanticGraph,
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	type SemanticGraphArtifact,
	type CompilerDiagnostic,
	type NativeViewArtifact,
	type ModuleGraphInterfaceArtifact,
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
	// The pass names each module it needs and has no analysis of; analyze those and build again until none is missing.
	const graphs = new Map<string, SemanticGraphArtifact>([
		[input.filename, compiled.semanticGraph],
	]);
	const read = new Map<string, { readonly filename: string; readonly source: string }>();
	const resolve = (specifier: string, importer: string): string | undefined => {
		const module = input.readModule?.(specifier, importer);
		if (module) read.set(module.filename, module);
		return module?.filename;
	};
	// A module is analyzed with the interfaces of the modules it imports, as the web build links them, so a shared()
	// definition from another file (`toolbarState()` in toggle) resolves to the same definition there.
	const interfaces = new Map<string, SemanticGraphArtifact>();
	const analyze = async (file: string, visiting: Set<string>): Promise<SemanticGraphArtifact> => {
		const known = interfaces.get(file) ?? graphs.get(file);
		if (known) return known;
		const module = read.get(file)!;
		const importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact> = {};
		const plain = await buildSemanticGraph({ ...module, nativeFacts: NATIVE_FACT_COLLECTORS });
		visiting.add(file);
		for (const entry of plain.moduleImports) {
			if (entry.typeOnly || !entry.source.startsWith('.')) continue;
			const dependency = resolve(entry.source, file);
			if (dependency === undefined || visiting.has(dependency)) continue;
			importedModuleInterfaces[entry.source] = (
				await analyze(dependency, visiting)
			).moduleGraphInterface;
		}
		const graph =
			Object.keys(importedModuleInterfaces).length === 0
				? plain
				: await buildSemanticGraph({
						...module,
						nativeFacts: NATIVE_FACT_COLLECTORS,
						importedModuleInterfaces,
					});
		interfaces.set(file, graph);
		return graph;
	};
	let native: NativeViewArtifact;
	for (;;) {
		native = createNativeViewPayload(compiled.semanticGraph, {
			...(route
				? {
						route: {
							pattern: route.pattern,
							params: route.params.map((param) => param.name),
						},
					}
				: {}),
			modules: { graphs, resolve },
		});
		const missing = (native.missingModules ?? []).filter((file) => !graphs.has(file));
		if (missing.length === 0) break;
		for (const file of missing) graphs.set(file, await analyze(file, new Set()));
	}
	const errors = collectTsrxModuleDiagnostics(compiled).filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
	return {
		payload: errors.length > 0 ? null : native.payload,
		styles: compiled.publicRenderPlan.styleScopes,
		diagnostics: [...errors, ...native.diagnostics],
	};
}
