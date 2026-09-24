import { dirname, join, normalize, relative } from 'pathe';
import {
	type ChunkDynamicImport,
	chunkDynamicImports,
	chunkLocalExportSpecifiers,
	mayContainDynamicImport,
	parseChunkCode,
	spansAnyOffset,
	textOffsets,
} from './chunk-ast.ts';
import { RolldownMagicString, type Plugin } from 'rolldown';

export function lazyModuleFacadesPlugin(
	root: () => string = () => '',
	packOf?: (moduleId: string) => string | undefined,
	packRoutes?: (pack: string) => ReadonlyArray<string> | undefined,
): Plugin {
	let chunks: Record<string, Chunk> = {};
	let removed = new Set<string>();
	let pending = new Map<
		string,
		{
			resolve: (result: { code: string; map: string | null } | null) => void;
			reject: (error: unknown) => void;
		}
	>();
	const reset = () => {
		chunks = {};
		removed = new Set();
		pending = new Map();
	};
	return {
		name: 'markless-lazy-module-facades',
		renderStart: reset,
		renderChunk(code, chunk, options, meta) {
			// Named fields only: spreading the rendered chunk runs every native getter, `modules` included.
			chunks[chunk.fileName] = {
				type: 'chunk',
				fileName: chunk.fileName,
				isEntry: chunk.isEntry,
				facadeModuleId: chunk.facadeModuleId,
				code,
				imports: [...chunk.imports],
				dynamicImports: [...chunk.dynamicImports],
				moduleIds: [...chunk.moduleIds],
				exports: [...chunk.exports],
			};
			return new Promise((resolve, reject) => {
				pending.set(chunk.fileName, { resolve, reject });
				// Rolldown renders chunks concurrently; collect their code before changing cross-chunk imports.
				if (pending.size !== Object.keys(meta.chunks).length) return;
				try {
					const results = new Map<string, { code: string; map: string | null }>();
					chunks = Object.fromEntries(
						Object.entries(chunks).sort(([a], [b]) => localeOrder(a, b)),
					);
					removed = new Set(
						collapseLazyModuleFacades(
							chunks,
							(chunk, replacements, suffix) => {
								const source = new RolldownMagicString(chunk.code);
								for (const replacement of replacements)
									source.overwrite(
										replacement.start,
										replacement.end,
										replacement.source,
									);
								source.append(suffix);
								results.set(chunk.fileName, {
									code: source.toString(),
									map: options.sourcemap
										? source.generateMap({ hires: true }).toString()
										: null,
								});
							},
							{ root: root(), packOf, packRoutes },
						).removed,
					);
					for (const [name, wait] of pending) wait.resolve(results.get(name) ?? null);
					pending.clear();
				} catch (error) {
					for (const wait of pending.values()) wait.reject(error);
					pending.clear();
				}
			});
		},
		renderError(error) {
			for (const wait of pending.values()) wait.reject(error);
			reset();
		},
		generateBundle: {
			order: 'pre',
			handler(_, bundle) {
				const filenames = new Map(
					Object.values(bundle)
						.filter((chunk) => chunk.type === 'chunk')
						.map((chunk) => [chunk.preliminaryFileName, chunk.fileName]),
				);
				for (const [name, chunk] of Object.entries(bundle)) {
					if (chunk.type !== 'chunk') continue;
					if (removed.has(chunk.preliminaryFileName)) {
						delete bundle[name];
						if (chunk.sourcemapFileName) delete bundle[chunk.sourcemapFileName];
						continue;
					}
					const updated = chunks[chunk.preliminaryFileName];
					if (!updated) continue;
					chunk.dynamicImports = updated.dynamicImports.map(
						(name) => filenames.get(name) ?? name,
					);
					chunk.imports = updated.imports.map((name) => filenames.get(name) ?? name);
					chunk.exports = updated.exports;
					chunk.moduleIds = updated.moduleIds;
				}
			},
		},
	};
}

// The collator `localeCompare` builds on every call, built once.
const localeOrder = new Intl.Collator().compare;

type Chunk = {
	type: 'chunk';
	fileName: string;
	code: string;
	imports: string[];
	dynamicImports: string[];
	isEntry?: boolean;
	facadeModuleId?: string | null;
	moduleIds: string[];
	exports: string[];
};
type Facade = {
	target: Chunk;
	calls: string[];
	exports: [string, string][];
	loader: string;
	imports: { from: string; name: string; alias: string }[];
};
type Binding = { from: string; name: string };
type PendingFacade = {
	fileName: string;
	target: Chunk;
	targetBindings: Map<string, string>;
	calls: Binding[];
	exports: [string, Binding][];
	identity: string;
};
type Syntax = { type?: string; start?: number; end?: number; [key: string]: unknown };

type Replacement = { start: number; end: number; source: string };

export function collapseLazyModuleFacades(
	bundle: Record<string, unknown>,
	onEdit?: (chunk: Chunk, replacements: Replacement[], suffix: string) => void,
	options: {
		readonly root?: string;
		readonly packOf?: (moduleId: string) => string | undefined;
		readonly packRoutes?: (pack: string) => ReadonlyArray<string> | undefined;
	} = {},
): { removed: string[] } {
	const chunks = new Map(
		Object.values(bundle)
			.filter(
				(item): item is Chunk =>
					!!item && typeof item === 'object' && (item as Chunk).type === 'chunk',
			)
			.map((chunk) => [chunk.fileName, chunk]),
	);
	const packs = new Map(
		[...chunks.values()].map(
			(chunk) => [chunk.fileName, chunkPack(chunk, options.packOf)] as const,
		),
	);
	const staticallyImported = new Set([...chunks.values()].flatMap((chunk) => chunk.imports));
	// Evaluating an inert chunk runs no code that could read a binding, so it may evaluate earlier than it did.
	const inert = new Map<string, boolean>();
	const renderedCode = new Map([...chunks.values()].map((chunk) => [chunk.fileName, chunk.code]));
	const inertClosure = (fileName: string, seen = new Set<string>()): boolean => {
		if (seen.has(fileName)) return true;
		seen.add(fileName);
		const chunk = chunks.get(fileName);
		if (!chunk) return false;
		let own = inert.get(fileName);
		if (own === undefined) {
			const parsed = parseChunkCode(chunk.fileName, renderedCode.get(fileName)!);
			const body = parsed.program.body as Syntax[];
			const scope = topLevelScope(body, (source) => {
				const from = chunks.get(resolve(fileName, source));
				return !!from && !from.imports.length && inertClosure(from.fileName, new Set());
			});
			own = !parsed.errors.length && body.every((node) => inertStatement(node, scope));
			inert.set(fileName, own);
		}
		return own && chunk.imports.every((name) => inertClosure(name, seen));
	};
	const referenced = new Set<string>();
	const unsupported = new Set<string>();
	const imports = new Map<string, readonly ChunkDynamicImport[]>();
	const awaitChecked = new Map<string, boolean>();
	// Top-level await needs the full tree, so it is read only for chunks a later check asks about.
	const awaiting = {
		has(fileName: string): boolean {
			let result = awaitChecked.get(fileName);
			if (result === undefined) {
				const code = renderedCode.get(fileName);
				result =
					code !== undefined &&
					code.includes('await') &&
					mayContainDynamicImport(code) &&
					hasTopLevelAwait(parseChunkCode(fileName, code).program);
				awaitChecked.set(fileName, result);
			}
			return result;
		},
	};
	for (const chunk of chunks.values()) {
		const expressions = mayContainDynamicImport(chunk.code)
			? (chunkDynamicImports(chunk.fileName, chunk.code) ?? dynamicImportsFromTree(chunk))
			: [];
		imports.set(chunk.fileName, expressions);
		const resolved = new Set<string>();
		for (const expression of expressions) {
			const value = expression.specifier;
			if (value === undefined) continue;
			const target = resolve(chunk.fileName, value);
			resolved.add(target);
			referenced.add(target);
			if (!expression.plain) unsupported.add(target);
		}
		for (const target of chunk.dynamicImports)
			if (!resolved.has(target)) unsupported.add(target);
	}
	const facades = new Map<string, Facade>();
	const exportBindings = new Map<string, Map<string, string>>();
	const pending: PendingFacade[] = [];
	for (const chunk of chunks.values()) {
		if (
			chunk.isEntry ||
			chunk.moduleIds.length ||
			!referenced.has(chunk.fileName) ||
			unsupported.has(chunk.fileName) ||
			chunk.exports.includes('then') ||
			staticallyImported.has(chunk.fileName)
		)
			continue;
		// A facade may also import chunks its target imports: those evaluate before the target either way.
		const candidates = chunk.imports.filter((name) =>
			chunk.imports.every(
				(other) => other === name || !!chunks.get(name)?.imports.includes(other),
			),
		);
		if (candidates.length !== 1) continue;
		const target = chunks.get(candidates[0]!);
		if (
			!target ||
			target === chunk ||
			target.exports.includes('then') ||
			(!target.moduleIds.length && !target.exports.length)
		)
			continue;
		const parsed = parseChunkCode(chunk.fileName, chunk.code);
		if (parsed.errors.length) continue;
		const bindings = new Map<string, Binding>();
		const calls: Binding[] = [];
		const exports: [string, Binding][] = [];
		let supported = true;
		for (const node of parsed.program.body) {
			const from =
				node.type === 'ImportDeclaration' ? resolve(chunk.fileName, node.source.value) : '';
			if (
				node.type === 'ImportDeclaration' &&
				!node.attributes?.length &&
				(from === target.fileName || target.imports.includes(from))
			) {
				for (const specifier of node.specifiers) {
					if (specifier.type !== 'ImportSpecifier') {
						supported = false;
						break;
					}
					bindings.set(specifier.local.name, {
						from,
						name:
							specifier.imported.type === 'Identifier'
								? specifier.imported.name
								: specifier.imported.value,
					});
				}
			} else if (
				node.type === 'ExpressionStatement' &&
				node.expression.type === 'CallExpression' &&
				node.expression.callee.type === 'Identifier' &&
				node.expression.arguments.length === 0
			) {
				const imported = bindings.get(node.expression.callee.name);
				if (!imported) {
					supported = false;
					break;
				}
				calls.push(imported);
			} else if (
				node.type === 'ExportNamedDeclaration' &&
				!node.declaration &&
				!node.source
			) {
				for (const specifier of node.specifiers) {
					const local =
						specifier.local.type === 'Identifier'
							? specifier.local.name
							: specifier.local.value;
					const imported = bindings.get(local);
					if (!imported) {
						supported = false;
						break;
					}
					exports.push([
						specifier.exported.type === 'Identifier'
							? specifier.exported.name
							: specifier.exported.value,
						imported,
					]);
				}
			} else if (node.type !== 'EmptyStatement') {
				supported = false;
				break;
			}
		}
		if (
			!supported ||
			!exports.length ||
			exports.some(([name]) => name === 'then' || /^(0|[1-9]\d*)$/.test(name))
		)
			continue;
		exports.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		let targetBindings = exportBindings.get(target.fileName);
		if (!targetBindings) {
			targetBindings =
				chunkLocalExportSpecifiers(target.fileName, target.code) ?? exportSpecifiersFromTree(target);
			exportBindings.set(target.fileName, targetBindings);
		}
		if (
			[...calls, ...exports.map(([, imported]) => imported)].some(({ from, name }) =>
				from === target.fileName
					? !targetBindings.has(name)
					: !chunks.get(from)?.exports.includes(name),
			)
		)
			continue;
		pending.push({
			fileName: chunk.fileName,
			target,
			targetBindings,
			calls,
			exports,
			identity: facadeIdentity(chunk, exports, calls, options.root),
		});
	}
	// Loader names follow facade identity, not emission order, so one new facade changes no other chunk.
	pending.sort(
		(a, b) =>
			compareText(a.target.fileName, b.target.fileName) ||
			compareText(a.identity, b.identity),
	);
	const reservedNames = new Map<string, string[]>();
	const reserve = (target: Chunk, base: string) => {
		let reserved = reservedNames.get(target.fileName);
		if (!reserved) {
			reserved = [
				...new Set(target.code.match(/__markless(?:Packed|Namespace)[\w$]*/g) ?? []),
			];
			reservedNames.set(target.fileName, reserved);
		}
		let name = base;
		for (let attempt = 1; reserved.some((taken) => taken.startsWith(name)); attempt++)
			name = `${base}_${attempt}`;
		reserved.push(name);
		return name;
	};
	const namespaces = new Map<string, string>();
	for (const facade of pending) {
		if (!namespaces.has(facade.target.fileName))
			namespaces.set(facade.target.fileName, reserve(facade.target, '__marklessNamespace'));
		const loader = reserve(facade.target, `__marklessPacked${shortHash(facade.identity)}`);
		const imports: Facade['imports'] = [];
		const local = ({ from, name }: Binding) => {
			if (from === facade.target.fileName) return facade.targetBindings.get(name)!;
			let entry = imports.find((item) => item.from === from && item.name === name);
			if (!entry)
				imports.push((entry = { from, name, alias: `${loader}Import${imports.length}` }));
			return entry.alias;
		};
		facades.set(facade.fileName, {
			target: facade.target,
			calls: facade.calls.map(local),
			exports: facade.exports.map(([name, imported]) => [name, local(imported)]),
			loader,
			imports,
		});
	}
	const additions = new Map<string, string[]>();
	// An entry evaluates before every pack it loads, so its loads never find one registered.
	const usesRegistry = (chunk: Chunk) => !chunk.isEntry && !chunk.code.includes(PACK_LOAD);
	const registered = new Map<string, Set<string>>();
	for (const chunk of chunks.values()) {
		if (facades.has(chunk.fileName) || !usesRegistry(chunk)) continue;
		for (const node of imports.get(chunk.fileName) ?? []) {
			const value = node.specifier;
			const facade = typeof value === 'string' && facades.get(resolve(chunk.fileName, value));
			if (!facade || (facade.target === chunk && !awaiting.has(chunk.fileName))) continue;
			const loaders = registered.get(facade.target.fileName) ?? new Set();
			loaders.add(facade.loader);
			registered.set(facade.target.fileName, loaders);
		}
	}
	for (const [fileName, facade] of facades) {
		const namespace = namespaces.get(facade.target.fileName)!;
		const declarations = additions.get(facade.target.fileName) ?? [
			`const ${namespace}=(${createPackedNamespace.toString()});`,
		];
		const { loader } = facade;
		for (const { from, name, alias } of facade.imports) {
			const path = relative(dirname(facade.target.fileName), from);
			declarations.push(
				`import{${/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)} as ${alias}}from${JSON.stringify(path.startsWith('.') ? path : `./${path}`)};`,
			);
		}
		declarations.push(
			`let ${loader}Value,${loader}Error,${loader}Failed=false;export function ${loader}(){if(${loader}Failed)throw ${loader}Error;if(${loader}Value)return ${loader}Value;try{${facade.calls.map((name) => `${name}();`).join('')}return ${loader}Value=${namespace}({__proto__:null,${facade.exports.map(([name, local]) => `get ${JSON.stringify(name)}(){return ${local}}`).join(',')}})}catch(error){${loader}Failed=true;${loader}Error=error;throw error}}`,
		);
		additions.set(facade.target.fileName, declarations);
		facade.target.exports.push(loader);
		const original = chunks.get(fileName)!;
		if (original.facadeModuleId && !facade.target.moduleIds.includes(original.facadeModuleId))
			facade.target.moduleIds.push(original.facadeModuleId);
	}
	for (const [fileName, loaders] of registered)
		additions
			.get(fileName)!
			.push(
				`(globalThis.${PACK_REGISTRY}??={})[import.meta.url]={${[...loaders].join(',')}};`,
			);
	for (const chunk of chunks.values()) {
		if (facades.has(chunk.fileName)) continue;
		const replacements: Replacement[] = [];
		const lookup = usesRegistry(chunk);
		const evaluated = new Set<Chunk>();
		for (const node of imports.get(chunk.fileName) ?? []) {
			const value = node.specifier;
			if (typeof value !== 'string') continue;
			const facade = facades.get(resolve(chunk.fileName, value));
			if (!facade) continue;
			const path = relative(dirname(chunk.fileName), facade.target.fileName);
			const specifier = JSON.stringify(path.startsWith('.') ? path : `./${path}`);
			if (
				lookup &&
				evaluatesWith(chunk, facade.target, packs, awaiting, options.packRoutes) &&
				inertClosure(facade.target.fileName)
			)
				evaluated.add(facade.target);
			replacements.push({
				start: node.start,
				end: node.end,
				source:
					facade.target === chunk && !awaiting.has(chunk.fileName)
						? `(async()=>{await 0;return ${facade.loader}()})()`
						: lookup
							? `${PACK_LOAD}(${specifier},"${facade.loader}",()=>import(${specifier}))`
							: `import(${specifier}).then(module=>module.${facade.loader}())`,
			});
		}
		const suffix = [
			...(additions.get(chunk.fileName) ?? []),
			...(lookup && replacements.some(({ source }) => source.startsWith(PACK_LOAD))
				? [PACK_LOAD_SOURCE]
				: []),
			...(evaluated.size
				? [
						`setTimeout(()=>{for(const pack of[${[...evaluated]
							.map((target) => {
								const path = relative(dirname(chunk.fileName), target.fileName);
								return `import(${JSON.stringify(path.startsWith('.') ? path : `./${path}`)})`;
							})
							.join(',')}])pack.catch(()=>{})});`,
					]
				: []),
		].join('\n');
		if (replacements.length || suffix) onEdit?.(chunk, replacements, suffix);
		const pieces: string[] = [];
		let cursor = 0;
		for (const replacement of replacements.sort((a, b) => a.start - b.start)) {
			pieces.push(chunk.code.slice(cursor, replacement.start), replacement.source);
			cursor = replacement.end;
		}
		pieces.push(chunk.code.slice(cursor), suffix);
		chunk.code = pieces.join('');
		chunk.dynamicImports = [
			...new Set(
				chunk.dynamicImports.flatMap((id) => {
					const facade = facades.get(id);
					return facade?.target === chunk && !awaiting.has(chunk.fileName)
						? []
						: [facade?.target.fileName ?? id];
				}),
			),
		];
	}
	for (const [key, value] of Object.entries(bundle))
		if (facades.has((value as Chunk)?.fileName)) delete bundle[key];
	return { removed: [...facades.keys()] };
}

// A pack registers its loaders when it evaluates, because import() of an evaluated module still resolves a task later.
const PACK_REGISTRY = '__marklessPacks';
const PACK_LOAD = '__marklessPackLoad';
const PACK_LOAD_SOURCE = `function ${PACK_LOAD}(specifier,loader,load){const pack=globalThis.${PACK_REGISTRY}?.[import.meta.resolve?.(specifier)];return pack?Promise.resolve().then(pack[loader]):load().then(module=>module[loader]())}`;

// Evaluating a pack only declares its lazy module bodies. A route preloads the lazy targets of every pack it
// reaches, so a target serving the same route, or shared, is evaluated a task after its importer and registers.
function evaluatesWith(
	importer: Chunk,
	target: Chunk,
	packs: ReadonlyMap<string, string | undefined>,
	awaiting: { has(fileName: string): boolean },
	packRoutes?: (pack: string) => ReadonlyArray<string> | undefined,
): boolean {
	const from = packs.get(importer.fileName);
	const to = packs.get(target.fileName);
	const routes = (pack: string) =>
		pack.startsWith('route:') ? [pack.slice(6)] : packRoutes?.(pack);
	const toRoutes = to && routes(to);
	return (
		!!from &&
		!!to &&
		(to === 'shared' ||
			to === from ||
			(from !== 'shared' && !!toRoutes && !!routes(from)?.every((route) => toRoutes.includes(route)))) &&
		target !== importer &&
		!awaiting.has(target.fileName)
	);
}

// The route a pack serves, 'shared' for every route or a shared:<id> pack for some; undefined outside the planned packs.
function chunkPack(
	chunk: Chunk,
	packOf: ((moduleId: string) => string | undefined) | undefined,
): string | undefined {
	const names = new Set(chunk.moduleIds.map((id) => packOf?.(id)));
	const [name] = names;
	return names.size === 1 ? /^(route:.+?|shared(?::[0-9a-z]+)?)(?:~\d+)?$/.exec(name ?? '')?.[1] : undefined;
}

type TopLevelScope = { readonly declared: Set<string>; readonly leafImports: Set<string> };

function topLevelScope(body: Syntax[], leaf: (source: string) => boolean): TopLevelScope {
	const declared = new Set<string>();
	const leafImports = new Set<string>();
	for (const node of body) {
		const declaration = (node.type === 'ExportNamedDeclaration' ? node.declaration : node) as
			| Syntax
			| undefined;
		if (node.type === 'ImportDeclaration') {
			const fromLeaf = leaf((node.source as { value: string }).value);
			for (const specifier of node.specifiers as { local: { name: string } }[]) {
				declared.add(specifier.local.name);
				if (fromLeaf) leafImports.add(specifier.local.name);
			}
		} else if (
			declaration?.type === 'FunctionDeclaration' ||
			declaration?.type === 'ClassDeclaration'
		)
			declared.add((declaration.id as { name: string }).name);
		else if (declaration?.type === 'VariableDeclaration')
			for (const declarator of declaration.declarations as Syntax[])
				if ((declarator.id as Syntax).type === 'Identifier')
					declared.add((declarator.id as { name: string }).name);
	}
	return { declared, leafImports };
}

function inertStatement(node: Syntax, scope: TopLevelScope): boolean {
	switch (node.type) {
		case 'ImportDeclaration':
		case 'ExportAllDeclaration':
		case 'FunctionDeclaration':
		case 'EmptyStatement':
			return true;
		case 'ExportNamedDeclaration':
			return !node.declaration || inertStatement(node.declaration as Syntax, scope);
		case 'VariableDeclaration':
			return (node.declarations as Syntax[]).every(
				(declarator) =>
					(declarator.id as Syntax).type === 'Identifier' &&
					(!declarator.init || inertValue(declarator.init as Syntax, scope)),
			);
		case 'ExpressionStatement':
			return typeof node.directive === 'string';
		default:
			return false;
	}
}

// Reads no binding a cycle could leave uninitialized; the only calls allowed go to a dependency-free chunk.
function inertValue(node: Syntax, scope: TopLevelScope): boolean {
	switch (node.type) {
		case 'Literal':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return true;
		case 'TemplateLiteral':
			return !(node.expressions as unknown[]).length;
		case 'ParenthesizedExpression':
			return inertValue(node.expression as Syntax, scope);
		case 'MemberExpression': {
			let object = node as Syntax;
			while (object.type === 'MemberExpression' && !object.computed)
				object = object.object as Syntax;
			return object.type === 'Identifier' && !scope.declared.has(object.name as string);
		}
		case 'ObjectExpression':
			return (node.properties as Syntax[]).every(
				(property) =>
					property.type === 'Property' &&
					!property.computed &&
					inertValue(property.value as Syntax, scope),
			);
		case 'CallExpression':
			return (
				(node.callee as Syntax).type === 'Identifier' &&
				scope.leafImports.has((node.callee as { name: string }).name) &&
				(node.arguments as Syntax[]).every((argument) => inertValue(argument, scope))
			);
		default:
			return false;
	}
}

function createPackedNamespace(bindings: Record<string, unknown>): object {
	const keys = Object.keys(bindings).sort();
	const target = Object.create(null);
	for (const key of keys)
		Object.defineProperty(target, key, {
			writable: true,
			enumerable: true,
			configurable: false,
		});
	Object.defineProperty(target, Symbol.toStringTag, { value: 'Module' });
	Object.preventExtensions(target);
	return new Proxy(target, {
		get(target, key) {
			return key in bindings ? Reflect.get(bindings, key) : Reflect.get(target, key);
		},
		getOwnPropertyDescriptor(target, key) {
			const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
			if (descriptor && typeof key === 'string')
				descriptor.value = Reflect.get(bindings, key);
			return descriptor;
		},
		defineProperty(target, key, descriptor) {
			if (!(key in bindings)) return Reflect.defineProperty(target, key, descriptor);
			return (
				descriptor.configurable !== true &&
				descriptor.enumerable !== false &&
				descriptor.writable !== false &&
				!('get' in descriptor) &&
				!('set' in descriptor) &&
				(!('value' in descriptor) ||
					Object.is(descriptor.value, Reflect.get(bindings, key)))
			);
		},
		set() {
			return false;
		},
		ownKeys() {
			return [...keys, Symbol.toStringTag];
		},
	});
}

// Chunk file names are emission-ordered placeholders here, so identity uses module ids and export names.
function facadeIdentity(
	chunk: Chunk,
	exports: readonly [string, Binding][],
	calls: readonly Binding[],
	root: string | undefined,
): string {
	const module = chunk.facadeModuleId
		? root && chunk.facadeModuleId.startsWith(root)
			? relative(root, chunk.facadeModuleId)
			: chunk.facadeModuleId
		: '';
	return [
		module,
		exports.map(([name, binding]) => `${name}=${binding.name}`).join(','),
		calls.map((binding) => binding.name).join(','),
	].join('\0');
}

function shortHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	hash >>>= 0;
	let name = '';
	for (let index = 0; index < 4; index++) {
		name += HASH_ALPHABET[hash % HASH_ALPHABET.length];
		hash = Math.floor(hash / HASH_ALPHABET.length);
	}
	return name;
}

// No "_": collision suffixes are "_<n>", so a suffixed name never equals another hash.
const HASH_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function dynamicImportsFromTree(chunk: Chunk): ChunkDynamicImport[] {
	const expressions: ChunkDynamicImport[] = [];
	const program = parseChunkCode(chunk.fileName, chunk.code).program;
	walk(program, textOffsets(chunk.code, 'import'), (node) => {
		if (node.type !== 'ImportExpression') return;
		const value = importSource(node);
		expressions.push({
			start: node.start!,
			end: node.end!,
			specifier: typeof value === 'string' ? value : undefined,
			plain: !(node.options || (node.phase && node.phase !== 'evaluation')),
		});
	});
	return expressions;
}

function exportSpecifiersFromTree(chunk: Chunk): Map<string, string> {
	const bindings = new Map<string, string>();
	for (const node of parseChunkCode(chunk.fileName, chunk.code).program.body) {
		if (node.type !== 'ExportNamedDeclaration' || node.source) continue;
		for (const specifier of node.specifiers) {
			if (specifier.local.type !== 'Identifier') continue;
			bindings.set(
				specifier.exported.type === 'Identifier'
					? specifier.exported.name
					: specifier.exported.value,
				specifier.local.name,
			);
		}
	}
	return bindings;
}

function importSource(node: Syntax): unknown {
	const source = node.source as Syntax;
	return source.type === 'Literal'
		? source.value
		: source.type === 'TemplateLiteral' && (source.expressions as unknown[]).length === 0
			? ((source.quasis as Syntax[])[0]?.value as { cooked?: string })?.cooked
			: undefined;
}

function resolve(importer: string, source: string): string {
	return source.startsWith('.') ? normalize(join(dirname(importer), source)) : source;
}

function hasTopLevelAwait(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	if (Array.isArray(value)) return value.some(hasTopLevelAwait);
	const node = value as Syntax;
	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	)
		return false;
	if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await))
		return true;
	return Object.values(node).some(hasTopLevelAwait);
}

function walk(value: unknown, offsets: readonly number[], visit: (node: Syntax) => void): void {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) if (mayHold(offsets, item)) walk(item, offsets, visit);
		return;
	}
	const node = value as Syntax;
	visit(node);
	for (const item of Object.values(node)) if (mayHold(offsets, item)) walk(item, offsets, visit);
}

function mayHold(offsets: readonly number[], value: unknown): boolean {
	return (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		spansAnyOffset(offsets, value)
	);
}
