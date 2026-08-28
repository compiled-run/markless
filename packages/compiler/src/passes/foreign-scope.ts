import type {
	PublicRenderModuleInput,
	SemanticGraphDependency,
	SemanticModuleImport,
	SemanticSharedDefinition,
	SemanticSharedModuleDeclaration,
} from '../artifacts.ts';
import type { CompilerDiagnostic } from '../diagnostics.ts';
import { asNodes, isNode, type AnyNode } from '../ast/nodes.ts';
import { parseModule } from '../js-ast.ts';
import { PUBLIC_RENDER_PLAN_PASS_ID } from './public-render/diagnostics.ts';
import {
	emitValueImport,
	moduleScopeDeclarations,
	publicRenderValueImports,
} from './public-render/shared.ts';

/** This pass owns the code; readers import it rather than restating the string. */
export const SHARED_COMPUTED_CROSS_MODULE_CODE = 'MARKLESS_SHARED_COMPUTED_CROSS_MODULE';

/** The file a `shared:<filename>#<name>/...` node was defined in. */
export function sharedDefinitionFilename(graphNodeId: string): string | null {
	const hash = graphNodeId.indexOf('#');
	return graphNodeId.startsWith('shared:') && hash !== -1
		? graphNodeId.slice('shared:'.length, hash)
		: null;
}

export type ForeignCopiedBody = {
	readonly graphNodeId: string;
	readonly name: string;
	readonly source: string;
	readonly definedIn: string;
	/**
	 * The names the copy still spells, when the text that ships is not the
	 * authored text. A client symbol module has had its graph reads rewritten
	 * away, so its free names are read off the emitted module rather than guessed
	 * from the authored expression.
	 */
	readonly freeNames?: ReadonlySet<string>;
};

/** One name a copied expression needs and the copying module cannot bind for it. */
export type ForeignScopeRefusal = {
	readonly body: ForeignCopiedBody;
	readonly name: string;
	readonly held: BindingOrigin | undefined;
};

/**
 * What a module has to emit beside a factory expression it copied out of another
 * file, and the names it cannot satisfy.
 *
 * The copy carries the authored text and the graph reads the compiler rewrote
 * into it, so every other name it spells belongs to the defining file's module
 * scope. The definition record carries that scope; this narrows it to the names
 * the copy actually spells, rebases relative specifiers onto the copying
 * module's own path, and drops what that module already binds from the same
 * place. A name the module binds from somewhere else cannot be carried at all -
 * one module scope cannot hold two of it - so that stays refused.
 *
 * The served module and the client symbol module copy the same expressions, so
 * they share this; each turns the refusals into its own diagnostics.
 */
export type CarriedForeignScope = {
	readonly importLines: ReadonlyArray<string>;
	readonly declarations: ReadonlyArray<string>;
	readonly refusals: ReadonlyArray<ForeignScopeRefusal>;
};

const emptyCarriedForeignScope: CarriedForeignScope = {
	importLines: [],
	declarations: [],
	refusals: [],
};

export function carryForeignFactoryScope(input: {
	readonly bodies: ReadonlyArray<ForeignCopiedBody>;
	readonly sharedDefinitions: ReadonlyArray<SemanticSharedDefinition>;
	readonly consumerOrigins: ReadonlyMap<string, BindingOrigin>;
	readonly consumerFilename: string;
}): CarriedForeignScope {
	const { bodies, consumerOrigins, consumerFilename } = input;
	if (bodies.length === 0) return emptyCarriedForeignScope;

	const definitionOf = (graphNodeId: string) =>
		input.sharedDefinitions.find((definition) => graphNodeId.startsWith(`${definition.id}/`));
	const importLines: string[] = [];
	const declarations: string[] = [];
	const refusals: ForeignScopeRefusal[] = [];
	const carried = new Map<string, CarriedBinding>();
	const refused = new Set<string>();

	const refuse = (body: ForeignCopiedBody, name: string, held: BindingOrigin | undefined) => {
		const key = `${body.graphNodeId} ${name}`;
		if (refused.has(key)) return;
		refused.add(key);
		refusals.push({ body, name, held });
	};

	for (const body of bodies) {
		const definition = definitionOf(body.graphNodeId);
		const needed = neededFactoryScope(definition, body);
		for (const name of needed.unsatisfied) refuse(body, name, consumerOrigins.get(name));

		for (const declaration of needed.declarations) {
			const origin: BindingOrigin = {
				key: `declaration:${body.definedIn}:${declaration.source}`,
				text: `a module-scope declaration in ${body.definedIn}`,
			};
			const blocked = declaration.names.flatMap((name) => {
				const held = carried.get(name)?.origin ?? consumerOrigins.get(name);
				return held && held.key !== origin.key ? [{ name, held }] : [];
			});
			if (blocked.length > 0) {
				for (const clash of blocked) refuse(body, clash.name, clash.held);
				continue;
			}
			if (declaration.names.every((name) => carried.has(name))) continue;
			declarations.push(declaration.source);
			for (const name of declaration.names) carried.set(name, { origin });
		}

		for (const moduleImport of needed.imports) {
			const origin = importOrigin(moduleImport, body.definedIn);
			const held =
				carried.get(moduleImport.localName)?.origin ??
				consumerOrigins.get(moduleImport.localName);
			if (held) {
				if (held.key !== origin.key) refuse(body, moduleImport.localName, held);
				continue;
			}
			// A type-only binding satisfies the copied body's free name without
			// being emitted: it is erased before anything runs, and its specifier
			// need not have a runtime export behind it.
			if (moduleImport.typeOnly !== true) {
				importLines.push(
					emitValueImport({
						...moduleImport,
						source: rebaseSpecifier(moduleImport.source, body.definedIn, consumerFilename),
					}),
				);
			}
			carried.set(moduleImport.localName, { origin });
		}
	}

	return { importLines, declarations, refusals };
}

export type BindingOrigin = { readonly key: string; readonly text: string };
type CarriedBinding = { readonly origin: BindingOrigin };

/** Where each name the emitted server module binds at module scope comes from. */
export function consumerBindingOrigins(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, BindingOrigin> {
	const declarations = moduleScopeDeclarations(input.source.source, input.source.filename);
	return bindingOrigins({
		filename: input.source.filename,
		declarations,
		imports: publicRenderValueImports(
			input.semanticGraph.moduleImports,
			input.semanticGraph.componentEdges,
			declarations.map((declaration) => declaration.source).join('\n'),
		),
	});
}

/** The same question asked of any file: what its module scope binds, and from where. */
export function bindingOrigins(input: {
	readonly filename: string;
	readonly declarations: ReadonlyArray<SemanticSharedModuleDeclaration>;
	readonly imports: ReadonlyArray<SemanticModuleImport>;
}): ReadonlyMap<string, BindingOrigin> {
	const origins = new Map<string, BindingOrigin>();
	for (const declaration of input.declarations)
		for (const name of declaration.names)
			origins.set(name, {
				key: `declaration:${input.filename}:${declaration.source}`,
				text: 'a module-scope declaration in this file',
			});
	for (const moduleImport of input.imports)
		origins.set(moduleImport.localName, importOrigin(moduleImport, input.filename));
	return origins;
}

function importOrigin(moduleImport: SemanticModuleImport, ownerFilename: string): BindingOrigin {
	const resolved = resolveSpecifier(moduleImport.source, ownerFilename);
	const imported =
		moduleImport.kind === 'named'
			? (moduleImport.importedName ?? moduleImport.localName)
			: moduleImport.kind;
	return {
		key: `import:${resolved}:${moduleImport.kind}:${imported}`,
		text: `the ${moduleImport.kind} import "${imported}" of ${moduleImport.source}`,
	};
}

/**
 * The part of a factory's carried module scope one copied expression needs, and
 * the free names nothing in it explains. A carried declaration's own free names
 * join the search, so a module constant written out of another one arrives whole.
 */
function neededFactoryScope(
	definition: SemanticSharedDefinition | undefined,
	body: ForeignCopiedBody,
): {
	readonly imports: ReadonlyArray<SemanticModuleImport>;
	readonly declarations: ReadonlyArray<SemanticSharedModuleDeclaration>;
	readonly unsatisfied: ReadonlyArray<string>;
} {
	const scope = definition?.factoryModuleScope ?? [];
	const factoryImports = definition?.factoryModuleImports ?? [];
	const wanted = new Set(
		[...(body.freeNames ?? freeIdentifierNames(body.source))].filter(
			(name) => !isPlatformGlobal(name),
		),
	);
	const keptDeclarations = new Set<SemanticSharedModuleDeclaration>();
	const keptImports = new Set<SemanticModuleImport>();
	const satisfied = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of scope) {
			if (keptDeclarations.has(declaration)) continue;
			if (!declaration.names.some((name) => wanted.has(name))) continue;
			keptDeclarations.add(declaration);
			changed = true;
			for (const name of declaration.names) satisfied.add(name);
			for (const name of freeDeclarationNames(declaration.source))
				if (!isPlatformGlobal(name)) wanted.add(name);
		}
		for (const moduleImport of factoryImports) {
			if (keptImports.has(moduleImport) || !wanted.has(moduleImport.localName)) continue;
			keptImports.add(moduleImport);
			satisfied.add(moduleImport.localName);
			changed = true;
		}
	}
	return {
		// Emission order is the defining file's own, so a constant written out of
		// another one still comes after it and evaluates.
		imports: factoryImports.filter((moduleImport) => keptImports.has(moduleImport)),
		declarations: scope.filter((declaration) => keptDeclarations.has(declaration)),
		unsatisfied: [...wanted].filter((name) => !satisfied.has(name)),
	};
}

export function crossModuleRefusal(refusal: ForeignScopeRefusal): CompilerDiagnostic {
	const { body, name, held } = refusal;
	return {
		code: SHARED_COMPUTED_CROSS_MODULE_CODE,
		severity: 'error',
		phase: 'public-render',
		passId: PUBLIC_RENDER_PLAN_PASS_ID,
		artifactKeys: ['publicRenderModule'],
		title: `A shared() computed cannot be read from another module yet ("${body.name}")`,
		message: held
			? `Serving this page works "${body.name}" out by copying its expression from ${body.definedIn} into this file. The copied expression names "${name}", which ${body.definedIn} means as its own, and THIS file already binds "${name}" as ${held.text}; one module scope cannot hold both, and matched against it by name alone the served value would be built from this module's "${name}" rather than the one ${body.definedIn} means.`
			: `Serving this page works "${body.name}" out by copying its expression from ${body.definedIn} into this file. The copied expression names "${name}", and nothing in this module binds it, so rendering this page on the server would throw a ReferenceError.`,
		why: "A shared() factory has no instance on the server to ask for a computed value, so the server works the value out by copying the factory's own expression into the module of every page that reads it. The imports and module-scope constants that expression names travel with the definition and are emitted beside the copy, but a name this file already binds from somewhere else cannot be: the emitted module would bind it twice, and matching by name alone would build the served value from this module's value instead.",
		suggestions: [
			held
				? {
						message: `Rename this module's "${name}", or import it under another local name, so the one ${body.definedIn} means can be carried in beside the copy.`,
					}
				: {
						message: `Write "${body.name}" so it needs nothing from ${body.definedIn}'s module scope - out of the factory's own state and platform globals only - and it copies into any file unchanged.`,
					},
			{
				message: `Or read "${body.name}" from a part that ${body.definedIn} publishes and compose that part here. Inside its own module the same expression copies back into the scope it was written in.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${SHARED_COMPUTED_CROSS_MODULE_CODE}`,
	};
}

// ---------------------------------------------------------------------------
// A cell read the author spelled as a call.
//
// `computed(() => ...)` answers with the derived VALUE - its type is the value's
// own - so every read of it lowers to a read of the cell. An expression that
// spells one of its reads `loud()` therefore calls that value: the served module
// builds `const loud=read(...)` and calls the derived string, the browser module
// builds `context.graph.read(...)()`. Both throw a TypeError with nothing at
// build time to point at, so the shape is refused instead.
//
// A derive is not the only expression the compiler copies whole. An event
// handler, a callback prop, and a branch test each ship their authored text with
// their cell reads rewritten in the same way, so the same call has the same
// crash there; one detection covers them, and the public-render pass turns the
// refusals into the single diagnostic that stands in front of every emission.

/** This helper owns the code; readers import it rather than restating the string. */
export const COMPUTED_READ_CALLED_CODE = 'MARKLESS_COMPUTED_READ_CALLED';

/** What the compiler emits from the expression that spells the call. */
export type ComputedReadCallEmission =
	| { readonly kind: 'derive'; readonly name: string }
	/** A handler, callback prop, or branch test, named the way the author sees it. */
	| { readonly kind: 'callback'; readonly description: string };

/** One copied expression and the cell read inside it that is spelled as a call. */
export type ComputedReadCallRefusal = {
	readonly emission: ComputedReadCallEmission;
	/** The authored text of the read that is called, as the author wrote it. */
	readonly called: string;
};

/** One expression as the compiler copies it: authored text plus the cells it reads. */
export type ComputedReadingExpression = {
	/** Whatever identifies the expression to the compiler; only ever compared. */
	readonly id: string;
	readonly emission: ComputedReadCallEmission;
	readonly source: string;
	readonly reads: ReadonlyArray<Pick<SemanticGraphDependency, 'source' | 'graphNodeId'>>;
};

export function computedReadCallRefusals(input: {
	readonly expressions: ReadonlyArray<ComputedReadingExpression>;
	readonly computedGraphNodeIds: ReadonlySet<string>;
}): ReadonlyArray<ComputedReadCallRefusal> {
	const refusals: ComputedReadCallRefusal[] = [];
	const seen = new Set<string>();
	for (const expression of input.expressions) {
		const computedReads = expression.reads.flatMap((read) =>
			input.computedGraphNodeIds.has(read.graphNodeId) ? [read.source] : [],
		);
		if (computedReads.length === 0) continue;
		const called = calledSourceTexts(expression.source);
		for (const read of computedReads) {
			const key = `${expression.id} ${read}`;
			if (!called.has(read) || seen.has(key)) continue;
			seen.add(key);
			refusals.push({ emission: expression.emission, called: read });
		}
	}
	return refusals;
}

/** The callee text of every call the expression spells, minus names it binds itself. */
function calledSourceTexts(source: string): ReadonlySet<string> {
	const called = new Set<string>();
	const bound = new Set<string>();
	walkParsedNodes(`(${source})`, (node) => {
		if (BINDING_PARENT_TYPES.has(String(node.type))) collectPatternNames(node.id, bound);
		for (const parameter of asNodes(node.params)) collectPatternNames(parameter, bound);
		if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
		const text = staticCalleeText(node.callee);
		if (text !== null) called.add(text);
	});
	return new Set([...called].filter((text) => !bound.has(text.split('.')[0] ?? text)));
}

/** `loud` or `b.loud`, spelled the way a recorded read spells it; null for anything else. */
function staticCalleeText(node: unknown): string | null {
	if (!isNode(node)) return null;
	if (node.type === 'Identifier') return typeof node.name === 'string' ? node.name : null;
	if (node.type !== 'MemberExpression' || node.computed === true || node.optional === true) {
		return null;
	}
	const object = staticCalleeText(node.object);
	const property = isNode(node.property) ? staticCalleeText(node.property) : null;
	return object !== null && property !== null ? `${object}.${property}` : null;
}

function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

/** A relative specifier as a path from the project root; anything else unchanged. */
function resolveSpecifier(specifier: string, importerFilename: string): string {
	if (!isRelativeSpecifier(specifier)) return specifier;
	return normalizePathSegments([
		...importerFilename.split('/').slice(0, -1),
		...specifier.split('/'),
	]).join('/');
}

/** The same module the factory's file names, spelled from the copying file. */
export function rebaseSpecifier(
	specifier: string,
	fromFilename: string,
	toFilename: string,
): string {
	if (!isRelativeSpecifier(specifier)) return specifier;
	const target = resolveSpecifier(specifier, fromFilename).split('/');
	const base = normalizePathSegments(toFilename.split('/').slice(0, -1));
	let common = 0;
	while (common < base.length && common < target.length - 1 && base[common] === target[common])
		common += 1;
	const up = base.slice(common).map(() => '..');
	const down = target.slice(common);
	return up.length === 0 ? `./${down.join('/')}` : [...up, ...down].join('/');
}

function normalizePathSegments(segments: ReadonlyArray<string>): ReadonlyArray<string> {
	const parts: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') continue;
		if (segment !== '..') {
			parts.push(segment);
			continue;
		}
		if (parts.length > 0 && parts.at(-1) !== '..') parts.pop();
		else parts.push('..');
	}
	return parts;
}

// The compiler's own host answers for the platform names a derive may call;
// browser-only globals are absent there and are named instead.
const BROWSER_ONLY_GLOBALS: ReadonlySet<string> = new Set([
	'document',
	'getComputedStyle',
	'history',
	'localStorage',
	'location',
	'matchMedia',
	'requestAnimationFrame',
	'sessionStorage',
	'window',
]);

export function isPlatformGlobal(name: string): boolean {
	return BROWSER_ONLY_GLOBALS.has(name) || name in globalThis;
}

/** Every name the copied expression uses and does not itself bind. */
function freeIdentifierNames(source: string): ReadonlySet<string> {
	return freeNamesOfParse(`(${source})`);
}

/** The same, for a carried module-scope statement rather than an expression. */
function freeDeclarationNames(source: string): ReadonlySet<string> {
	return freeNamesOfParse(source);
}

function freeNamesOfParse(source: string): ReadonlySet<string> {
	const bound = new Set<string>();
	const referenced = new Set<string>();
	walkParsedNodes(source, (node) => {
		if (node.type === 'Identifier') {
			if (typeof node.name === 'string') referenced.add(node.name);
			return;
		}
		if (BINDING_PARENT_TYPES.has(String(node.type))) collectPatternNames(node.id, bound);
		for (const parameter of asNodes(node.params)) collectPatternNames(parameter, bound);
	});
	return new Set([...referenced].filter((name) => !bound.has(name)));
}

/** Every value-position node of `source`, once each, parents before children. */
function walkParsedNodes(source: string, visit: (node: AnyNode) => void): void {
	let ast: AnyNode;
	try {
		ast = parseModule(source, 'generated.ts') as unknown as AnyNode;
	} catch {
		// Text the compiler just built and cannot reparse is a different defect;
		// it is no evidence of this one, so claim nothing.
		return;
	}
	const seen = new Set<object>();
	const stack: unknown[] = [ast];
	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object' || seen.has(value)) continue;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}
		const node = value as AnyNode;
		visit(node);
		if (node.type === 'Identifier') continue;
		for (const [key, child] of Object.entries(node)) {
			if (WALK_IGNORED_KEYS.has(key)) continue;
			if (node.computed !== true && key === 'property' && node.type === 'MemberExpression')
				continue;
			if (node.computed !== true && key === 'key' && node.type === 'Property') continue;
			stack.push(child);
		}
	}
}

const BINDING_PARENT_TYPES: ReadonlySet<string> = new Set([
	'VariableDeclarator',
	'FunctionDeclaration',
	'FunctionExpression',
	'ClassDeclaration',
	'ClassExpression',
]);

// Side tables, back-pointers, and the type positions, which name types rather
// than values a copied expression has to find while the page is served.
const WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'parent',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'comments',
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
	'superTypeArguments',
]);

/** Every name a binding pattern introduces, destructuring included. */
function collectPatternNames(pattern: unknown, into: Set<string>): void {
	if (!isNode(pattern)) return;
	if (pattern.type === 'Identifier' && typeof pattern.name === 'string') {
		into.add(pattern.name);
		return;
	}
	if (pattern.type === 'AssignmentPattern') return collectPatternNames(pattern.left, into);
	if (pattern.type === 'RestElement') return collectPatternNames(pattern.argument, into);
	if (pattern.type === 'ArrayPattern') {
		for (const element of asNodes(pattern.elements)) collectPatternNames(element, into);
		return;
	}
	if (pattern.type === 'ObjectPattern')
		for (const property of asNodes(pattern.properties))
			collectPatternNames(
				property.type === 'RestElement' ? property.argument : property.value,
				into,
			);
}
