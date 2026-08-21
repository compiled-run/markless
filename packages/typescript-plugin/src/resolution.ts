import { dirname, isAbsolute, resolve } from 'node:path';
import { isMarklessTsrxFile } from './language.ts';

/**
 * Teach a language-service host to resolve `.tsrx` module specifiers.
 *
 * TypeScript has no `.tsrx` in its supported-extension table - only `markless-tsc` gets that,
 * by patching the tsc command line - so `import './textbox.tsrx'` from a `.ts` file falls
 * through to the arbitrary-extension probe for `textbox.d.tsrx.ts`, which the Volar layer
 * answers only in a project that declares a TSRX compiler. This resolves the specifier to the
 * authored file directly and types it as the TSX the plugin serves for it, so a barrel
 * re-exports real components and a test driver imports a real default export, with no
 * declaration file anywhere and with nothing to declare in tsconfig.
 */
export function installMarklessTsrxModuleResolution(typescript: any, host: any): void {
	const resolveModuleNameLiterals = host.resolveModuleNameLiterals?.bind(host);
	const resolveModuleNames = host.resolveModuleNames?.bind(host);

	// TypeScript 5 hosts answer through resolveModuleNameLiterals; resolveModuleNames is the
	// pre-5.0 shape, still consulted by hosts that never moved. Whichever a host offers is
	// wrapped, and a host offering neither keeps TypeScript's built-in resolution.
	if (resolveModuleNameLiterals) {
		host.resolveModuleNameLiterals = (
			moduleLiterals: readonly { readonly text: string }[],
			containingFile: string,
			...rest: unknown[]
		) => {
			const resolved = resolveModuleNameLiterals(moduleLiterals, containingFile, ...rest);
			if (!moduleLiterals.some((literal) => isMarklessTsrxFile(literal.text))) return resolved;
			return moduleLiterals.map((literal, index) => {
				const resolvedModule = resolveMarklessTsrxModule(
					typescript,
					host,
					literal.text,
					containingFile,
				);
				return resolvedModule ? { resolvedModule } : resolved[index];
			});
		};
	}

	if (resolveModuleNames) {
		host.resolveModuleNames = (
			moduleNames: readonly string[],
			containingFile: string,
			...rest: unknown[]
		) => {
			const resolved = resolveModuleNames(moduleNames, containingFile, ...rest);
			if (!moduleNames.some((moduleName) => isMarklessTsrxFile(moduleName))) return resolved;
			return moduleNames.map(
				(moduleName, index) =>
					resolveMarklessTsrxModule(typescript, host, moduleName, containingFile) ??
					resolved[index],
			);
		};
	}
}

/**
 * The resolution for one `.tsrx` specifier, or undefined to leave it to the host.
 *
 * Only a path specifier is answered here. A bare package specifier goes through the host's own
 * resolver, which knows the package layout - exports, symlinks, workspace links - that a path
 * join cannot reconstruct.
 */
export function resolveMarklessTsrxModule(
	typescript: any,
	host: any,
	specifier: string,
	containingFile: string,
): { resolvedFileName: string; extension: string; isExternalLibraryImport: boolean } | undefined {
	if (!isMarklessTsrxFile(specifier)) return undefined;
	const fileName = marklessTsrxCandidate(specifier, containingFile);
	if (fileName === undefined) return undefined;
	const fileExists = host.fileExists?.bind(host) ?? typescript.sys.fileExists;
	if (!fileExists(fileName)) return undefined;
	// The extension is what TypeScript checks the module against, and the plugin serves this
	// file as TSX; naming the real extension here would make it an unloadable module instead.
	return {
		resolvedFileName: fileName,
		extension: typescript.Extension.Tsx,
		isExternalLibraryImport: false,
	};
}

function marklessTsrxCandidate(specifier: string, containingFile: string): string | undefined {
	if (isAbsolute(specifier)) return normalizeSeparators(specifier);
	if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined;
	return normalizeSeparators(resolve(dirname(containingFile), specifier));
}

// TypeScript identifies a file by a forward-slash path; a Windows join would name a
// second, unrelated file for the same module.
function normalizeSeparators(path: string): string {
	return path.replace(/\\/g, '/');
}
