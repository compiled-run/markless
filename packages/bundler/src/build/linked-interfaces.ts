// A `.tsrx` that calls a sibling's state helper can only be compiled once that
// sibling's module graph interface is supplied, so every caller of the pipeline
// that compiles a module in isolation links its siblings through here first.
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'pathe';
import {
	compileTsrxModuleLinkArtifact,
	type ModuleGraphInterfaceArtifact,
} from '@markless/compiler';
import { moduleIdFor } from '../module-id.ts';
import { isRelativeImport as isRelative, pathname } from '../virtual-ids.ts';

const TSRX_MODULE = /\.tsrx$/;

export function isTsrxModule(file: string): boolean {
	return TSRX_MODULE.test(file);
}

// Resolves one of a module's own import specifiers, normally the build's
// `this.resolve`. `undefined` means "not ours" and the specifier is imported
// by Node instead.
export type DelegateSpecifierResolve = (
	specifier: string,
	importer: string,
) => Promise<string | undefined>;

export type LinkedModuleInterfaces = {
	interfaceFor(file: string, root: string | undefined): Promise<ModuleGraphInterfaceArtifact>;
	importedInterfacesFor(
		file: string,
		source: string,
		resolve: DelegateSpecifierResolve,
		root: string | undefined,
	): Promise<Record<string, ModuleGraphInterfaceArtifact>>;
	clear(): void;
};

export function createLinkedModuleInterfaces(): LinkedModuleInterfaces {
	let interfaces = new Map<string, Promise<ModuleGraphInterfaceArtifact>>();

	function interfaceFor(file: string, root: string | undefined) {
		const sourceFile = pathname(file);
		const known = interfaces.get(sourceFile);
		if (known) return known;
		const started = readFile(sourceFile, 'utf8').then(
			async (source) =>
				(
					await compileTsrxModuleLinkArtifact({
						filename: sourceFile,
						moduleId: moduleIdFor(sourceFile, root),
						source,
					})
				).moduleGraphInterface,
		);
		interfaces.set(sourceFile, started);
		return started;
	}

	return {
		interfaceFor,
		async importedInterfacesFor(file, source, resolve, root) {
			const linked = await compileTsrxModuleLinkArtifact({
				filename: file,
				moduleId: moduleIdFor(file, root),
				source,
			});
			return Object.fromEntries(
				(
					await Promise.all(
						linked.moduleImports
							.filter((moduleImport) => isTsrxModule(moduleImport.source))
							.map(async (moduleImport) => {
								const imported =
									(await resolve(moduleImport.source, file)) ??
									(isRelative(moduleImport.source)
										? join(dirname(pathname(file)), moduleImport.source)
										: undefined);
								if (!imported || !isAbsolute(pathname(imported))) return null;
								return [
									moduleImport.source,
									await interfaceFor(imported, root),
								] as const;
							}),
					)
				).filter((entry) => entry !== null),
			);
		},
		clear() {
			interfaces = new Map();
		},
	};
}
