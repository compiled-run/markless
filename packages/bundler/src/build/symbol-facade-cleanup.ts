import { dirname, join, normalize, relative } from 'pathe';
import { MARKLESS_VIRTUAL_PREFIX } from '../source-module.ts';

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

type SymbolInitExportRewrite = {
	readonly chunk: GeneratedChunk;
	readonly names: ReadonlyMap<string, string>;
	readonly collapsed?: {
		readonly code: string;
		readonly exports: readonly string[];
	};
};

type DirectSymbolLoaderBranch = {
	readonly symbolId: string;
	readonly importSpecifier: string;
	readonly moduleParameter: string;
	readonly helperName: string;
	readonly exportName: string;
};

const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const SYMBOL_INIT_EXPORT_PREFIX = 'init__virtual_markless_symbol';
const STRING_LITERAL_SOURCE =
	String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|` +
	'`[^`\\\\]*(?:\\\\.[^`\\\\]*)*`)';
const FUNCTION_DECLARATION_RE =
	/\bfunction\s+([$A-Z_a-z][$\w]*)\s*\(\s*([$A-Z_a-z][$\w]*)\s*\)\s*\{/g;
const LOCAL_DYNAMIC_IMPORT_HELPER_RE =
	/import\(\s*(["'`])([^"'`]+)\1\s*\)\.then\(\s*\(?\s*([$A-Z_a-z][$\w]*)\s*\)?\s*=>\s*([$A-Z_a-z][$\w]*)\(\s*\3\s*,\s*(["'`])([^"'`]*)\5\s*\)\s*\)/g;
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

export function rewriteGeneratedSymbolInitExports(bundle: Record<string, unknown>): {
	readonly renamed: number;
} {
	const chunks = collectChunks(bundle);
	const rewrites = findSymbolInitExportRewrites(chunks);
	if (rewrites.length === 0) return { renamed: 0 };

	const replacements = new Map<string, string>();
	for (const rewrite of rewrites) {
		rewrite.chunk.exports = rewrite.collapsed
			? [...rewrite.collapsed.exports]
			: rewrite.chunk.exports.map((name) => rewrite.names.get(name) ?? name);
		if (rewrite.collapsed) rewrite.chunk.code = rewrite.collapsed.code;
		for (const [from, to] of rewrite.names) {
			replacements.set(from, to);
		}
	}

	for (const chunk of chunks.values()) {
		if (!isGeneratedAsyncChunk(chunk)) continue;
		chunk.code = replaceIdentifierNames(chunk.code, replacements);
	}

	return { renamed: replacements.size };
}

export function compactGeneratedDirectSymbolLoaders(bundle: Record<string, unknown>): {
	readonly compacted: number;
} {
	let compacted = 0;
	for (const chunk of collectChunks(bundle).values()) {
		if (!isGeneratedAsyncChunk(chunk)) continue;
		if (!chunk.code.includes('?import(')) continue;

		const result = compactDirectSymbolLoadersInCode(chunk.code);
		if (result.compacted === 0) continue;

		chunk.code = result.code;
		compacted += result.compacted;
	}
	return { compacted };
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

function findSymbolInitExportRewrites(
	chunks: ReadonlyMap<string, GeneratedChunk>,
): SymbolInitExportRewrite[] {
	const rewrites: SymbolInitExportRewrite[] = [];
	for (const chunk of chunks.values()) {
		const rewrite = findSymbolInitExportRewrite(chunk);
		if (rewrite) rewrites.push(rewrite);
	}
	return rewrites;
}

function findSymbolInitExportRewrite(chunk: GeneratedChunk): SymbolInitExportRewrite | undefined {
	if (!isGeneratedAsyncChunk(chunk)) return undefined;

	const initExports = chunk.exports.filter(isGeneratedSymbolInitExport);
	if (initExports.length === 0) return undefined;

	const names = new Map<string, string>();
	const used = new Set(chunk.exports.filter((name) => !isGeneratedSymbolInitExport(name)));
	const collapsed = collapseGeneratedSymbolInitExports(chunk.code, initExports);
	if (collapsed) {
		for (const name of initExports) {
			if (name !== SYMBOL_INIT_EXPORT_PREFIX) names.set(name, SYMBOL_INIT_EXPORT_PREFIX);
		}
		return { chunk, names, collapsed };
	}

	for (const name of initExports) {
		const next = compactSymbolInitExportName(name, used);
		used.add(next);
		if (next !== name) names.set(name, next);
	}

	return names.size > 0 ? { chunk, names } : undefined;
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
	return facadeModuleId.startsWith(`${MARKLESS_VIRTUAL_PREFIX}symbol:`);
}

function isGeneratedSymbolInitExport(name: string): boolean {
	return (
		name === SYMBOL_INIT_EXPORT_PREFIX ||
		name.startsWith(`${SYMBOL_INIT_EXPORT_PREFIX}_`) ||
		/^\$\d+$/.test(name.slice(SYMBOL_INIT_EXPORT_PREFIX.length))
	);
}

function compactSymbolInitExportName(name: string, used: ReadonlySet<string>): string {
	const suffix = name.match(/\$(\d+)$/)?.[1];
	let candidate = suffix ? `${SYMBOL_INIT_EXPORT_PREFIX}$${suffix}` : SYMBOL_INIT_EXPORT_PREFIX;
	let nextSuffix = suffix ? Number(suffix) : 0;
	while (used.has(candidate)) {
		nextSuffix++;
		candidate = `${SYMBOL_INIT_EXPORT_PREFIX}$${nextSuffix}`;
	}
	return candidate;
}

function collapseGeneratedSymbolInitExports(
	code: string,
	initExports: readonly string[],
): { readonly code: string; readonly exports: readonly string[] } | undefined {
	if (initExports.length < 2) return undefined;
	const match = code.match(/export\s*\{\s*([^}]*)\s*\}\s*;?\s*$/);
	if (!match || match.index === undefined) return undefined;

	const specifiers = parseExportSpecifiers(match[1]!);
	if (!specifiers) return undefined;
	if (specifiers.some((specifier) => !isIdentifier(specifier.local))) return undefined;
	const initExportSet = new Set(initExports);
	const initLocals = unique(
		specifiers
			.filter((specifier) => initExportSet.has(specifier.exported))
			.map((specifier) => specifier.local),
	);
	if (initLocals.length < 2) return undefined;

	const nonInitSpecifiers = specifiers.filter(
		(specifier) => !initExportSet.has(specifier.exported),
	);
	if (nonInitSpecifiers.some((specifier) => specifier.exported === SYMBOL_INIT_EXPORT_PREFIX)) {
		return undefined;
	}

	const initLocal = uniqueIdentifier('$i', code);
	const beforeExport = code.slice(0, match.index);
	const initCallSource = initLocals.map((local) => `${local}()`).join(';');
	const nextExports = [
		`${initLocal} as ${SYMBOL_INIT_EXPORT_PREFIX}`,
		...nonInitSpecifiers.map(formatExportSpecifier),
	];

	return {
		code: `${beforeExport}function ${initLocal}(){${initCallSource}}export{${nextExports.join(',')}};`,
		exports: [
			SYMBOL_INIT_EXPORT_PREFIX,
			...nonInitSpecifiers.map((specifier) => specifier.exported),
		],
	};
}

function rewriteDynamicImportSpecifiers(
	chunk: GeneratedChunk,
	rewrites: ReadonlyMap<string, SymbolFacadeRewrite>,
): { readonly code: string; readonly rewrittenFacades: ReadonlySet<string> } {
	const rewrittenFacades = new Set<string>();
	const helperCode = chunk.code.replace(
		LOCAL_DYNAMIC_IMPORT_HELPER_RE,
		(
			match,
			quote: string,
			specifier: string,
			parameter: string,
			helperName: string,
			exportQuote: string,
			exportName: string,
		) => {
			if (!isLocalSpecifier(specifier)) return match;

			const importedFileName = resolveChunkSpecifier(chunk.fileName, specifier);
			const rewrite = rewrites.get(importedFileName);
			if (!rewrite) return match;
			if (!rewrite.target.exports.includes(exportName)) return match;

			const nextSpecifier = relativeChunkSpecifier(chunk.fileName, rewrite.target.fileName);
			rewrittenFacades.add(importedFileName);
			return `import(${quote}${nextSpecifier}${quote}).then(${parameter}=>${helperName}(${parameter},${exportQuote}${exportName}${exportQuote}))`;
		},
	);
	const code = helperCode.replace(
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

function compactDirectSymbolLoadersInCode(code: string): {
	readonly code: string;
	readonly compacted: number;
} {
	let next = '';
	let cursor = 0;
	let compacted = 0;

	for (
		let match = FUNCTION_DECLARATION_RE.exec(code);
		match;
		match = FUNCTION_DECLARATION_RE.exec(code)
	) {
		const functionStart = match.index;
		const bodyStart = FUNCTION_DECLARATION_RE.lastIndex;
		const bodyEnd = findBlockEnd(code, bodyStart - 1);
		if (bodyEnd < 0) continue;

		const body = code.slice(bodyStart, bodyEnd);
		const mapName = uniqueIdentifier('$s', `${code}${next}`);
		const moduleCacheName = uniqueIdentifier('$m', `${code}${next}${mapName}`);
		const replacement = compactDirectSymbolLoaderFunction({
			functionName: match[1]!,
			parameterName: match[2]!,
			body,
			mapName,
			moduleCacheName,
		});
		if (!replacement) {
			FUNCTION_DECLARATION_RE.lastIndex = bodyEnd + 1;
			continue;
		}

		next += code.slice(cursor, functionStart);
		next += replacement;
		cursor = bodyEnd + 1;
		compacted++;
		FUNCTION_DECLARATION_RE.lastIndex = cursor;
	}

	if (compacted === 0) return { code, compacted };
	return { code: next + code.slice(cursor), compacted };
}

function compactDirectSymbolLoaderFunction(input: {
	readonly functionName: string;
	readonly parameterName: string;
	readonly body: string;
	readonly mapName: string;
	readonly moduleCacheName: string;
}): string | undefined {
	const returnSource = input.body.trim();
	if (!returnSource.startsWith('return ')) return undefined;

	const parsed = parseDirectSymbolLoaderBranches(
		returnSource.slice('return '.length),
		input.parameterName,
	);
	if (!parsed) return undefined;

	const first = parsed.branches[0]!;
	if (
		parsed.branches.some(
			(branch) =>
				branch.importSpecifier !== first.importSpecifier ||
				branch.helperName !== first.helperName,
		)
	) {
		return undefined;
	}

	const generatedCount = generatedSymbolRangeCount(parsed.branches);
	if (generatedCount !== undefined) {
		return [
			`let ${input.moduleCacheName};`,
			`function ${input.functionName}(${input.parameterName}){`,
			`let t=+${input.parameterName}.slice(7);`,
			`if(${input.parameterName}===\`symbol:${'${t}'}\`&&t>=0&&t<${generatedCount}){`,
			`if(${input.moduleCacheName})return ${first.helperName}(${input.moduleCacheName},\`symbol_${'${t}'}\`);`,
			`return import(${JSON.stringify(first.importSpecifier)})`,
			`.then(${first.moduleParameter}=>(${input.moduleCacheName}=${first.moduleParameter},${first.helperName}(${first.moduleParameter},\`symbol_${'${t}'}\`)))`,
			`}`,
			`return ${parsed.fallback}`,
			'}',
		].join('');
	}

	const exportVariable = input.parameterName === 't' ? 'n' : 't';
	const mapEntries = parsed.branches
		.map((branch) => `${JSON.stringify(branch.symbolId)}:${JSON.stringify(branch.exportName)}`)
		.join(',');
	return [
		`const ${input.mapName}={${mapEntries}};`,
		`let ${input.moduleCacheName};`,
		`function ${input.functionName}(${input.parameterName}){`,
		`let ${exportVariable}=${input.mapName}[${input.parameterName}];`,
		`if(${exportVariable}){`,
		`if(${input.moduleCacheName})return ${first.helperName}(${input.moduleCacheName},${exportVariable});`,
		`return import(${JSON.stringify(first.importSpecifier)})`,
		`.then(${first.moduleParameter}=>(${input.moduleCacheName}=${first.moduleParameter},${first.helperName}(${first.moduleParameter},${exportVariable})))`,
		`}`,
		`return ${parsed.fallback}`,
		'}',
	].join('');
}

function parseDirectSymbolLoaderBranches(
	source: string,
	parameterName: string,
):
	| {
			readonly branches: readonly DirectSymbolLoaderBranch[];
			readonly fallback: string;
	  }
	| undefined {
	const branches: DirectSymbolLoaderBranch[] = [];
	const branchRE = directSymbolLoaderBranchRE(parameterName);
	let cursor = 0;

	while (cursor < source.length) {
		const match = source.slice(cursor).match(branchRE);
		if (!match) break;

		const symbolId = simpleStringLiteralValue(match[1]!);
		const importSpecifier = simpleStringLiteralValue(match[2]!);
		const moduleParameter = match[3]!;
		const helperName = match[4]!;
		const helperArgument = match[5]!;
		const exportName = simpleStringLiteralValue(match[6]!);
		if (
			symbolId === undefined ||
			importSpecifier === undefined ||
			exportName === undefined ||
			moduleParameter !== helperArgument
		) {
			return undefined;
		}

		branches.push({
			symbolId,
			importSpecifier,
			moduleParameter,
			helperName,
			exportName,
		});
		cursor += match[0]!.length;
	}

	const fallback = source.slice(cursor);
	if (branches.length < 2 || !fallback.startsWith('Promise.reject(')) return undefined;
	return { branches, fallback };
}

function generatedSymbolRangeCount(
	branches: readonly DirectSymbolLoaderBranch[],
): number | undefined {
	for (const [index, branch] of branches.entries()) {
		if (branch.symbolId !== `symbol:${index}` || branch.exportName !== `symbol_${index}`) {
			return undefined;
		}
	}
	return branches.length;
}

function directSymbolLoaderBranchRE(parameterName: string): RegExp {
	return new RegExp(
		`^${escapeRegExp(parameterName)}\\s*===\\s*(${STRING_LITERAL_SOURCE})\\s*\\?\\s*` +
			`import\\(\\s*(${STRING_LITERAL_SOURCE})\\s*\\)\\.then\\(\\s*\\(?\\s*` +
			`([$A-Z_a-z][$\\w]*)\\s*\\)?\\s*=>\\s*([$A-Z_a-z][$\\w]*)\\(\\s*` +
			`([$A-Z_a-z][$\\w]*)\\s*,\\s*(${STRING_LITERAL_SOURCE})\\s*\\)\\s*\\)\\s*:`,
	);
}

function simpleStringLiteralValue(source: string): string | undefined {
	const quote = source[0];
	if ((quote !== '"' && quote !== "'" && quote !== '`') || source[source.length - 1] !== quote) {
		return undefined;
	}
	return source.slice(1, -1);
}

function findBlockEnd(code: string, open: number): number {
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;

	for (let index = open; index < code.length; index++) {
		const char = code[index]!;
		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '{') {
			depth++;
			continue;
		}
		if (char === '}') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
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
		return normalized.startsWith(MARKLESS_VIRTUAL_PREFIX) || TSRX_SOURCE_FILE.test(id);
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

function replaceIdentifierNames(code: string, replacements: ReadonlyMap<string, string>): string {
	const names = [...replacements.keys()].sort((a, b) => b.length - a.length);
	let next = code;
	for (const name of names) {
		next = next.replace(identifierNameRE(name), replacements.get(name)!);
	}
	return next;
}

function identifierNameRE(name: string): RegExp {
	return new RegExp(`(?<![$\\w])${escapeRegExp(name)}(?![$\\w])`, 'g');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function parseExportSpecifiers(
	value: string,
): Array<{ readonly local: string; readonly exported: string }> | undefined {
	const specifiers: Array<{ readonly local: string; readonly exported: string }> = [];
	for (const part of value.split(',')) {
		const specifier = part.trim();
		if (!specifier) continue;
		const aliased = specifier.match(/^(.+?)\s+as\s+(.+)$/);
		const local = (aliased?.[1] ?? specifier).trim();
		const exported = (aliased?.[2] ?? specifier).trim();
		if (!isIdentifier(local) || !isIdentifier(exported)) return undefined;
		specifiers.push({ local, exported });
	}
	return specifiers;
}

function formatExportSpecifier(specifier: { readonly local: string; readonly exported: string }) {
	return specifier.local === specifier.exported
		? specifier.local
		: `${specifier.local} as ${specifier.exported}`;
}

function uniqueIdentifier(base: string, code: string): string {
	let candidate = base;
	let index = 0;
	while (identifierNameRE(candidate).test(code)) {
		index++;
		candidate = `${base}${index}`;
	}
	return candidate;
}

function isIdentifier(value: string): boolean {
	return /^[$A-Z_a-z][$\w]*$/.test(value);
}

function normalizeVirtualId(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}
