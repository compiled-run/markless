import { readFileSync, readdirSync } from 'node:fs';
import {
	analyzeSources,
	declarationOf,
	docCommentAbove,
	type AstNode,
	type YukuAnalyzer,
	type YukuModule,
	type YukuSymbol,
} from './analyzer.ts';

export type PropEntry = {
	name: string;
	type: string;
	required: boolean;
	default?: string;
	doc?: string;
};

export type PartEntry = {
	part: string;
	component: string;
	doc?: string;
	props: PropEntry[];
};

export type FamilyEntry = { parts: PartEntry[] };

export type ApiManifest = Record<string, FamilyEntry>;

const SOURCE_ROOT = new URL('../src/', import.meta.url);

// The lanes that never ship: screen-reader and browser suites, reader
// transcripts, and the scenario apps they render.
const NON_SOURCE = /\.(browser|sr|nvda|voiceover)\.ts$|-transcript\.ts$/;

const readSource = (relativePath: string) =>
	readFileSync(new URL(relativePath, SOURCE_ROOT), 'utf8');

const collectSources = (): Map<string, string> => {
	const sources = new Map<string, string>();
	sources.set('index.ts', readSource('index.ts'));
	for (const familyDir of familyDirectories()) {
		for (const entry of readdirSync(new URL(`${familyDir}/`, SOURCE_ROOT), {
			withFileTypes: true,
		})) {
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsrx')) continue;
			if (NON_SOURCE.test(entry.name)) continue;
			const path = `${familyDir}/${entry.name}`;
			sources.set(path, readSource(path));
		}
	}

	return sources;
};

const familyDirectories = (): string[] =>
	readdirSync(SOURCE_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== 'scenarios')
		.map((entry) => entry.name)
		.filter((name) => {
			try {
				readSource(`${name}/index.ts`);

				return true;
			} catch {
				return false;
			}
		});

/**
 * The name each family is published under. `src/index.ts` names the ones it
 * re-exports; a family folder it does not carry yet keeps its folder name
 * without separators, which is the same rule those namespace exports follow.
 */
const familyNames = (analyzer: YukuAnalyzer, directories: readonly string[]) => {
	const byDirectory = new Map<string, string>();
	const index = analyzer.module('index.ts');
	for (const entry of index?.exports ?? []) {
		if (!entry.isNamespaceReexport || !entry.name || !entry.specifier) continue;
		const directory = entry.specifier.replace(/^\.\//, '').replace(/\/index\.ts$/, '');
		byDirectory.set(directory, entry.name);
	}

	return new Map(
		directories.map((directory) => [
			directory,
			byDirectory.get(directory) ?? directory.replaceAll('-', ''),
		]),
	);
};

type Resolved = { module: YukuModule; node: AstNode };

/** Follows an export or import binding to the declaration that defines it. */
const resolveSymbol = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	symbol: YukuSymbol,
): Resolved | null => {
	const definition = analyzer.definitionOf(symbol);
	const owner = definition?.module ?? module;
	const target = definition?.symbol ?? symbol;
	const node = declarationOf(owner, target);

	return node ? { module: owner, node } : null;
};

const exportedSymbol = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	name: string,
): Resolved | null => {
	if (name === 'default') {
		const entry = module.exports.find((candidate) => candidate.name === 'default');
		const local = entry?.local;

		return local ? resolveSymbol(analyzer, module, local) : null;
	}
	const symbol = module.resolve(name);

	return symbol ? resolveSymbol(analyzer, module, symbol) : null;
};

const typeText = (module: YukuModule, node: AstNode) => module.source.slice(node.start, node.end);

const memberName = (member: AstNode): string | null => {
	const key = member['key'] as AstNode & { name?: string; value?: string };
	if (!key) return null;

	return key.name ?? (typeof key.value === 'string' ? key.value : null);
};

/**
 * A prop type is kept as authored. The one substitution is a package-local
 * alias that names a set of values rather than a shape: a docs table wants the
 * four sides, not the word `PopoverSide`. An alias over an object or another
 * named type keeps its name, which is what a reader can look up.
 */
const displayedPropType = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	annotation: AstNode,
): string => {
	if (annotation.type !== 'TSTypeReference') return typeText(module, annotation);
	const typeName = annotation['typeName'] as AstNode & { name?: string };
	if (annotation['typeArguments'] || typeName?.type !== 'Identifier' || !typeName.name) {
		return typeText(module, annotation);
	}
	const symbol = module.resolve(typeName.name, undefined, 'type');
	const resolved = symbol ? resolveSymbol(analyzer, module, symbol) : null;
	if (!resolved || resolved.node.type !== 'TSTypeAliasDeclaration') {
		return typeText(module, annotation);
	}
	const aliased = resolved.node['typeAnnotation'] as AstNode;
	if (!namesValueSet(aliased)) return typeText(module, annotation);

	return typeText(resolved.module, aliased);
};

// A shape is anything that introduces members or leans on another named type;
// everything else is built from literals, keywords, tuples and arrays.
const SHAPE_TYPES = new Set([
	'TSTypeLiteral',
	'TSTypeReference',
	'TSMappedType',
	'TSConditionalType',
	'TSIndexedAccessType',
	'TSTypeQuery',
	'TSFunctionType',
	'TSConstructorType',
	'TSTypeOperator',
	'TSInterfaceBody',
]);

const namesValueSet = (node: unknown): boolean => {
	if (Array.isArray(node)) return node.every(namesValueSet);
	if (!node || typeof node !== 'object') return true;
	const type = (node as AstNode).type;
	if (typeof type === 'string' && SHAPE_TYPES.has(type)) return false;

	return Object.entries(node).every(([key, value]) => key === 'type' || namesValueSet(value));
};

/**
 * The family-owned props of a props type: the members it declares itself. The
 * `PropsOf<'div'>` half of the intersection is the element's own attribute
 * surface, which no component's table restates.
 */
const collectProps = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	typeNode: AstNode,
	seen: Set<AstNode>,
): PropEntry[] => {
	if (seen.has(typeNode)) return [];
	seen.add(typeNode);

	if (typeNode.type === 'TSIntersectionType') {
		return (typeNode['types'] as AstNode[]).flatMap((member) =>
			collectProps(analyzer, module, member, seen),
		);
	}

	if (typeNode.type === 'TSTypeReference') {
		const typeName = typeNode['typeName'] as AstNode & { name?: string };
		if (typeNode['typeArguments'] || typeName?.type !== 'Identifier' || !typeName.name)
			return [];
		const symbol = module.resolve(typeName.name, undefined, 'type');
		const resolved = symbol ? resolveSymbol(analyzer, module, symbol) : null;
		if (!resolved || resolved.node.type !== 'TSTypeAliasDeclaration') return [];

		return collectProps(
			analyzer,
			resolved.module,
			resolved.node['typeAnnotation'] as AstNode,
			seen,
		);
	}

	if (typeNode.type !== 'TSTypeLiteral') return [];

	const props: PropEntry[] = [];
	for (const member of typeNode['members'] as AstNode[]) {
		if (member.type !== 'TSPropertySignature') continue;
		const name = memberName(member);
		const annotation = member['typeAnnotation'] as AstNode | null;
		const inner = annotation?.['typeAnnotation'] as AstNode | undefined;
		if (!name || !inner) continue;
		const doc = docCommentAbove(module, member);
		props.push({
			name,
			type: displayedPropType(analyzer, module, inner),
			required: member['optional'] !== true,
			...(doc ? { doc } : {}),
		});
	}

	return props;
};

/** The destructuring defaults a component gives its own props, by prop name. */
const componentDefaults = (module: YukuModule, component: AstNode): Map<string, string> => {
	const defaults = new Map<string, string>();
	const pattern = (component['params'] as AstNode[] | undefined)?.[0];
	if (!pattern || pattern.type !== 'ObjectPattern') return defaults;
	for (const property of pattern['properties'] as AstNode[]) {
		if (property.type !== 'Property') continue;
		const value = property['value'] as AstNode;
		const name = memberName(property);
		if (!name || value?.type !== 'AssignmentPattern') continue;
		defaults.set(name, typeText(module, value['right'] as AstNode));
	}

	return defaults;
};

const propsTypeOf = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	component: AstNode,
): PropEntry[] => {
	const pattern = (component['params'] as AstNode[] | undefined)?.[0];
	const annotation = pattern?.['typeAnnotation'] as AstNode | undefined;
	const inner = annotation?.['typeAnnotation'] as AstNode | undefined;
	if (!inner) return [];

	return collectProps(analyzer, module, inner, new Set());
};

/**
 * The part doc: the component's own doc comment when it has one, otherwise the
 * doc on the props type, which is where a part's prose is authored today.
 */
const partDoc = (
	analyzer: YukuAnalyzer,
	module: YukuModule,
	component: AstNode,
): string | undefined => {
	const own = docCommentAbove(module, module.parentOf(component) ?? component);
	if (own) return own;
	const pattern = (component['params'] as AstNode[] | undefined)?.[0];
	const annotation = pattern?.['typeAnnotation'] as AstNode | undefined;
	const inner = annotation?.['typeAnnotation'] as AstNode | undefined;
	if (!inner || inner.type !== 'TSTypeReference') return undefined;
	const typeName = inner['typeName'] as AstNode & { name?: string };
	if (typeName?.type !== 'Identifier' || !typeName.name) return undefined;
	const symbol = module.resolve(typeName.name, undefined, 'type');
	const resolved = symbol ? resolveSymbol(analyzer, module, symbol) : null;
	if (!resolved) return undefined;

	return docCommentAbove(
		resolved.module,
		resolved.module.parentOf(resolved.node) ?? resolved.node,
	);
};

const familyParts = (analyzer: YukuAnalyzer, familyDir: string): PartEntry[] => {
	const index = analyzer.module(`${familyDir}/index.ts`);
	if (!index) return [];

	const parts: PartEntry[] = [];
	const seenComponents = new Set<AstNode>();
	for (const entry of [...index.exports].sort((a, b) => a.node.start - b.node.start)) {
		if (entry.typeOnly || entry.isStar || !entry.name || !entry.fromName) continue;
		const target = entry.resolvedModule;
		// A part is a component, and a component is authored in TSRX. The plain
		// `.ts` helpers a family also re-exports are not parts.
		if (!target || !target.path.endsWith('.tsrx')) continue;
		const resolved = exportedSymbol(analyzer, target, entry.fromName);
		if (!resolved || resolved.node.type !== 'FunctionDeclaration') continue;
		if (seenComponents.has(resolved.node)) continue;
		seenComponents.add(resolved.node);

		const component = resolved.node;
		const componentName = (component['id'] as (AstNode & { name?: string }) | null)?.name;
		const doc = partDoc(analyzer, resolved.module, component);
		const defaults = componentDefaults(resolved.module, component);
		const props = propsTypeOf(analyzer, resolved.module, component).map((prop) => {
			const value = defaults.get(prop.name);

			return value === undefined ? prop : { ...prop, default: value };
		});

		parts.push({
			part: entry.name,
			component: componentName ?? entry.fromName,
			...(doc ? { doc } : {}),
			props: props.map(orderPropKeys),
		});
	}

	return parts;
};

// One key order for every prop row, so a manifest diff shows content changes.
const orderPropKeys = (prop: PropEntry): PropEntry => ({
	name: prop.name,
	type: prop.type,
	required: prop.required,
	...(prop.default === undefined ? {} : { default: prop.default }),
	...(prop.doc === undefined ? {} : { doc: prop.doc }),
});

export function extractApiManifest(): ApiManifest {
	const directories = familyDirectories();
	const analyzer = analyzeSources(collectSources());
	const names = familyNames(analyzer, directories);

	const entries = directories
		.map(
			(directory) =>
				[names.get(directory) ?? directory, familyParts(analyzer, directory)] as const,
		)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

	const manifest: ApiManifest = {};
	for (const [name, parts] of entries) manifest[name] = { parts };

	return manifest;
}

export const manifestJson = (manifest: ApiManifest = extractApiManifest()): string =>
	`${JSON.stringify(manifest, null, '\t')}\n`;
