import { dirname, join, normalize, relative } from 'pathe';
import {
	chunkDynamicImports,
	mayContainDynamicImport,
	parseChunkCode,
	spansAnyOffset,
	textOffsets,
} from './chunk-ast.ts';

type Chunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	code: string;
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	exports: string[];
	readonly isEntry?: boolean;
	readonly facadeModuleId?: string | null;
};
type Syntax = { type?: string; start: number; end: number; [key: string]: unknown };
type Facade = {
	readonly target: Chunk;
	readonly calls: readonly string[];
	readonly exports: ReadonlyMap<string, string>;
};
type Key = { readonly node: Syntax; readonly name: string; readonly shorthand: boolean };
type Site = { readonly node: Syntax; readonly facade: string; readonly keys: readonly Key[] };
type Edit = { readonly start: number; readonly end: number; readonly text: string };

/**
 * A dynamic-import entry whose module lives in a shared chunk is emitted as a
 * facade chunk that only runs the module's lazy init and re-exports from the
 * shared chunk. When every request for the facade destructures named exports
 * straight off the awaited import, the request can go to the shared chunk and
 * run the init itself: the reader loses a chunk fetch and a waterfall hop, and
 * no consumer can observe the namespace object it no longer receives.
 */
export function collapseInitFacadeImports(bundle: Record<string, unknown>): ReadonlySet<string> {
	const chunks = new Map<string, Chunk>();
	for (const output of Object.values(bundle))
		if (isChunk(output)) chunks.set(output.fileName, output);
	const staticallyImported = new Set([...chunks.values()].flatMap((chunk) => chunk.imports));
	const facades = new Map<string, Facade | undefined>();
	const sites = new Map<Chunk, Site[]>();
	const refused = new Set<string>();
	const facadeAt = (fileName: string) => {
		if (!facades.has(fileName))
			facades.set(fileName, readFacade(chunks.get(fileName), chunks, staticallyImported));
		return facades.get(fileName);
	};
	for (const chunk of chunks.values()) {
		// The tree is only needed to read how a facade's request is destructured.
		const recorded = mayContainDynamicImport(chunk.code)
			? chunkDynamicImports(chunk.fileName, chunk.code)
			: undefined;
		if (recorded) {
			const resolved = new Set<string>();
			let reachesFacade = false;
			for (const { specifier } of recorded) {
				if (!specifier?.startsWith('.')) continue;
				const fileName = normalize(join(dirname(chunk.fileName), specifier));
				resolved.add(fileName);
				if (facadeAt(fileName)) reachesFacade = true;
			}
			if (!reachesFacade) {
				for (const target of chunk.dynamicImports)
					if (!resolved.has(target)) refused.add(target);
				continue;
			}
		}
		const program = mayContainDynamicImport(chunk.code)
			? parse(chunk.fileName, chunk.code)
			: undefined;
		if (!program) {
			for (const target of chunk.dynamicImports) refused.add(target);
			continue;
		}
		const found: Site[] = [];
		const resolved = new Set<string>();
		walk(program, [], textOffsets(chunk.code, 'import'), (node, parents) => {
			if (node.type !== 'ImportExpression') return;
			const specifier = importSource(node);
			if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
			const fileName = normalize(join(dirname(chunk.fileName), specifier));
			resolved.add(fileName);
			const facade = facadeAt(fileName);
			if (!facade) return;
			const keys = destructuredKeys(node, parents);
			if (
				node.options ||
				facade.target === chunk ||
				!keys ||
				keys.some((key) => !facade.exports.has(key.name))
			)
				refused.add(fileName);
			else found.push({ node, facade: fileName, keys });
		});
		for (const target of chunk.dynamicImports) if (!resolved.has(target)) refused.add(target);
		if (found.length) sites.set(chunk, found);
	}

	const removed = new Set<string>();
	for (const [fileName, facade] of facades)
		if (facade && !refused.has(fileName)) removed.add(fileName);
	if (removed.size === 0) return removed;

	for (const [chunk, found] of sites) {
		const edits = found.filter((site) => removed.has(site.facade));
		if (edits.length === 0) continue;
		const changes: Edit[] = [];
		for (const { node, facade: fileName, keys } of edits) {
			const facade = facades.get(fileName)!;
			changes.push({
				start: node.start,
				end: node.end,
				text: requestSource(chunk, facade, keys),
			});
			for (const key of keys) {
				const exported = propertyKey(facade.exports.get(key.name)!);
				changes.push(
					key.shorthand
						? { start: key.node.start, end: key.node.start, text: `${exported}:` }
						: { start: key.node.start, end: key.node.end, text: exported },
				);
			}
		}
		let code = chunk.code;
		for (const change of changes.sort((a, b) => b.start - a.start))
			code = code.slice(0, change.start) + change.text + code.slice(change.end);
		chunk.code = code;
		chunk.dynamicImports = [
			...new Set(
				chunk.dynamicImports.map((name) =>
					removed.has(name) ? facades.get(name)!.target.fileName : name,
				),
			),
		];
	}
	for (const fileName of removed) {
		const facade = facades.get(fileName)!;
		const original = chunks.get(fileName)!;
		if (original.facadeModuleId && !facade.target.moduleIds.includes(original.facadeModuleId))
			facade.target.moduleIds.push(original.facadeModuleId);
	}
	for (const [key, output] of Object.entries(bundle))
		if (isChunk(output) && removed.has(output.fileName)) delete bundle[key];
	return removed;
}

// Getters over the target's live bindings, and only the ones destructured: handing on
// the whole namespace would let the preload-helper removal see reads it cannot rule out.
function requestSource(importer: Chunk, facade: Facade, keys: readonly Key[]): string {
	const path = relative(dirname(importer.fileName), facade.target.fileName);
	const member = (name: string) =>
		IDENTIFIER.test(name) ? `m.${name}` : `m[${JSON.stringify(name)}]`;
	const calls = facade.calls.map((name) => `${member(name)}(),`).join('');
	const getters = [...new Set(keys.map((key) => facade.exports.get(key.name)!))]
		.map((name) => `get ${propertyKey(name)}(){return ${member(name)}}`)
		.join(',');
	return `import(${JSON.stringify(path.startsWith('.') ? path : `./${path}`)}).then(m=>(${calls}{${getters}}))`;
}

const IDENTIFIER = /^[$A-Z_a-z][$\w]*$/;

function propertyKey(name: string): string {
	return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

// `let{a:x}=await import(...)`: the only reads are the named ones, taken at once.
function destructuredKeys(node: Syntax, parents: readonly Syntax[]): Key[] | undefined {
	const awaited = parents.at(-1);
	const declarator = parents.at(-2);
	const pattern = declarator?.id as Syntax | undefined;
	if (
		awaited?.type !== 'AwaitExpression' ||
		awaited.argument !== node ||
		declarator?.type !== 'VariableDeclarator' ||
		declarator.init !== awaited ||
		pattern?.type !== 'ObjectPattern'
	)
		return undefined;
	const keys: Key[] = [];
	for (const property of pattern.properties as Syntax[]) {
		if (property.type !== 'Property' || property.computed) return undefined;
		const key = property.key as Syntax;
		const name = propertyName(key);
		if (name === undefined) return undefined;
		keys.push({ node: key, name, shorthand: property.shorthand === true });
	}
	return keys;
}

function readFacade(
	chunk: Chunk | undefined,
	chunks: ReadonlyMap<string, Chunk>,
	staticallyImported: ReadonlySet<string>,
): Facade | undefined {
	if (
		!chunk ||
		chunk.isEntry ||
		chunk.moduleIds.length > 0 ||
		chunk.dynamicImports.length > 0 ||
		staticallyImported.has(chunk.fileName)
	)
		return undefined;
	const program = parse(chunk.fileName, chunk.code);
	if (!program) return undefined;
	const bindings = new Map<string, string>();
	const sideEffects: string[] = [];
	const calls: string[] = [];
	const exports = new Map<string, string>();
	let target: Chunk | undefined;
	for (const node of program.body as Syntax[]) {
		if (node.type === 'ImportDeclaration') {
			if ((node.attributes as unknown[] | undefined)?.length) return undefined;
			const source = (node.source as Syntax).value;
			if (typeof source !== 'string' || !source.startsWith('.')) return undefined;
			const fileName = normalize(join(dirname(chunk.fileName), source));
			const specifiers = node.specifiers as Syntax[];
			if (specifiers.length === 0) {
				sideEffects.push(fileName);
				continue;
			}
			if (target && target.fileName !== fileName) return undefined;
			target = chunks.get(fileName);
			if (!target) return undefined;
			for (const specifier of specifiers) {
				if (specifier.type !== 'ImportSpecifier') return undefined;
				const imported = propertyName(specifier.imported as Syntax);
				if (imported === undefined) return undefined;
				bindings.set((specifier.local as Syntax).name as string, imported);
			}
		} else if (node.type === 'ExpressionStatement') {
			const call = node.expression as Syntax;
			const callee = call.callee as Syntax | undefined;
			const imported =
				call.type === 'CallExpression' &&
				!call.optional &&
				(call.arguments as unknown[]).length === 0 &&
				callee?.type === 'Identifier'
					? bindings.get(callee.name as string)
					: undefined;
			if (imported === undefined) return undefined;
			calls.push(imported);
		} else if (node.type === 'ExportNamedDeclaration' && !node.declaration && !node.source) {
			for (const specifier of node.specifiers as Syntax[]) {
				const imported = bindings.get(propertyName(specifier.local as Syntax) ?? '');
				const exported = propertyName(specifier.exported as Syntax);
				if (imported === undefined || exported === undefined) return undefined;
				exports.set(exported, imported);
			}
		} else if (node.type !== 'EmptyStatement') return undefined;
	}
	if (!target || target === chunk || exports.size === 0 || target.exports.includes('then'))
		return undefined;
	const targetExports = new Set(target.exports);
	if (![...calls, ...exports.values()].every((name) => targetExports.has(name))) return undefined;
	// A side-effect import is ordering the facade already inherits only when the target runs it first.
	const closure = staticClosure(target, chunks);
	if (!sideEffects.every((fileName) => closure.has(fileName))) return undefined;
	return { target, calls, exports };
}

function staticClosure(root: Chunk, chunks: ReadonlyMap<string, Chunk>): Set<string> {
	const seen = new Set<string>();
	const pending = [...root.imports];
	while (pending.length > 0) {
		const fileName = pending.pop()!;
		if (seen.has(fileName)) continue;
		seen.add(fileName);
		pending.push(...(chunks.get(fileName)?.imports ?? []));
	}
	return seen;
}

function importSource(node: Syntax): unknown {
	const source = node.source as Syntax;
	return source.type === 'Literal'
		? source.value
		: source.type === 'TemplateLiteral' && (source.expressions as unknown[]).length === 0
			? ((source.quasis as Syntax[])[0]?.value as { cooked?: string })?.cooked
			: undefined;
}

function propertyName(node: Syntax | undefined): string | undefined {
	if (node?.type === 'Identifier') return node.name as string;
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	return undefined;
}

function parse(fileName: string, code: string): Syntax | undefined {
	try {
		const parsed = parseChunkCode(fileName, code);
		return parsed.errors.length ? undefined : (parsed.program as unknown as Syntax);
	} catch {
		return undefined;
	}
}

function walk(
	node: Syntax,
	parents: Syntax[],
	offsets: readonly number[],
	visit: (node: Syntax, parents: readonly Syntax[]) => void,
): void {
	visit(node, parents);
	parents.push(node);
	const descend = (child: unknown) => {
		if (isSyntax(child) && spansAnyOffset(offsets, child)) walk(child, parents, offsets, visit);
	};
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent') continue;
		if (Array.isArray(value)) {
			for (const item of value) descend(item);
		} else descend(value);
	}
	parents.pop();
}

function isSyntax(value: unknown): value is Syntax {
	return (
		typeof value === 'object' && value !== null && typeof (value as Syntax).type === 'string'
	);
}

function isChunk(value: unknown): value is Chunk {
	if (!value || typeof value !== 'object') return false;
	const chunk = value as Partial<Chunk>;
	return (
		chunk.type === 'chunk' &&
		typeof chunk.fileName === 'string' &&
		typeof chunk.code === 'string' &&
		Array.isArray(chunk.imports) &&
		Array.isArray(chunk.dynamicImports) &&
		Array.isArray(chunk.moduleIds) &&
		Array.isArray(chunk.exports)
	);
}
