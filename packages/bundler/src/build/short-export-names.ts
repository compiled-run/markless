import { dirname, join, normalize } from 'pathe';
import { RolldownMagicString, type Plugin } from 'rolldown';
import { parseChunkCode } from './chunk-ast.ts';
import { PACK_LOAD, PACK_LOADER_PREFIX } from './lazy-module-facades.ts';

// Packs keep Rolldown's unminified cross-chunk names so a name never depends on emission order;
// this pass shortens each to a prefix of a hash of that name, unique within its own chunk.

export type ShortNameChunk = {
	readonly fileName: string;
	readonly code: string;
	readonly exports: readonly string[];
	readonly isEntry?: boolean;
	readonly isDynamicEntry?: boolean;
	/** Export names an entry or dynamic entry must keep: its facade module's own exports. */
	readonly signature?: readonly string[] | undefined;
	/** A facade an earlier pass collapsed into its pack; it is dropped from the bundle. */
	readonly removed?: boolean;
};

export type ShortNamePlan = {
	readonly renames: ReadonlyMap<string, ReadonlyMap<string, string>>;
	readonly edits: ReadonlyMap<string, readonly Edit[]>;
	readonly pruned: ReadonlyMap<string, ReadonlySet<string>>;
	/** Per chunk file name: its export names once the edits apply. */
	readonly exports: ReadonlyMap<string, readonly string[]>;
};

type Edit = { readonly start: number; readonly end: number; readonly source: string };
type Syntax = { type?: string; start: number; end: number; [key: string]: unknown };
type Reference = {
	readonly chunk: string;
	readonly target: string;
	readonly name: string;
	readonly node: Syntax;
	readonly shorthand: boolean;
	readonly removed: boolean;
};
type OwnExport = {
	readonly name: string;
	readonly node: Syntax;
	readonly local: Syntax;
	readonly shorthand: boolean;
	// A plain `export{...}` clause, which can drop names; a re-export clause cannot.
	readonly clause: Syntax | undefined;
};

const MIN_LENGTH = 2;
// Later bundle passes find the Vite preload helper by these export names in importers.
const READ_BY_LATER_PASSES = /^(?:__vitePreload|init_preload_helper)$/;
// A symbol init a runtime import() may call once a later pass gives it its canonical name.
const SYMBOL_INIT = /^init__virtual_markless_symbol/;
const START = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
const PART = `${START}0123456789`;
const WORD = /[A-Za-z_$][\w$]*/g;
const RESERVED = new Set(
	'await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch then this throw true try typeof undefined var void while with yield arguments'.split(
		' ',
	),
);

export function planShortExportNames(chunks: readonly ShortNameChunk[]): ShortNamePlan {
	const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const references: Reference[] = [];
	const own = new Map<string, OwnExport[]>();
	const pinned = new Map<string, Set<string>>();
	const opaque = new Set<string>();
	const words = new Set<string>();
	const escaping = new Set<string>();
	const strings: string[] = [];
	const pin = (fileName: string, name: string) => {
		const set = pinned.get(fileName) ?? new Set();
		set.add(name);
		pinned.set(fileName, set);
	};
	for (const chunk of chunks) {
		const parsed = parseChunkCode(chunk.fileName, chunk.code);
		if (parsed.errors.length)
			return { renames: new Map(), edits: new Map(), pruned: new Map(), exports: new Map() };
		const removed = !!chunk.removed;
		const exports: OwnExport[] = [];
		for (const node of parsed.program.body as unknown as Syntax[]) {
			if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') {
				const target = targetOf(chunk.fileName, node, byName);
				if (!target) continue;
				if (node.type === 'ExportAllDeclaration') {
					opaque.add(target);
					continue;
				}
				for (const specifier of (node.specifiers as Syntax[] | undefined) ?? []) {
					if (specifier.type !== 'ImportSpecifier') {
						opaque.add(target);
						continue;
					}
					const imported = specifier.imported as Syntax;
					const local = specifier.local as Syntax;
					references.push({
						chunk: chunk.fileName,
						target,
						name: nameOf(imported),
						node: imported,
						shorthand: imported.start === local.start,
						removed,
					});
				}
				continue;
			}
			if (node.type === 'ExportDefaultDeclaration') {
				pin(chunk.fileName, 'default');
				continue;
			}
			if (node.type !== 'ExportNamedDeclaration') continue;
			if (node.declaration) {
				for (const name of declaredNames(node.declaration as Syntax))
					pin(chunk.fileName, name);
				continue;
			}
			const target = node.source ? targetOf(chunk.fileName, node, byName) : undefined;
			for (const specifier of node.specifiers as Syntax[]) {
				const local = specifier.local as Syntax;
				const exported = specifier.exported as Syntax;
				const shorthand = local.start === exported.start;
				if (node.source) {
					if (target)
						references.push({
							chunk: chunk.fileName,
							target,
							name: nameOf(local),
							node: local,
							shorthand,
							removed,
						});
					if (shorthand && target) pin(chunk.fileName, nameOf(exported));
					else
						exports.push({
							name: nameOf(exported),
							node: exported,
							local,
							shorthand: false,
							clause: undefined,
						});
				} else
					exports.push({
						name: nameOf(exported),
						node: exported,
						local,
						shorthand,
						clause: node,
					});
			}
		}
		own.set(chunk.fileName, exports);
		scanReads(
			parsed.program as unknown as Syntax,
			words,
			(source, members) => {
				const target = resolveChunk(chunk.fileName, source, byName);
				if (!target) return false;
				if (!members) {
					escaping.add(target);
					return true;
				}
				for (const node of members)
					references.push({
						chunk: chunk.fileName,
						target,
						name: node.name as string,
						node,
						shorthand: false,
						removed,
					});
				return true;
			},
			strings,
		);
	}

	// A chunk named in a string can be imported by a URL built at runtime.
	const text = strings.join('\n');
	for (const chunk of chunks)
		if (text.includes(chunk.fileName.slice(chunk.fileName.lastIndexOf('/') + 1)))
			escaping.add(chunk.fileName);
	const renames = new Map<string, Map<string, string>>();
	const pruned = new Map<string, Set<string>>();
	const finalNames = new Map<string, string[]>();
	const survivingReads = new Set(
		references.filter((item) => !item.removed).map((item) => `${item.target}\0${item.name}`),
	);
	for (const chunk of chunks) {
		if (opaque.has(chunk.fileName) || chunk.removed) continue;
		const keep = new Set(pinned.get(chunk.fileName));
		if (chunk.isEntry || chunk.isDynamicEntry) {
			if (!chunk.signature) continue;
			for (const name of chunk.signature) keep.add(name);
		}
		const candidates: string[] = [];
		// The code is the truth: an earlier pass may have rewritten export names the chunk metadata still lists.
		const ownNames = new Set([
			...(own.get(chunk.fileName) ?? []).map((item) => item.name),
			...(pinned.get(chunk.fileName) ?? []),
		]);
		for (const name of ownNames) {
			if (
				keep.has(name) ||
				READ_BY_LATER_PASSES.test(name) ||
				(escaping.has(chunk.fileName) && (words.has(name) || SYMBOL_INIT.test(name)))
			)
				keep.add(name);
			else candidates.push(name);
		}
		const names = shortNames(candidates, keep);
		if (names.size) renames.set(chunk.fileName, names);
		finalNames.set(chunk.fileName, [...ownNames]);
		// Rolldown exported these for chunks since collapsed into loaders that read the bindings directly.
		if (escaping.has(chunk.fileName)) continue;
		const unused = new Set(
			[...ownNames].filter(
				(name) => !keep.has(name) && !survivingReads.has(`${chunk.fileName}\0${name}`),
			),
		);
		if (unused.size) pruned.set(chunk.fileName, unused);
	}
	const code = new Map(chunks.map((chunk) => [chunk.fileName, chunk.code]));

	const edits = new Map<string, Edit[]>();
	const edit = (fileName: string, item: Edit) => {
		const list = edits.get(fileName) ?? [];
		list.push(item);
		edits.set(fileName, list);
	};
	for (const reference of references) {
		const next = renames.get(reference.target)?.get(reference.name);
		if (!next || reference.removed) continue;
		edit(reference.chunk, {
			start: reference.node.start,
			end: reference.node.end,
			source: reference.shorthand ? `${next} as ${reference.name}` : next,
		});
	}
	for (const [fileName, exports] of own) {
		const names = renames.get(fileName) ?? new Map<string, string>();
		const unused = pruned.get(fileName);
		const rewritten = new Set<Syntax>();
		for (const item of exports) {
			if (!item.clause || !unused?.has(item.name) || rewritten.has(item.clause)) continue;
			rewritten.add(item.clause);
			const kept = exports
				.filter((other) => other.clause === item.clause && !unused.has(other.name))
				.map((other) => {
					const local = code.get(fileName)!.slice(other.local.start, other.local.end);
					const name = names.get(other.name) ?? other.name;
					const exported = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
					return local === exported ? local : `${local} as ${exported}`;
				});
			edit(fileName, {
				start: item.clause.start,
				end: item.clause.end,
				source: kept.length ? `export{${kept.join(',')}};` : '',
			});
		}
		for (const item of exports) {
			const next = names.get(item.name);
			if (!next || (item.clause && rewritten.has(item.clause))) continue;
			edit(fileName, {
				start: item.node.start,
				end: item.node.end,
				source: item.shorthand ? `${item.name} as ${next}` : next,
			});
		}
	}
	const exports = new Map(
		[...finalNames].map(([fileName, list]) => [
			fileName,
			list
				.filter((name) => !pruned.get(fileName)?.has(name))
				.map((name) => renames.get(fileName)?.get(name) ?? name),
		]),
	);
	return { renames, edits, pruned, exports };
}

/** Deterministic: each name is the shortest prefix of its own hash that no other name in the set shares. */
export function shortNames(
	names: readonly string[],
	taken: ReadonlySet<string> = new Set(),
): Map<string, string> {
	const hashes = [...new Set(names)].map((name) => [name, identifierHash(name)] as const);
	hashes.sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0));
	const result = new Map<string, string>();
	for (let index = 0; index < hashes.length; index++) {
		const [name, hash] = hashes[index]!;
		const shared = Math.max(
			commonPrefix(hash, hashes[index - 1]?.[1] ?? ''),
			commonPrefix(hash, hashes[index + 1]?.[1] ?? ''),
		);
		let length = Math.max(MIN_LENGTH, shared + 1);
		while (
			length < hash.length &&
			(RESERVED.has(hash.slice(0, length)) || taken.has(hash.slice(0, length)))
		)
			length++;
		const next = hash.slice(0, length);
		if (taken.has(next) || RESERVED.has(next) || hash.length === shared)
			throw new Error(
				`Markless could not give cross-chunk export ${name} a unique short name.`,
			);
		result.set(name, next);
	}
	return result;
}

export function shortExportNamesPlugin(
	removedChunks: () => ReadonlySet<string> = () => new Set(),
): Plugin {
	let pending = new Map<
		string,
		{
			chunk: ShortNameChunk;
			resolve: (result: { code: string; map: string | null } | null) => void;
			reject: (error: unknown) => void;
		}
	>();
	let exports = new Map<string, readonly string[]>();
	return {
		name: 'markless-short-export-names',
		renderStart() {
			pending = new Map();
			exports = new Map();
		},
		renderChunk(code, chunk, options, meta) {
			const facade = chunk.facadeModuleId ? this.getModuleInfo(chunk.facadeModuleId) : null;
			return new Promise((resolve, reject) => {
				pending.set(chunk.fileName, {
					chunk: {
						fileName: chunk.fileName,
						code,
						exports: [...chunk.exports],
						isEntry: chunk.isEntry,
						isDynamicEntry: chunk.isDynamicEntry,
						signature: facade?.exports,
						removed: removedChunks().has(chunk.fileName),
					},
					resolve,
					reject,
				});
				if (pending.size !== Object.keys(meta.chunks).length) return;
				try {
					const plan = planShortExportNames(
						[...pending.values()].map((item) => item.chunk),
					);
					exports = new Map(plan.exports);
					for (const [fileName, item] of pending) {
						const list = plan.edits.get(fileName);
						if (!list?.length) {
							item.resolve(null);
							continue;
						}
						const source = new RolldownMagicString(item.chunk.code);
						for (const change of list)
							source.overwrite(change.start, change.end, change.source);
						item.resolve({
							code: source.toString(),
							map: options.sourcemap
								? source.generateMap({ hires: true }).toString()
								: null,
						});
					}
				} catch (error) {
					for (const item of pending.values()) item.reject(error);
				}
				pending.clear();
			});
		},
		renderError(error) {
			for (const item of pending.values()) item.reject(error);
			pending.clear();
		},
		generateBundle: {
			order: 'pre',
			handler(_, bundle) {
				for (const output of Object.values(bundle)) {
					if (output.type !== 'chunk') continue;
					const final = exports.get(output.preliminaryFileName);
					if (final) output.exports = [...final];
				}
			},
		},
	};
}

function targetOf(
	importer: string,
	node: Syntax,
	chunks: ReadonlyMap<string, ShortNameChunk>,
): string | undefined {
	const value = (node.source as { value?: unknown } | undefined)?.value;
	return typeof value === 'string' ? resolveChunk(importer, value, chunks) : undefined;
}

function resolveChunk(
	importer: string,
	specifier: string,
	chunks: ReadonlyMap<string, ShortNameChunk>,
): string | undefined {
	if (!specifier.startsWith('.')) return undefined;
	const target = normalize(join(dirname(importer), specifier));
	return chunks.has(target) ? target : undefined;
}

function nameOf(node: Syntax): string {
	return node.type === 'Identifier' ? (node.name as string) : String(node.value);
}

function declaredNames(declaration: Syntax): string[] {
	if (declaration.type === 'VariableDeclaration')
		return (declaration.declarations as Syntax[]).flatMap((item) =>
			bindingNames(item.id as Syntax),
		);
	const id = declaration.id as Syntax | null | undefined;
	return id ? [id.name as string] : [];
}

function bindingNames(pattern: Syntax): string[] {
	if (pattern.type === 'Identifier') return [pattern.name as string];
	if (pattern.type === 'ObjectPattern')
		return (pattern.properties as Syntax[]).flatMap((property) =>
			bindingNames(
				(property.type === 'RestElement' ? property.argument : property.value) as Syntax,
			),
		);
	if (pattern.type === 'ArrayPattern')
		return (pattern.elements as (Syntax | null)[]).flatMap((element) =>
			element ? bindingNames(element) : [],
		);
	if (pattern.type === 'AssignmentPattern') return bindingNames(pattern.left as Syntax);
	if (pattern.type === 'RestElement') return bindingNames(pattern.argument as Syntax);
	return [];
}

// Names code can read by spelling (member and object keys, strings), and the chunks import() hands out.
// Imports the packer wrote itself only ever call a pack loader, so their targets do not escape.
function scanReads(
	root: Syntax,
	words: Set<string>,
	// Members: the names Rolldown's `import(x).then(m=>(m.init(),m.name))` reads; otherwise the chunk escapes.
	imports: (source: string, members: Syntax[] | undefined) => boolean,
	strings: string[],
): void {
	const parents = new Map<Syntax, Syntax | undefined>();
	const pending: [unknown, Syntax | undefined][] = [[root, undefined]];
	while (pending.length) {
		const [item, parent] = pending.pop()!;
		if (!item || typeof item !== 'object') continue;
		if (Array.isArray(item)) {
			for (const child of item) pending.push([child, parent]);
			continue;
		}
		const syntax = item as Syntax;
		if (typeof syntax.type !== 'string') continue;
		parents.set(syntax, parent);
		switch (syntax.type) {
			case 'ImportDeclaration':
			case 'ExportAllDeclaration':
				continue;
			case 'ExportNamedDeclaration':
				pending.push([syntax.declaration, syntax]);
				continue;
			case 'ImportExpression': {
				const source = syntax.source as Syntax;
				const value =
					source.type === 'Literal'
						? source.value
						: source.type === 'TemplateLiteral' &&
							  !(source.expressions as unknown[]).length
							? ((source.quasis as Syntax[])[0]?.value as { cooked?: string })?.cooked
							: undefined;
				if (
					typeof value === 'string' &&
					!packerImport(syntax, parents) &&
					!imports(value, namespaceReads(syntax, parents))
				)
					strings.push(value);
				if (typeof value !== 'string') pending.push([source, syntax]);
				pending.push([syntax.options, syntax]);
				continue;
			}
			case 'CallExpression':
				if (
					(syntax.callee as Syntax).type === 'Identifier' &&
					(syntax.callee as Syntax).name === PACK_LOAD
				) {
					pending.push([(syntax.arguments as Syntax[])[2], syntax]);
					continue;
				}
				break;
			case 'MemberExpression':
			case 'Property':
			case 'MethodDefinition':
			case 'PropertyDefinition':
			case 'AccessorProperty': {
				const key = (syntax.property ?? syntax.key) as Syntax | undefined;
				if (key?.type === 'Identifier' && !syntax.computed) words.add(key.name as string);
				break;
			}
			case 'Literal':
				if (typeof syntax.value === 'string') {
					collectWords(syntax.value, words);
					strings.push(syntax.value);
				}
				continue;
			case 'TemplateElement': {
				const text = String((syntax.value as { raw?: string }).raw ?? '');
				collectWords(text, words);
				strings.push(text);
				continue;
			}
		}
		for (const [key, value] of Object.entries(syntax))
			if (key !== 'type' && value && typeof value === 'object') pending.push([value, syntax]);
	}
}

function namespaceReads(
	node: Syntax,
	parents: ReadonlyMap<Syntax, Syntax | undefined>,
): Syntax[] | undefined {
	const parent = parents.get(node);
	const grandparent = parent && parents.get(parent);
	if (
		parent?.type !== 'MemberExpression' ||
		parent.object !== node ||
		parent.computed ||
		(parent.property as Syntax).name !== 'then' ||
		grandparent?.type !== 'CallExpression' ||
		grandparent.callee !== parent ||
		(grandparent.arguments as Syntax[]).length !== 1
	)
		return undefined;
	const callback = (grandparent.arguments as Syntax[])[0]!;
	const params = callback.params as Syntax[] | undefined;
	if (
		callback.type !== 'ArrowFunctionExpression' ||
		params?.length !== 1 ||
		params[0]!.type !== 'Identifier'
	)
		return undefined;
	const namespace = params[0]!.name;
	let body = callback.body as Syntax;
	while (body.type === 'ParenthesizedExpression') body = body.expression as Syntax;
	const reads: Syntax[] = [];
	for (const expression of body.type === 'SequenceExpression'
		? (body.expressions as Syntax[])
		: [body]) {
		const member =
			expression.type === 'CallExpression' && !(expression.arguments as Syntax[]).length
				? (expression.callee as Syntax)
				: expression;
		if (
			member.type !== 'MemberExpression' ||
			member.computed ||
			(member.object as Syntax).type !== 'Identifier' ||
			(member.object as Syntax).name !== namespace
		)
			return undefined;
		reads.push(member.property as Syntax);
	}
	return reads;
}

function packerImport(node: Syntax, parents: ReadonlyMap<Syntax, Syntax | undefined>): boolean {
	const parent = parents.get(node);
	const grandparent = parent && parents.get(parent);
	// load("./pack.js","<loader>",()=>import("./pack.js"))
	if (
		parent?.type === 'ArrowFunctionExpression' &&
		grandparent?.type === 'CallExpression' &&
		(grandparent.callee as Syntax).type === 'Identifier' &&
		(grandparent.callee as Syntax).name === PACK_LOAD
	)
		return true;
	// import("./pack.js").then(module=>module.<loader>())
	if (
		parent?.type === 'MemberExpression' &&
		parent.object === node &&
		(parent.property as Syntax).name === 'then' &&
		grandparent?.type === 'CallExpression'
	) {
		const callback = (grandparent.arguments as Syntax[])[0];
		const call =
			callback?.type === 'ArrowFunctionExpression' ? (callback.body as Syntax) : undefined;
		const callee = call?.type === 'CallExpression' ? (call.callee as Syntax) : undefined;
		return (
			(grandparent.arguments as Syntax[]).length === 1 &&
			callee?.type === 'MemberExpression' &&
			!callee.computed &&
			String((callee.property as Syntax).name).startsWith(PACK_LOADER_PREFIX)
		);
	}
	// for(const pack of[import("./a.js"),...])pack.catch(()=>{})
	if (parent?.type === 'ArrayExpression' && grandparent?.type === 'ForOfStatement') {
		const body = grandparent.body as Syntax;
		const call = body.type === 'ExpressionStatement' ? (body.expression as Syntax) : undefined;
		const callee = call?.type === 'CallExpression' ? (call.callee as Syntax) : undefined;
		return (
			callee?.type === 'MemberExpression' &&
			(callee.property as Syntax).name === 'catch' &&
			(callee.object as Syntax).type === 'Identifier'
		);
	}
	return false;
}

function collectWords(text: string, words: Set<string>): void {
	for (const match of text.matchAll(WORD)) words.add(match[0]);
}

function commonPrefix(a: string, b: string): number {
	let index = 0;
	while (index < a.length && a[index] === b[index]) index++;
	return index;
}

// FNV-1a 64 over UTF-16 units, spelled as an identifier: first character from START, the rest from PART.
function identifierHash(text: string): string {
	let hash = 0xcbf29ce484222325n;
	for (let index = 0; index < text.length; index++) {
		hash ^= BigInt(text.charCodeAt(index));
		hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
	}
	let name = START[Number(hash % BigInt(START.length))]!;
	hash /= BigInt(START.length);
	while (hash > 0n) {
		name += PART[Number(hash % BigInt(PART.length))]!;
		hash /= BigInt(PART.length);
	}
	return name;
}
