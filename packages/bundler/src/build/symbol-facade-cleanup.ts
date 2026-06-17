import { dirname, join, normalize, relative } from 'pathe';
import { ARCADE_VIRTUAL_PREFIX } from '../transform.ts';

type GeneratedChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	code: string;
	exports: string[];
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	readonly facadeModuleId?: string | null;
};

type SymbolFacadeRewrite = {
	readonly facade: GeneratedChunk;
	readonly target: GeneratedChunk;
	readonly initExports: readonly string[];
};

const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const LOCAL_DYNAMIC_IMPORT_RE =
	/import\(\s*(["'`])([^"'`]+)\1\s*\)(?:\.then\(\s*\(?\s*([$A-Z_a-z][$\w]*)\s*\)?\s*=>\s*\3\.([$A-Z_a-z][$\w]*)\s*\))?/g;

export function rewriteGeneratedSymbolFacadeImports(
	bundle: Record<string, unknown>,
): ReadonlySet<string> {
	const chunks = collectChunks(bundle);
	const rewrites = findSymbolFacadeRewrites(chunks);
	const removedFacades = new Set<string>();
	if (rewrites.size === 0) return removedFacades;

	for (const chunk of chunks.values()) {
		if (!isGeneratedAsyncChunk(chunk)) continue;

		const result = rewriteDynamicImportSpecifiers(chunk, rewrites);
		chunk.code = result.code;
		chunk.dynamicImports = unique(
			chunk.dynamicImports.map((fileName) =>
				result.rewrittenFacades.has(fileName)
					? (rewrites.get(fileName)?.target.fileName ?? fileName)
					: fileName,
			),
		);
	}

	for (const rewrite of rewrites.values()) {
		const facadeId = rewrite.facade.facadeModuleId;
		if (facadeId && !rewrite.target.moduleIds.includes(facadeId)) {
			rewrite.target.moduleIds = [...rewrite.target.moduleIds, facadeId];
		}
	}

	for (const rewrite of rewrites.values()) {
		deleteBundleChunk(bundle, rewrite.facade.fileName);
		chunks.delete(rewrite.facade.fileName);
		removedFacades.add(rewrite.facade.fileName);
	}

	return removedFacades;
}

function collectChunks(bundle: Record<string, unknown>): Map<string, GeneratedChunk> {
	const chunks = new Map<string, GeneratedChunk>();
	for (const output of Object.values(bundle)) {
		if (isGeneratedChunk(output)) chunks.set(output.fileName, output);
	}
	return chunks;
}

function findSymbolFacadeRewrites(
	chunks: ReadonlyMap<string, GeneratedChunk>,
): Map<string, SymbolFacadeRewrite> {
	const rewrites = new Map<string, SymbolFacadeRewrite>();
	for (const chunk of chunks.values()) {
		const rewrite = findSymbolFacadeRewrite(chunk, chunks);
		if (rewrite) rewrites.set(chunk.fileName, rewrite);
	}
	return rewrites;
}

function findSymbolFacadeRewrite(
	chunk: GeneratedChunk,
	chunks: ReadonlyMap<string, GeneratedChunk>,
): SymbolFacadeRewrite | undefined {
	if (!isGeneratedSymbolFacade(chunk)) return undefined;
	if (chunk.imports.length !== 1 || chunk.dynamicImports.length > 0) return undefined;
	const parsed = parseSymbolFacade(chunk.code);
	if (!parsed) return undefined;

	const target = chunks.get(chunk.imports[0]!);
	if (!target) return undefined;
	const targetExports = new Set(target.exports);
	if (!chunk.exports.every((name) => targetExports.has(name))) return undefined;
	if (!parsed.initExports.every((name) => targetExports.has(name))) return undefined;
	return { facade: chunk, target, initExports: parsed.initExports };
}

function isGeneratedSymbolFacade(chunk: GeneratedChunk): boolean {
	const facadeModuleId = chunk.facadeModuleId ? normalizeVirtualId(chunk.facadeModuleId) : '';
	return facadeModuleId.startsWith(`${ARCADE_VIRTUAL_PREFIX}symbol:`);
}

function rewriteDynamicImportSpecifiers(
	chunk: GeneratedChunk,
	rewrites: ReadonlyMap<string, SymbolFacadeRewrite>,
): { readonly code: string; readonly rewrittenFacades: ReadonlySet<string> } {
	const rewrittenFacades = new Set<string>();
	const code = chunk.code.replace(
		LOCAL_DYNAMIC_IMPORT_RE,
		(
			match,
			quote: string,
			specifier: string,
			parameter: string | undefined,
			exportName: string | undefined,
		) => {
			if (!isLocalSpecifier(specifier)) return match;

			const importedFileName = resolveChunkSpecifier(chunk.fileName, specifier);
			const rewrite = rewrites.get(importedFileName);
			if (!rewrite) return match;
			if (rewrite.initExports.length > 0 && (!parameter || !exportName)) return match;

			const nextSpecifier = relativeChunkSpecifier(chunk.fileName, rewrite.target.fileName);
			rewrittenFacades.add(importedFileName);
			const nextImport = `import(${quote}${nextSpecifier}${quote})`;
			if (!parameter || !exportName || rewrite.initExports.length === 0) return nextImport;

			const initCalls = rewrite.initExports.map((name) => `${parameter}.${name}()`);
			return `${nextImport}.then(${parameter}=>(${[...initCalls, `${parameter}.${exportName}`].join(',')}))`;
		},
	);
	return { code, rewrittenFacades };
}

function resolveChunkSpecifier(importerFileName: string, specifier: string): string {
	return normalize(join(dirname(importerFileName), specifier));
}

function relativeChunkSpecifier(importerFileName: string, targetFileName: string): string {
	const value = relative(dirname(importerFileName), targetFileName).replaceAll('\\', '/');
	return value.startsWith('.') ? value : `./${value}`;
}

function isGeneratedAsyncChunk(chunk: GeneratedChunk): boolean {
	return chunk.moduleIds.some((id) => {
		const normalized = normalizeVirtualId(id);
		return normalized.startsWith(ARCADE_VIRTUAL_PREFIX) || TSRX_SOURCE_FILE.test(id);
	});
}

function deleteBundleChunk(bundle: Record<string, unknown>, fileName: string): void {
	for (const [key, output] of Object.entries(bundle)) {
		if (isGeneratedChunk(output) && output.fileName === fileName) {
			delete bundle[key];
		}
	}
}

function isGeneratedChunk(value: unknown): value is GeneratedChunk {
	if (!value || typeof value !== 'object') return false;
	const chunk = value as Partial<GeneratedChunk> & { readonly type?: unknown };
	return (
		chunk.type === 'chunk' &&
		typeof chunk.fileName === 'string' &&
		typeof chunk.code === 'string' &&
		Array.isArray(chunk.exports) &&
		Array.isArray(chunk.imports) &&
		Array.isArray(chunk.dynamicImports) &&
		Array.isArray(chunk.moduleIds)
	);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function isLocalSpecifier(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

function parseSymbolFacade(code: string): { readonly initExports: readonly string[] } | undefined {
	const match = code
		.trim()
		.match(
			/^import\s*\{\s*([^}]*)\s*\}\s*from\s*(["'`])([^"'`]+)\2\s*;\s*([\s\S]*?)\s*export\s*\{\s*([^}]*)\s*\}\s*;?\s*$/,
		);
	if (!match) return undefined;

	const imports = parseImportSpecifiers(match[1]!);
	const exportLocals = parseExportLocalNames(match[5]!);
	if (!imports || !exportLocals) return undefined;

	const body = match[4]!.trim();
	const initLocals = body
		? body
				.split(';')
				.map((statement) => statement.trim())
				.filter(Boolean)
				.map((statement) => statement.match(/^([$A-Z_a-z][$\w]*)\(\)$/)?.[1])
		: [];
	if (initLocals.some((name) => !name)) return undefined;

	for (const local of exportLocals) {
		if (!imports.has(local)) return undefined;
	}

	const initExports = unique(
		initLocals
			.filter((local): local is string => !!local)
			.map((local) => imports.get(local))
			.filter((name): name is string => !!name),
	);
	return { initExports };
}

function parseImportSpecifiers(value: string): Map<string, string> | undefined {
	const imports = new Map<string, string>();
	for (const part of value.split(',')) {
		const specifier = part.trim();
		if (!specifier) continue;
		const aliased = specifier.match(/^(.+?)\s+as\s+(.+)$/);
		const imported = (aliased?.[1] ?? specifier).trim();
		const local = (aliased?.[2] ?? specifier).trim();
		if (!isIdentifier(imported) || !isIdentifier(local)) return undefined;
		imports.set(local, imported);
	}
	return imports;
}

function parseExportLocalNames(value: string): string[] | undefined {
	const locals: string[] = [];
	for (const part of value.split(',')) {
		const specifier = part.trim();
		if (!specifier) continue;
		const aliased = specifier.match(/^(.+?)\s+as\s+(.+)$/);
		const local = (aliased?.[1] ?? specifier).trim();
		const exported = (aliased?.[2] ?? specifier).trim();
		if (!isIdentifier(local) || !isIdentifier(exported)) return undefined;
		locals.push(local);
	}
	return locals;
}

function isIdentifier(value: string): boolean {
	return /^[$A-Z_a-z][$\w]*$/.test(value);
}

function normalizeVirtualId(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}
