// Executes a source-shipped delegate during `vite build`, where there is no dev
// server module runner to borrow. Node refuses to type-strip under node_modules,
// so such a dependency has no `import()` route at all: it is compiled here
// through the pipeline's own two entry points and evaluated in process against
// Vite's module-runner protocol.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join } from 'pathe';
import { moduleRunnerTransform } from 'vite';
import {
	compileTsrxModuleLinkArtifact,
	type ModuleGraphInterfaceArtifact,
} from '@markless/compiler';
import {
	ESModulesEvaluator,
	createNodeImportMeta,
	ssrDynamicImportKey,
	ssrExportAllKey,
	ssrExportNameKey,
	ssrImportKey,
	ssrImportMetaKey,
	ssrModuleExportsKey,
	type ModuleRunnerContext,
} from 'vite/module-runner';
import {
	marklessVirtualModuleSourceFile,
	stripEmittedTypes,
	transformTsrxModule,
} from '../transform.ts';
import { moduleIdFor } from '../module-id.ts';
import { isRelativeImport as isRelative, normalizeVirtualId, pathname } from '../virtual-ids.ts';

// Every extension whose file is authored source rather than runnable JavaScript.
const SOURCE_MODULE = /\.(?:m|c)?tsx?$|\.tsrx$/;
const TSRX_MODULE = /\.tsrx$/;

// Resolves one of a delegate's own import specifiers, normally the build's
// `this.resolve`. `undefined` means "not ours" and the specifier is imported
// by Node instead.
export type DelegateSpecifierResolve = (
	specifier: string,
	importer: string,
) => Promise<string | undefined>;

export type BuildDelegateLoader = {
	load(source: string, resolve: DelegateSpecifierResolve, root?: string): Promise<unknown>;
	clear(): void;
};

// Apps depend on @markless/core alone, so the render catalog generated code
// imports is answered from the bundler's own dependency on @markless/web.
export function marklessRuntimeSpecifierId(specifier: string): string | undefined {
	if (specifier.startsWith('@markless/web/fns/')) {
		const resolved = import.meta.resolve?.(specifier);
		return resolved?.startsWith('file://')
			? decodeURIComponent(resolved.slice('file://'.length))
			: undefined;
	}
	if (specifier.startsWith('@markless/web/inline/')) {
		const root = import.meta.resolve?.('@markless/web');
		if (!root?.startsWith('file://') || !root.endsWith('/index.ts')) return undefined;
		return decodeURIComponent(
			root.slice('file://'.length, -'index.ts'.length) +
				`${specifier.slice('@markless/web/'.length)}.ts`,
		);
	}
	return undefined;
}

export function createBuildDelegateLoader(): BuildDelegateLoader {
	const evaluator = new ESModulesEvaluator();
	// Compiling one `.tsrx` mints the sibling modules its code imports; they have
	// no file behind them, so their code is kept here rather than read back.
	let virtualSources = new Map<string, string>();
	let graph = new Map<string, Promise<Record<string, unknown>>>();
	let interfaces = new Map<string, Promise<ModuleGraphInterfaceArtifact>>();

	function moduleInterface(file: string, root: string | undefined) {
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

	async function resolvedSource(
		specifier: string,
		importer: string,
		resolve: DelegateSpecifierResolve,
	) {
		return (
			(await resolve(specifier, importer)) ??
			(isRelative(specifier) ? join(dirname(pathname(importer)), specifier) : undefined)
		);
	}

	async function moduleCode(
		id: string,
		resolve: DelegateSpecifierResolve,
		root: string | undefined,
	): Promise<string> {
		const virtual = virtualSources.get(normalizeVirtualId(id));
		if (virtual !== undefined) return virtual;
		const file = pathname(id);
		const source = await readFile(file, 'utf8');
		if (!TSRX_MODULE.test(file)) return await stripEmittedTypes(source, file);
		const linked = await compileTsrxModuleLinkArtifact({
			filename: file,
			moduleId: moduleIdFor(file, root),
			source,
		});
		const importedModuleInterfaces = Object.fromEntries(
			(
				await Promise.all(
					linked.moduleImports
						.filter((moduleImport) => TSRX_MODULE.test(moduleImport.source))
						.map(async (moduleImport) => {
							const imported = await resolvedSource(
								moduleImport.source,
								file,
								resolve,
							);
							if (!imported || !isAbsolute(pathname(imported))) return null;
							return [
								moduleImport.source,
								await moduleInterface(imported, root),
							] as const;
						}),
				)
			).filter((entry) => entry !== null),
		);
		const transformed = await transformTsrxModule({
			filename: file,
			moduleId: moduleIdFor(file, root),
			source,
			environment: 'server',
			importedModuleInterfaces,
		});
		for (const module of transformed.virtualModules) {
			virtualSources.set(normalizeVirtualId(module.id), module.source);
		}
		return transformed.code;
	}

	async function importSpecifier(
		specifier: string,
		importer: string,
		resolve: DelegateSpecifierResolve,
		root: string | undefined,
	): Promise<unknown> {
		const virtualId = normalizeVirtualId(specifier);
		const virtualOwner = marklessVirtualModuleSourceFile(virtualId, root);
		if (virtualOwner) {
			// A sibling minted by a module this loader has not compiled yet: compile
			// the owner first, which is what registers the sibling's code.
			if (!virtualSources.has(virtualId)) await load(virtualOwner, resolve, root);
			return await load(virtualId, resolve, root);
		}
		const runtimeId = marklessRuntimeSpecifierId(specifier);
		const resolved = runtimeId ?? (await resolvedSource(specifier, importer, resolve));
		if (resolved === undefined) return await import(specifier);
		if (!isAbsolute(pathname(resolved))) return await import(resolved);
		return SOURCE_MODULE.test(pathname(resolved))
			? await load(resolved, resolve, root)
			: await import(pathToFileURL(pathname(resolved)).href);
	}

	async function evaluate(
		id: string,
		resolve: DelegateSpecifierResolve,
		root: string | undefined,
	): Promise<Record<string, unknown>> {
		const code = await moduleCode(id, resolve, root);
		const file = pathname(id);
		const transformed = await moduleRunnerTransform(code, null, file, code);
		const exports: Record<string, unknown> = Object.create(null);
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const request = (dep: string) => importSpecifier(dep, file, resolve, root);
		const context: ModuleRunnerContext = {
			[ssrModuleExportsKey]: exports,
			[ssrImportKey]: request,
			[ssrDynamicImportKey]: (dep: string) => request(String(dep)),
			[ssrExportAllKey]: (module: unknown) => exportAll(exports, module),
			[ssrExportNameKey]: (name: string, getter: () => unknown) =>
				Object.defineProperty(exports, name, {
					enumerable: true,
					configurable: true,
					get: getter,
				}),
			[ssrImportMetaKey]: createNodeImportMeta(file),
		};
		await evaluator.runInlinedModule(context, transformed?.code ?? code);
		return exports;
	}

	function load(id: string, resolve: DelegateSpecifierResolve, root: string | undefined) {
		const running = graph.get(id);
		if (running) return running;
		const started = evaluate(id, resolve, root);
		graph.set(id, started);
		return started;
	}

	return {
		load(source, resolve, root) {
			return load(source, resolve, root);
		},
		clear() {
			graph = new Map();
			virtualSources = new Map();
			interfaces = new Map();
		},
	};
}

function exportAll(exports: Record<string, unknown>, module: unknown): void {
	if (exports === module || module === null || typeof module !== 'object') return;
	for (const key in module) {
		if (key === 'default' || key === '__esModule' || key in exports) continue;
		Object.defineProperty(exports, key, {
			enumerable: true,
			configurable: true,
			get: () => (module as Record<string, unknown>)[key],
		});
	}
}
