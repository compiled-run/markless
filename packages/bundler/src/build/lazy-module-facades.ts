import { basename, dirname, join, normalize, relative } from 'pathe';
import {
	type ChunkDynamicImport,
	chunkDynamicImports,
	clearChunkFactCaches,
	chunkLocalExportSpecifiers,
	mayContainDynamicImport,
	parseChunkCode,
	prefetchChunkParses,
	readChunkDynamicImports,
	readChunkLocalExportSpecifiers,
	rememberChunkDynamicImports,
	rememberChunkLocalExportSpecifiers,
	renderedChunkCount,
	spansAnyOffset,
	textOffsets,
} from './chunk-ast.ts';
import { RolldownMagicString, type Plugin } from 'rolldown';
import { CHUNK_WORKER_MIN_CODE_LENGTH, runChunkTask } from './chunk-workers.ts';
import { PACK_LOAD, PACK_LOADER_PREFIX } from './pack-loader-names.ts';
import { rootRelativeId } from '../module-id.ts';
import { withoutMachinePaths } from './machine-paths.ts';
import { packOfPiece, startupPackOfLazy } from './route-pack-groups.ts';
import { warmPacksSuffix } from './warm-packs.ts';
import {
	NAMESPACE_HELPER,
	type NamespaceLoad,
	type NamespaceObject,
	crossChunkNamespaceLoad,
	namespaceLoadTexts,
	namespaceObjects,
	namespaceOwners,
	sameChunkLoadCandidates,
	sameChunkNamespaceLoads,
} from './namespace-lazy-loads.ts';

export function lazyModuleFacadesPlugin(
	root: () => string = () => '',
	packOf?: (moduleId: string) => string | undefined,
	packRoutes?: (pack: string) => ReadonlyArray<string> | undefined,
	eagerLazyRoutes?: (lazyPack: string) => ReadonlyArray<string> | undefined,
	namespaceLoads: () => ((moduleId: string) => boolean) | undefined = () => () => true,
): Plugin & { readonly api: { removedChunks(): ReadonlySet<string> } } {
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
		droppedNamespaceChars.clear();
		collapsedLoadChars.clear();
	};
	return {
		name: 'markless-lazy-module-facades',
		api: { removedChunks: () => removed },
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
				namespaceModules: code.includes(NAMESPACE_HELPER)
					? namespaceOwners(chunk.modules)
					: undefined,
			};
			return new Promise((resolve, reject) => {
				pending.set(chunk.fileName, { resolve, reject });
				// Rolldown renders chunks concurrently; collect their code before changing cross-chunk imports.
				if (pending.size !== renderedChunkCount(meta.chunks)) return;
				const collapse = () => {
					try {
						const results = new Map<string, { code: string; map: string | null }>();
						chunks = Object.fromEntries(
							Object.entries(chunks).sort(([a], [b]) => localeOrder(a, b)),
						);
						const originals = new Map(
							Object.values(chunks).map((item) => [item.fileName, item.code]),
						);
						const edits = new Map<
							string,
							{ replacements: Replacement[]; suffix: string }
						>();
						removed = new Set(
							collapseLazyModuleFacades(
								chunks,
								(chunk, replacements, suffix) =>
									edits.set(chunk.fileName, { replacements, suffix }),
								{
									root: root(),
									packOf,
									packRoutes,
									eagerLazyRoutes,
									namespaceLoads: namespaceLoads(),
								},
							).removed,
						);
						const prefixes = buildPathIdentifierPrefixes(root());
						const strip = (text: string) =>
							prefixes.reduce(
								(result, prefix) => result.replaceAll(prefix, ''),
								text,
							);
						for (const [fileName, original] of originals) {
							if (removed.has(fileName)) continue;
							const edit = edits.get(fileName);
							const replacements = edit?.replacements ?? [];
							const rootless: Replacement[] = [];
							for (const prefix of prefixes)
								for (
									let start = original.indexOf(prefix);
									start !== -1;
									start = original.indexOf(prefix, start + prefix.length)
								) {
									const end = start + prefix.length;
									if (
										![...replacements, ...rootless].some(
											(item) => start < item.end && item.start < end,
										)
									)
										rootless.push({ start, end, source: '' });
								}
							if (!edit && rootless.length === 0) continue;
							const source = new RolldownMagicString(original);
							for (const replacement of replacements)
								source.overwrite(
									replacement.start,
									replacement.end,
									strip(replacement.source),
								);
							for (const range of rootless) source.remove(range.start, range.end);
							source.append(strip(edit?.suffix ?? ''));
							results.set(fileName, {
								code: source.toString(),
								map: options.sourcemap
									? source.generateMap({ hires: true }).toString()
									: null,
							});
						}
						for (const [name, wait] of pending) wait.resolve(results.get(name) ?? null);
						pending.clear();
					} catch (error) {
						for (const wait of pending.values()) wait.reject(error);
						pending.clear();
					}
				};
				void Promise.all([
					prefetchChunkParses(
						Object.values(chunks).filter(
							(item) => !item.moduleIds.length || mayContainDynamicImport(item.code),
						),
					),
					prefetchFacadeChunkFacts(Object.values(chunks)),
				]).then(() => {
					collapse();
					clearFacadeChunkFacts();
					clearChunkFactCaches();
				});
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

// Packed init exports are named after virtual ids, which embed the build machine's absolute path;
// sources outside the root (a linked workspace package) share one of its ancestors, longest first.
function buildPathIdentifierPrefixes(root: string): string[] {
	const segments = root.split('/').filter(Boolean);
	const prefixes: string[] = [];
	for (let length = segments.length; length >= 2; length--)
		prefixes.push(
			encodeURIComponent(`/${segments.slice(0, length).join('/')}/`).replace(/[^\w$]/g, '_'),
		);
	return prefixes;
}

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
	// The module each `__exportAll` namespace object of the chunk belongs to.
	namespaceModules?: Readonly<Record<string, string>>;
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
		readonly eagerLazyRoutes?: (lazyPack: string) => ReadonlyArray<string> | undefined;
		/** Which modules' lazy loads Rolldown writes as namespace reads to collapse too, not only facade chunks. */
		readonly namespaceLoads?: (moduleId: string) => boolean;
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
			const facts = chunkInertness(chunk.fileName, renderedCode.get(fileName)!);
			own =
				facts.inert &&
				facts.leafSources.every((source) => {
					const from = chunks.get(resolve(fileName, source));
					return !!from && !from.imports.length && inertClosure(from.fileName, new Set());
				});
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
				result = code !== undefined && chunkTopLevelAwait(fileName, code);
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
				chunkLocalExportSpecifiers(target.fileName, target.code) ??
				exportSpecifiersFromTree(target);
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
	const namespaceRemovals = options.namespaceLoads
		? collectNamespaceLoads(chunks, imports, pending, options.namespaceLoads, options.root)
		: new Map<string, Replacement[]>();
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
			reserved = [...new Set(target.code.match(PACKED_NAME_PATTERN) ?? [])];
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
		const loader = reserve(facade.target, `${PACK_LOADER_PREFIX}${shortHash(facade.identity)}`);
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
			// Loader state lives on the function, so an unevaluated loader adds no top-level statement.
			`export function ${loader}(){const state=${loader}.state;if(state){if(state.failed)throw state.error;return state.value}try{${facade.calls.map((name) => `${name}();`).join('')}return(${loader}.state={value:${namespace}({__proto__:null,${facade.exports.map(([name, local]) => `get ${JSON.stringify(name)}(){return ${local}}`).join(',')}})}).value}catch(error){throw(${loader}.state={failed:true,error}).error}}`,
		);
		additions.set(facade.target.fileName, declarations);
		facade.target.exports.push(loader);
		const original = chunks.get(fileName);
		if (original?.facadeModuleId && !facade.target.moduleIds.includes(original.facadeModuleId))
			facade.target.moduleIds.push(original.facadeModuleId);
	}
	// A pack only some routes preload, loaded from code other routes run too, is evaluated by those routes' own packs.
	const routeChunks = new Map<string, Chunk[]>();
	for (const chunk of chunks.values()) {
		const pack = packs.get(chunk.fileName);
		if (pack?.startsWith('route:') && !facades.has(chunk.fileName))
			routeChunks.set(pack.slice(6), [...(routeChunks.get(pack.slice(6)) ?? []), chunk]);
	}
	const evaluatedByRoute = new Map<string, Set<Chunk>>();
	for (const chunk of chunks.values()) {
		if (facades.has(chunk.fileName) || !usesRegistry(chunk)) continue;
		for (const node of imports.get(chunk.fileName) ?? []) {
			const value = node.specifier;
			const facade = typeof value === 'string' && facades.get(resolve(chunk.fileName, value));
			if (
				!facade ||
				facade.target === chunk ||
				awaiting.has(facade.target.fileName) ||
				evaluatesWith(chunk, facade.target, packs, awaiting, options.packRoutes) ||
				!inertClosure(facade.target.fileName)
			)
				continue;
			const to = packs.get(facade.target.fileName);
			const toRoutes = to?.startsWith('shared:') ? options.packRoutes?.(to) : undefined;
			for (const route of toRoutes ?? [])
				for (const evaluator of routeChunks.get(route) ?? [])
					if (evaluator !== facade.target)
						evaluatedByRoute.set(
							evaluator.fileName,
							new Set([
								...(evaluatedByRoute.get(evaluator.fileName) ?? []),
								facade.target,
							]),
						);
		}
	}
	// A route whose first event needs a lazy sibling at once evaluates it with its own route pack, as if never cut.
	const eagerImports = new Map<string, Chunk[]>();
	for (const target of chunks.values()) {
		const name = options.eagerLazyRoutes && ownPack(target, options.packOf);
		if (!name || startupPackOfLazy(name) === name || facades.has(target.fileName)) continue;
		const routes = options.eagerLazyRoutes!(name);
		if (!routes?.length || !inertClosure(target.fileName)) continue;
		for (const route of routes)
			for (const evaluator of routeChunks.get(route) ?? []) {
				const own = ownPack(evaluator, options.packOf);
				if (evaluator === target || !own || startupPackOfLazy(own) !== own) continue;
				eagerImports.set(evaluator.fileName, [
					...(eagerImports.get(evaluator.fileName) ?? []),
					target,
				]);
			}
	}
	for (const [fileName, loaders] of registered)
		additions.get(fileName)!.push(`${PACK_REGISTRATION}={${[...loaders].join(',')}};`);
	for (const chunk of chunks.values()) {
		if (facades.has(chunk.fileName)) continue;
		const replacements: Replacement[] = [...(namespaceRemovals.get(chunk.fileName) ?? [])];
		const lookup = usesRegistry(chunk);
		const evaluated = new Set<Chunk>(evaluatedByRoute.get(chunk.fileName));
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
		const eager = eagerImports.get(chunk.fileName) ?? [];
		for (const target of eager) {
			evaluated.delete(target);
			if (!chunk.imports.includes(target.fileName)) chunk.imports.push(target.fileName);
		}
		const suffix = [
			...eager.map((target) => {
				const path = relative(dirname(chunk.fileName), target.fileName);
				return `import${JSON.stringify(path.startsWith('.') ? path : `./${path}`)};`;
			}),
			...(additions.get(chunk.fileName) ?? []),
			...(lookup && replacements.some(({ source }) => source.startsWith(PACK_LOAD))
				? [PACK_LOAD_SOURCE]
				: []),
			...(evaluated.size
				? [
						warmPacksSuffix(
							[...evaluated].map((target) => {
								const path = relative(dirname(chunk.fileName), target.fileName);
								return path.startsWith('.') ? path : `./${path}`;
							}),
						),
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
	return { removed: [...facades.keys()].filter((name) => !isNamespaceLoadKey(name)) };
}

// A pack registers its loaders when it evaluates, because import() of an evaluated module still resolves a task later.
export const PACK_REGISTRY = '__marklessPacks';
export const PACK_REGISTRATION = `(globalThis.${PACK_REGISTRY}??={})[import.meta.url]`;
const PACKED_NAME_PATTERN = /\$ml[\w$]*|__marklessNamespace[\w$]*/g;
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
			(from !== 'shared' &&
				!!toRoutes &&
				!!routes(from)?.every((route) => toRoutes.includes(route)))) &&
		target !== importer &&
		!awaiting.has(target.fileName)
	);
}

// The route a pack serves, 'shared' for every route or a shared:<id> pack for some; undefined outside the planned packs.
// A lazy sibling pack serves the routes of the pack it was cut from.
function chunkPack(
	chunk: Chunk,
	packOf: ((moduleId: string) => string | undefined) | undefined,
): string | undefined {
	const names = new Set(chunk.moduleIds.map((id) => startupPackOfLazy(packOf?.(id) ?? '')));
	const [name] = names;
	return names.size === 1
		? /^(route:.+|shared(?::[0-9a-z]+)?)$/.exec(packOfPiece(name ?? ''))?.[1]
		: undefined;
}

// The one planned pack every module of a chunk belongs to, lazy siblings named as such.
function ownPack(
	chunk: Chunk,
	packOf: ((moduleId: string) => string | undefined) | undefined,
): string | undefined {
	const names = new Set(
		chunk.moduleIds.map((id) => {
			const pack = packOf?.(id);
			return pack === undefined ? undefined : packOfPiece(pack);
		}),
	);
	const [name] = names;
	return names.size === 1 ? name : undefined;
}

type TopLevelScope = {
	readonly declared: Set<string>;
	readonly leafImports: { has(name: string): boolean };
};

// Whether a chunk's top level is inert holds on its own code, except that a call may only go to an
// import from a dependency-free chunk: those import sources come back for the caller to check.
export type ChunkInertness =
	| { readonly inert: false }
	| { readonly inert: true; readonly leafSources: readonly string[] };

const inertnessByCode = new Map<string, ChunkInertness>();
const topLevelAwaitByCode = new Map<string, boolean>();

function chunkInertness(fileName: string, code: string): ChunkInertness {
	return inertnessByCode.get(code) ?? readChunkInertness(fileName, code);
}

function chunkTopLevelAwait(fileName: string, code: string): boolean {
	return topLevelAwaitByCode.get(code) ?? readChunkTopLevelAwait(fileName, code);
}

export function readChunkInertness(fileName: string, code: string): ChunkInertness {
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length) return { inert: false };
	const body = parsed.program.body as Syntax[];
	const leafSources = new Set<string>();
	const scope = topLevelScope(body, leafSources);
	return body.every((node) => inertStatement(node, scope))
		? { inert: true, leafSources: [...leafSources] }
		: { inert: false };
}

export function readChunkTopLevelAwait(fileName: string, code: string): boolean {
	return (
		code.includes('await') &&
		mayContainDynamicImport(code) &&
		hasTopLevelAwait(parseChunkCode(fileName, code).program)
	);
}

/** Everything the facade collapse reads from one chunk's code, from a single parse. */
export function facadeChunkFacts(fileName: string, code: string) {
	return {
		dynamicImports: mayContainDynamicImport(code)
			? readChunkDynamicImports(fileName, code)
			: undefined,
		localExportSpecifiers: readChunkLocalExportSpecifiers(fileName, code),
		inertness: readChunkInertness(fileName, code),
		topLevelAwait: readChunkTopLevelAwait(fileName, code),
		sameChunkLoadStarts: readSameChunkLoadStarts(fileName, code),
	};
}

const sameChunkLoadStartsByCode = new Map<string, readonly number[]>();

function sameChunkLoadStarts(fileName: string, code: string): readonly number[] {
	return sameChunkLoadStartsByCode.get(code) ?? readSameChunkLoadStarts(fileName, code);
}

// A same-pack load is matched as text, so only the matches that are calls in the tree count.
export function readSameChunkLoadStarts(fileName: string, code: string): number[] {
	const candidates = sameChunkLoadCandidates(code);
	if (!candidates.length) return [];
	const spans = new Set(candidates.map(({ start, end }) => `${start}:${end}`));
	const starts: number[] = [];
	walk(
		parseChunkCode(fileName, code).program,
		candidates.map(({ start }) => start),
		(node) => {
			if (node.type === 'CallExpression' && spans.has(`${node.start}:${node.end}`))
				starts.push(node.start!);
		},
	);
	return starts;
}

/** Reads every large chunk's facade facts on the chunk workers, so the collapse finds them cached. */
export async function prefetchFacadeChunkFacts(
	chunks: Iterable<{ readonly fileName: string; readonly code: string }>,
): Promise<void> {
	await Promise.all(
		[...chunks]
			.filter((chunk) => chunk.code.length >= CHUNK_WORKER_MIN_CODE_LENGTH)
			.map((chunk) =>
				runChunkTask('facadeChunkFacts', chunk.fileName, chunk.code).then(
					(facts) => {
						if (
							facts.dynamicImports !== undefined ||
							mayContainDynamicImport(chunk.code)
						)
							rememberChunkDynamicImports(
								chunk.fileName,
								chunk.code,
								facts.dynamicImports,
							);
						rememberChunkLocalExportSpecifiers(
							chunk.fileName,
							chunk.code,
							facts.localExportSpecifiers,
						);
						inertnessByCode.set(chunk.code, facts.inertness);
						topLevelAwaitByCode.set(chunk.code, facts.topLevelAwait);
						sameChunkLoadStartsByCode.set(chunk.code, facts.sameChunkLoadStarts);
					},
					// A read that throws is left to the synchronous path, which reports it where it did.
					() => {},
				),
			),
	);
}

export function clearFacadeChunkFacts(): void {
	inertnessByCode.clear();
	topLevelAwaitByCode.clear();
	sameChunkLoadStartsByCode.clear();
}

function topLevelScope(body: Syntax[], leafSources: Set<string>): TopLevelScope {
	const declared = new Set<string>();
	const importSources = new Map<string, string>();
	for (const node of body) {
		const declaration = (node.type === 'ExportNamedDeclaration' ? node.declaration : node) as
			| Syntax
			| undefined;
		if (node.type === 'ImportDeclaration') {
			const source = (node.source as { value: string }).value;
			for (const specifier of node.specifiers as { local: { name: string } }[]) {
				declared.add(specifier.local.name);
				importSources.set(specifier.local.name, source);
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
	return {
		declared,
		leafImports: {
			has(name) {
				const source = importSources.get(name);
				if (source === undefined) return false;
				leafSources.add(source);
				return true;
			},
		},
	};
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
	const module = chunk.facadeModuleId ? rootRelativeId(chunk.facadeModuleId, root) : '';
	return withoutMachinePaths(
		[
			module,
			exports.map(([name, binding]) => `${name}=${binding.name}`).join(','),
			calls.map((binding) => binding.name).join(','),
		].join('\0'),
		root,
	);
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

const NAMESPACE_LOAD_KEY = '\0markless-namespace-load:';

// Per module, the chars of namespace objects the last render dropped; Rolldown's per-module code still holds them.
const droppedNamespaceChars = new Map<string, number>();

// The chars each collapsed namespace load's text adds over the facade load it replaced.
const collapsedLoadChars = new Map<string, number>();

/** Chars of a module's rendered code that the facade pass removed again: namespace objects and namespace loads. */
export function collapsedGlueLength(moduleId: string, code: string): number {
	let glue = droppedNamespaceChars.get(moduleId) ?? 0;
	for (const text of namespaceLoadTexts(code)) glue += collapsedLoadChars.get(text) ?? 0;
	return glue;
}

function isNamespaceLoadKey(name: string): boolean {
	return name.startsWith(NAMESPACE_LOAD_KEY);
}

// Rolldown drops a grouped module's facade chunk and reads its namespace object from the pack instead.
// Each such read becomes a facade entry the collapse below turns into a loader, as it does a facade chunk;
// returns the edits that drop namespace objects no other code reads.
function collectNamespaceLoads(
	chunks: ReadonlyMap<string, Chunk>,
	imports: Map<string, readonly ChunkDynamicImport[]>,
	pending: PendingFacade[],
	collapses: (moduleId: string) => boolean,
	root: string | undefined,
): Map<string, Replacement[]> {
	const namespaces = new Map<string, Map<string, NamespaceObject>>();
	const namespacesOf = (chunk: Chunk) => {
		let found = namespaces.get(chunk.fileName);
		if (!found) namespaces.set(chunk.fileName, (found = namespaceObjects(chunk.code)));
		return found;
	};
	const exportsOf = new Map<string, Map<string, string> | undefined>();
	const localExports = (chunk: Chunk) => {
		if (!exportsOf.has(chunk.fileName))
			exportsOf.set(
				chunk.fileName,
				chunkLocalExportSpecifiers(chunk.fileName, chunk.code) ??
					exportSpecifiersFromTree(chunk),
			);
		return exportsOf.get(chunk.fileName);
	};
	type Read = { readonly target: Chunk; readonly local: string };
	const reads = new Map<string, Read>();
	const initOf = new Map<string, string | null>();
	// Per chunk, how many collapsed loads read each namespace name, whichever pack it names.
	const siteNames = new Map<string, Map<string, number>>();
	// Per chunk, where each import() a collapsed load replaces starts.
	const collapsed = new Map<string, Set<number>>();
	for (const chunk of chunks.values()) {
		const loads: { load: NamespaceLoad; target: Chunk; read?: number }[] = [];
		// The parser's module record can list one import() twice.
		const seen = new Set<number>();
		for (const expression of imports.get(chunk.fileName) ?? []) {
			if (
				expression.specifier === undefined ||
				!expression.plain ||
				seen.has(expression.start)
			)
				continue;
			seen.add(expression.start);
			const target = chunks.get(resolve(chunk.fileName, expression.specifier));
			if (!target || target === chunk || !target.moduleIds.length) continue;
			const load = crossChunkNamespaceLoad(chunk.code, expression.start, expression.end);
			if (load) loads.push({ load, target, read: expression.end });
		}
		const sameChunk = sameChunkNamespaceLoads(chunk.code, namespacesOf(chunk));
		const calls = sameChunk.length ? sameChunkLoadStarts(chunk.fileName, chunk.code) : [];
		for (const load of sameChunk)
			if (calls.includes(load.start)) loads.push({ load, target: chunk });
		if (!loads.length) continue;
		const nodes = [...(imports.get(chunk.fileName) ?? [])];
		for (const { load, target, read } of loads) {
			const exported = target === chunk ? undefined : localExports(target);
			const local = target === chunk ? load.namespace : exported?.get(load.namespace);
			const init =
				load.init === undefined
					? null
					: target === chunk
						? load.init
						: exported?.get(load.init);
			const namespace = local === undefined ? undefined : namespacesOf(target).get(local);
			const owner = namespace && target.namespaceModules?.[namespace.local];
			if (
				!namespace ||
				owner === undefined ||
				!collapses(owner) ||
				init === undefined ||
				target.exports.includes('then') ||
				namespace.entries.some(([name]) => name === 'then' || /^(0|[1-9]\d*)$/.test(name))
			)
				continue;
			const key = `${NAMESPACE_LOAD_KEY}${target.fileName}#${namespace.local}`;
			if (!reads.has(key)) {
				reads.set(key, { target, local: namespace.local });
				initOf.set(key, init);
				// Identity reads the names a facade chunk would have imported, so loaders keep their names.
				const exportedAs = new Map<string, string>();
				for (const [name, bound] of localExports(target) ?? [])
					if (!exportedAs.has(bound)) exportedAs.set(bound, name);
				const bindings = new Map<string, string>();
				const bind = (local: string): Binding => {
					let name = exportedAs.get(local) ?? local;
					// `#` cannot start an identifier, so a local another local's export alias shadows keys apart.
					if ((bindings.get(name) ?? local) !== local) name = `#${local}`;
					bindings.set(name, local);
					return { from: target.fileName, name };
				};
				const calls = init ? [bind(init)] : [];
				const exports = namespace.entries
					.map(([name, value]): [string, Binding] => [name, bind(value)])
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
				pending.push({
					fileName: key,
					target,
					targetBindings: bindings,
					calls,
					exports,
					identity: facadeIdentity(
						{ facadeModuleId: owner } as Chunk,
						exports,
						calls,
						root,
					),
				});
			}
			if (target !== chunk) {
				const starts = collapsed.get(chunk.fileName) ?? new Set<number>();
				starts.add(load.start);
				collapsed.set(chunk.fileName, starts);
			}
			const names = siteNames.get(chunk.fileName) ?? new Map<string, number>();
			names.set(load.namespace, (names.get(load.namespace) ?? 0) + 1);
			siteNames.set(chunk.fileName, names);
			nodes.push({ start: load.start, end: load.end, specifier: key, plain: true });
			// A facade chunk's load was `import("./facade.js")`: what the namespace read writes beyond it.
			const text = chunk.code.slice(read ?? load.start, load.end);
			collapsedLoadChars.set(
				text,
				read === undefined
					? text.length - `import("./${basename(target.fileName)}")`.length
					: text.length,
			);
		}
		imports.set(chunk.fileName, nodes);
	}
	// Where each chunk's import() expressions start, by the chunk they load.
	const startsByTarget = new Map<string, Map<string, number[]>>();
	const importStarts = (reader: Chunk) => {
		let found = startsByTarget.get(reader.fileName);
		if (!found) {
			found = new Map();
			for (const expression of imports.get(reader.fileName) ?? []) {
				if (expression.specifier === undefined) continue;
				const target = resolve(reader.fileName, expression.specifier);
				found.set(target, [...(found.get(target) ?? []), expression.start]);
			}
			startsByTarget.set(reader.fileName, found);
		}
		return found;
	};
	return namespaceObjectEdits(
		chunks,
		reads,
		namespacesOf,
		localExports,
		initOf,
		siteNames,
		(reader, target) => {
			const starts = collapsed.get(reader.fileName);
			return (importStarts(reader).get(target.fileName) ?? []).every(
				(start) => !!starts?.has(start),
			);
		},
		root,
	);
}

// A facade chunk imported the bindings its loader reads, so Rolldown exported them from the pack; later
// passes read those exports. Keeps that, and drops namespace objects nothing but the collapsed loads read.
function namespaceObjectEdits(
	chunks: ReadonlyMap<string, Chunk>,
	reads: ReadonlyMap<
		string,
		{
			readonly target: Chunk;
			readonly local: string;
		}
	>,
	namespacesOf: (chunk: Chunk) => ReadonlyMap<string, NamespaceObject>,
	localExports: (chunk: Chunk) => ReadonlyMap<string, string> | undefined,
	initOf: ReadonlyMap<string, string | null>,
	siteNames: ReadonlyMap<string, ReadonlyMap<string, number>>,
	onlyCollapsedLoads: (reader: Chunk, target: Chunk) => boolean,
	root: string | undefined,
): Map<string, Replacement[]> {
	const sitesNaming = (chunk: Chunk, name: string) =>
		siteNames.get(chunk.fileName)?.get(name) ?? 0;
	const readers = new Map<string, Set<Chunk>>();
	for (const chunk of chunks.values())
		for (const name of [...chunk.imports, ...chunk.dynamicImports]) {
			const set = readers.get(name) ?? new Set();
			set.add(chunk);
			readers.set(name, set);
		}
	const counts = new Map<string, Map<string, number>>();
	const countIn = (chunk: Chunk, name: string) => {
		let found = counts.get(chunk.fileName);
		if (!found) {
			found = new Map();
			for (const match of chunk.code.matchAll(NAMESPACE_NAME))
				found.set(match[0], (found.get(match[0]) ?? 0) + 1);
			counts.set(chunk.fileName, found);
		}
		return found.get(name) ?? 0;
	};
	const byTarget = new Map<
		Chunk,
		{ added: Set<string>; dropped: NamespaceObject[]; droppedNames: Set<string> }
	>();
	for (const [key, { target, local }] of reads) {
		const edit = byTarget.get(target) ?? {
			added: new Set(),
			dropped: [],
			droppedNames: new Set(),
		};
		byTarget.set(target, edit);
		const namespace = namespacesOf(target).get(local)!;
		for (const [, value] of namespace.entries)
			if (/^[A-Za-z_$][\w$]*$/.test(value)) edit.added.add(value);
		const init = initOf.get(key);
		if (init) edit.added.add(init);
		if (!NAMESPACE_NAME_EXACT.test(local)) continue;
		const exportedAs = [...(localExports(target) ?? [])]
			.filter(([, bound]) => bound === local)
			.map(([name]) => name);
		if (exportedAs.some((name) => !NAMESPACE_NAME_EXACT.test(name))) continue;
		// The declaration, its export specifiers, and the collapsed loads are all the code reading it.
		if (countIn(target, local) !== 1 + exportedAs.length + sitesNaming(target, local)) continue;
		if (
			[...(readers.get(target.fileName) ?? [])].some(
				(reader) =>
					(reader !== target &&
						reader.dynamicImports.includes(target.fileName) &&
						!onlyCollapsedLoads(reader, target)) ||
					(reader.imports.includes(target.fileName) &&
						importsAnyOf(reader, target, exportedAs)),
			)
		)
			continue;
		edit.dropped.push(namespace);
		for (const name of exportedAs) edit.droppedNames.add(name);
	}
	// The runtime chunk each chunk imports the namespace helper from.
	const helperImporters = new Map<string, Set<string>>();
	for (const chunk of chunks.values()) {
		const helper = chunk.code.includes(NAMESPACE_HELPER)
			? [...chunk.code.matchAll(HELPER_IMPORT_STATEMENT)].at(-1)
			: undefined;
		if (!helper) continue;
		const runtime = resolve(chunk.fileName, JSON.parse(helper[2]!) as string);
		const set = helperImporters.get(runtime) ?? new Set();
		set.add(chunk.fileName);
		helperImporters.set(runtime, set);
	}
	const edits = new Map<string, Replacement[]>();
	for (const [target, { added, dropped, droppedNames }] of byTarget) {
		const exported = localExports(target) ?? new Map<string, string>();
		const bound = new Set(exported.values());
		const additions = [...added].filter((local) => !bound.has(local) && !exported.has(local));
		const statement = [...target.code.matchAll(EXPORT_STATEMENT)].at(-1);
		if (!statement && (droppedNames.size || additions.length)) continue;
		const list: Replacement[] = [];
		if (statement) {
			const specifiers = statement[1]!
				.split(', ')
				.filter((specifier) => !droppedNames.has(specifierExportName(specifier)));
			const next = [...specifiers, ...additions].sort((a, b) =>
				compareText(specifierExportName(a), specifierExportName(b)),
			);
			const open = statement.index + 'export { '.length;
			if (next.join(', ') !== statement[1])
				list.push(
					next.length
						? { start: open, end: open + statement[1]!.length, source: next.join(', ') }
						: {
								start: statement.index,
								end: statement.index + statement[0].length,
								source: '',
							},
				);
		}
		for (const namespace of dropped) {
			list.push({ start: namespace.start, end: namespace.end, source: '' });
			const owner = target.namespaceModules?.[namespace.local];
			if (owner !== undefined)
				droppedNamespaceChars.set(
					owner,
					(droppedNamespaceChars.get(owner) ?? 0) +
						withoutMachinePaths(target.code.slice(namespace.start, namespace.end), root)
							.length,
				);
		}
		if (dropped.length && countIn(target, NAMESPACE_HELPER) === dropped.length + 1) {
			const helper = [...target.code.matchAll(HELPER_IMPORT_STATEMENT)].at(-1);
			if (helper) {
				const kept = helper[1]!.split(', ').filter((name) => name !== NAMESPACE_HELPER);
				const open = helper.index + 'import { '.length;
				if (kept.length < helper[1]!.split(', ').length)
					helperImporters
						.get(resolve(target.fileName, JSON.parse(helper[2]!) as string))
						?.delete(target.fileName);
				list.push(
					kept.length
						? { start: open, end: open + helper[1]!.length, source: kept.join(', ') }
						: {
								start: helper.index,
								end: helper.index + helper[0].length,
								source: `import ${helper[2]};`,
							},
				);
			}
		}
		target.exports = [
			...target.exports.filter((name) => !droppedNames.has(name)),
			...additions,
		];
		if (list.length) edits.set(target.fileName, list);
	}
	// A runtime chunk no chunk imports the helper from any longer stops exporting it, so minifying drops it.
	for (const [fileName, importers] of helperImporters) {
		const runtime = chunks.get(fileName);
		if (importers.size || !runtime || edits.has(fileName)) continue;
		const statement = [...runtime.code.matchAll(EXPORT_STATEMENT)].at(-1);
		const specifiers = statement?.[1]!.split(', ') ?? [];
		const kept = specifiers.filter((specifier) => specifier !== NAMESPACE_HELPER);
		if (!statement || !kept.length || kept.length === specifiers.length) continue;
		const open = statement.index + 'export { '.length;
		edits.set(fileName, [
			{ start: open, end: open + statement[1]!.length, source: kept.join(', ') },
		]);
		runtime.exports = runtime.exports.filter((name) => name !== NAMESPACE_HELPER);
	}
	return edits;
}

const NAMESPACE_NAME = /(?<![\w$])(?:[A-Za-z_$][\w$]*_exports(?:\$\d+)?|__exportAll)(?![\w$])/g;
const NAMESPACE_NAME_EXACT = /^[A-Za-z_$][\w$]*_exports(?:\$\d+)?$/;
const EXPORT_STATEMENT = /^export \{ ([^}]*) \};$/gm;
const HELPER_IMPORT_STATEMENT = /^import \{ ([^}]*\b__exportAll\b[^}]*) \} from ("[^"\n]+");$/gm;

// Whether a static import or re-export in `reader` names one of `names` from `target`.
function importsAnyOf(reader: Chunk, target: Chunk, names: readonly string[]): boolean {
	const path = relative(dirname(reader.fileName), target.fileName);
	const source = JSON.stringify(path.startsWith('.') ? path : `./${path}`);
	for (const match of reader.code.matchAll(STATIC_BINDINGS)) {
		if (match[2] !== source) continue;
		for (const specifier of match[1]!.split(',')) {
			const imported = specifier.trim().split(/\s+as\s+/)[0];
			if (imported && names.includes(imported)) return true;
		}
	}
	return false;
}

const STATIC_BINDINGS = /^(?:import|export) \{([^}]*)\} from ("[^"\n]+");$/gm;

function specifierExportName(specifier: string): string {
	const alias = / as ([\w$]+)$/.exec(specifier);
	return alias ? alias[1]! : specifier;
}
