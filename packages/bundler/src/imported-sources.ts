import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ImportedModuleSources } from '@markless/compiler';
import { dirname, resolve } from 'pathe';
import { pathname } from './virtual-ids.ts';

type ImportedSource = { readonly filename: string; readonly source: string };

export type ImportedSourceReader = (
	importer: string,
	specifier: string,
) => Promise<ImportedSource | null>;

const READABLE_MODULE = /\.(?:[cm]?[jt]sx?|tsrx)$/;

/** Reads the module `specifier` names from `importer`, resolved as the build resolves it; null when there is no file to read. */
export function importedSourceReader(
	resolve: (specifier: string, importer: string) => Promise<string | null | undefined>,
	watch?: (filename: string) => void,
): ImportedSourceReader {
	return async (importer, specifier) => {
		let id: string | null | undefined;
		try {
			id = await resolve(specifier, importer);
		} catch {
			return null;
		}
		if (!id || id.startsWith('\0')) return null;
		const filename = pathname(id);
		if (
			!READABLE_MODULE.test(filename) ||
			!existsSync(filename) ||
			!statSync(filename).isFile()
		)
			return null;
		watch?.(filename);
		return { filename, source: readFileSync(filename, 'utf8') };
	};
}

const RELATIVE_CANDIDATES = [
	'',
	'.ts',
	'.tsx',
	'.mts',
	'.js',
	'.mjs',
	'.tsrx',
	'/index.ts',
	'/index.js',
];

// Without a host resolver, a relative import is read from disk; anything else stays unseen.
export const relativeImportedSourceReader: ImportedSourceReader = importedSourceReader(
	async (specifier, importer) => {
		if (!specifier.startsWith('.')) return null;
		const base = resolve(dirname(pathname(importer)), specifier);
		const candidates = RELATIVE_CANDIDATES.map((suffix) => base + suffix);
		if (base.endsWith('.js')) candidates.push(`${base.slice(0, -3)}.ts`);
		return (
			candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ??
			null
		);
	},
);

// A helper edited under an unchanged importer changes what the importer's handler check concludes.
export function importedSourcesUnchanged(sources: ImportedModuleSources | undefined): boolean {
	for (const bySpecifier of Object.values(sources ?? {}))
		for (const entry of Object.values(bySpecifier)) {
			if (!entry) continue;
			try {
				if (readFileSync(entry.filename, 'utf8') !== entry.source) return false;
			} catch {
				return false;
			}
		}
	return true;
}
