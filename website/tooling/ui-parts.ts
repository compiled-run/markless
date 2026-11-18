// Each part's role, element and ui-* attributes, read from @markless/ui's own source and SPEC.md.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { familyOf } from '../components/docs/api-derive/manifest.ts';
import type { PartFacts } from '../components/docs/ui-parts/types.ts';
import { metaIfAny } from '../components/docs/ui-meta/index.ts';
import { houseParser } from './ui-playground.ts';

type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

const NON_SOURCE = /\.(browser|sr|nvda|voiceover)\.ts$|-transcript\.ts$/;
const FORM_ELEMENTS = new Set(['input', 'select', 'textarea']);

/** The package root, found from the manifest it exports. */
function packageRoot(): string {
	const manifest = createRequire(import.meta.url).resolve('@markless/ui/api/manifest.json');
	return dirname(dirname(manifest));
}

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function childrenOf(node: AstNode): AstNode[] {
	const found: AstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'type') continue;
		if (isNode(value)) found.push(value);
		else if (Array.isArray(value)) for (const item of value) if (isNode(item)) found.push(item);
	}
	return found;
}

function jsxName(node: AstNode): string {
	if (node.type === 'JSXMemberExpression')
		return `${jsxName(node.object as AstNode)}.${jsxName(node.property as AstNode)}`;
	return String((node as { name?: unknown }).name ?? '');
}

function walk(node: AstNode, visit: (node: AstNode) => void): void {
	visit(node);
	for (const child of childrenOf(node)) walk(child, visit);
}

/** The roles SPEC.md's table establishes, longest first so `description` wins over a shorter tail. */
export function establishedRoles(spec: string): readonly string[] {
	const start = spec.indexOf('## Component roles');
	const end = spec.indexOf('\n## ', start + 1);
	const roles = [...spec.slice(start, end).matchAll(/^\| `([a-z]+)` \|/gm)].map((match) => match[1]!);
	if (roles.length === 0) throw new Error('ui-parts: SPEC.md has no component roles table.');
	return roles.sort((a, b) => b.length - a.length);
}

/** `itemtrigger` -> `trigger`. A name that ends in no established role has none. */
export function roleOf(part: string, roles: readonly string[]): string {
	return roles.find((role) => part.endsWith(role)) ?? '';
}

type Declared = { readonly node: AstNode; readonly dir: string };

/** Every function declared in the package's shipping .tsrx files, by name. */
async function declarations(root: string): Promise<Map<string, Declared[]>> {
	const parse = await houseParser();
	const found = new Map<string, Declared[]>();
	const src = join(root, 'src');
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === 'scenarios') continue;
		for (const file of readdirSync(join(src, entry.name))) {
			if (!file.endsWith('.tsrx') || NON_SOURCE.test(file)) continue;
			const program = parse(readFileSync(join(src, entry.name, file), 'utf8'), file);
			walk(program, (node) => {
				if (node.type !== 'FunctionDeclaration' && node.type !== 'ComponentDeclaration') return;
				const name = String(((node as { id?: AstNode }).id as { name?: unknown } | undefined)?.name ?? '');
				if (name === '') return;
				found.set(name, [...(found.get(name) ?? []), { node, dir: entry.name }]);
			});
		}
	}
	return found;
}

/** `radiogroup` -> `radio-group`, read from the package's own `export * as` lines. */
async function familyDirs(root: string): Promise<Map<string, string>> {
	const parse = await houseParser();
	const program = parse(readFileSync(join(root, 'src/index.ts'), 'utf8'), 'index.ts');
	const dirs = new Map<string, string>();
	for (const node of program.body) {
		if (node.type !== 'ExportAllDeclaration') continue;
		const exported = (node as { exported?: AstNode | null }).exported;
		const from = String((node.source as { value?: unknown }).value);
		const dir = /^\.\/([^/]+)\/index\.ts$/.exec(from)?.[1];
		if (exported && dir) dirs.set(jsxName(exported), dir);
	}
	return dirs;
}

function firstElement(node: AstNode | undefined): AstNode | undefined {
	if (!node) return undefined;
	if (node.type === 'JSXElement') return node;
	for (const child of childrenOf(node)) {
		const found = firstElement(child);
		if (found) return found;
	}
	return undefined;
}

function literalAttribute(element: AstNode, name: string): string {
	for (const attribute of ((element.openingElement as AstNode).attributes as AstNode[]) ?? []) {
		if (attribute.type !== 'JSXAttribute' || jsxName(attribute.name as AstNode) !== name) continue;
		const value = attribute.value as { type?: string; value?: unknown } | null;
		if (value?.type === 'Literal' || value?.type === 'StringLiteral') return String(value.value);
	}
	return '';
}

/** Follows a part's rendered component down to the first plain element, gathering ui-* names on the way. */
function resolvePart(
	start: Declared,
	all: ReadonlyMap<string, Declared[]>,
): { element: string; ariaRole: string; hooks: Set<string>; form: string } {
	const hooks = new Set<string>();
	let ariaRole = '';
	let form = '';
	let current: Declared | undefined = start;
	for (let depth = 0; current && depth < 6; depth += 1) {
		const body = (current.node as { body?: AstNode }).body;
		if (!body) break;
		walk(body, (node) => {
			if (node.type === 'JSXAttribute') {
				const name = jsxName(node.name as AstNode);
				if (name.startsWith('ui-')) hooks.add(name);
			}
			if (node.type === 'JSXElement' && form === '') {
				const tag = jsxName((node.openingElement as AstNode).name as AstNode);
				if (FORM_ELEMENTS.has(tag)) form = tag;
			}
		});
		const rendered = firstElement((body as { render?: AstNode }).render ?? body);
		if (!rendered) break;
		const tag = jsxName((rendered.openingElement as AstNode).name as AstNode);
		ariaRole ||= literalAttribute(rendered, 'role');
		if (/^[a-z][a-z0-9]*$/.test(tag)) return { element: tag, ariaRole, hooks, form };
		const dir: string = current.dir;
		const candidates: Declared[] = all.get(tag.split('.').pop() ?? tag) ?? [];
		current = candidates.find((one) => one.dir === dir) ?? candidates[0];
	}
	return { element: '', ariaRole, hooks, form };
}

/** The family's parts in page order: ui-meta's `partOrder`, then `root`, then the rest alphabetically. */
export function partOrder(family: string): readonly string[] {
	const order = metaIfAny(family)?.partOrder ?? [];
	const rest = familyOf(family)
		.parts.map((part) => part.part)
		.filter((part) => !order.includes(part))
		.sort((a, b) => (a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b)));
	return [...order, ...rest];
}

/** Every family's parts, derived from the package source. */
export async function deriveParts(families: readonly string[]): Promise<Record<string, readonly PartFacts[]>> {
	const root = packageRoot();
	const roles = establishedRoles(readFileSync(join(root, 'SPEC.md'), 'utf8'));
	const all = await declarations(root);
	const dirs = await familyDirs(root);
	const out: Record<string, readonly PartFacts[]> = {};
	for (const family of families) {
		const dir = dirs.get(family);
		if (!dir) throw new Error(`ui-parts: src/index.ts exports no '${family}'.`);
		const parts = familyOf(family).parts;
		out[family] = partOrder(family).map((part) => {
			const component = parts.find((one) => one.part === part)!.component;
			const declared = all.get(component)?.find((one) => one.dir === dir) ?? all.get(component)?.[0];
			if (!declared) throw new Error(`ui-parts: no function ${component} for ${family}.${part}.`);
			const resolved = resolvePart(declared, all);
			const role = roleOf(part, roles);
			const element = role === 'field' && resolved.form !== '' ? resolved.form : resolved.element;
			return {
				part,
				role,
				element,
				ariaRole: resolved.ariaRole,
				hidden: role === 'field',
				hooks: [...resolved.hooks].sort(),
			};
		});
	}
	return out;
}
