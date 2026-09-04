import { parse, type BaseNode } from '@tsrx/yuku';
import MagicString from 'magic-string';
import type { CollectionLoader } from '../collection-loader.ts';
import type { ResolvedIconsOptions } from '../options.ts';
import { cleanImports, renderSvg, type AttributeSpan } from './shared.ts';

type Node = BaseNode & Record<string, unknown>;

export async function transformTsrx(
	source: string,
	file: string,
	options: ResolvedIconsOptions,
	loader: CollectionLoader,
	diagnostic?: (message: string) => void,
): Promise<string | undefined> {
	const result = parse(source, { lang: 'tsx', sourceType: 'module' });
	const fatal = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
	if (fatal) throw new Error(`@markless/icons: ${file}: ${fatal.message}`);
	const program = result.program as unknown as Node;
	const imports: Array<{
		start: number;
		end: number;
		specifiers: Array<{ start: number; end: number; local: string }>;
	}> = [];
	const bindings = new Map<string, string>();
	for (const statement of (program.body as Node[]) ?? []) {
		if (statement.type !== 'ImportDeclaration') continue;
		const sourceNode = statement.source as Node;
		if (!options.importSources.has(String(sourceNode.value))) continue;
		const specifiers = ((statement.specifiers as Node[]) ?? [])
			.filter((specifier) => specifier.type === 'ImportSpecifier')
			.map((specifier) => ({
				start: specifier.start,
				end: specifier.end,
				local: String((specifier.local as Node).name),
				imported: String((specifier.imported as Node).name),
			}));
		for (const specifier of specifiers) bindings.set(specifier.local, specifier.imported);
		imports.push({ start: statement.start, end: statement.end, specifiers });
	}
	if (bindings.size === 0) return undefined;

	const elements: Node[] = [];
	walk(program, (node) => {
		if (node.type === 'JSXElement') elements.push(node);
	});
	const magic = new MagicString(source);
	const usedLocals = new Set<string>();
	for (const element of elements) {
		const opening = element.openingElement as Node;
		const member = memberName(opening.name as Node);
		if (!member || member.parts.length !== 2 || !bindings.has(member.parts[0]!)) continue;
		const local = member.parts[0]!;
		const pack = bindings.get(local)!;
		const prefix = options.packs.get(pack);
		// A namespace from a shared source that is not a pack is a component family; leave it.
		if (!prefix) continue;
		const icon = await loader.icon(prefix, member.parts[1]!, file, pack, diagnostic);
		const closing = element.closingElement as Node | null;
		const attributes = attributeSpans((opening.attributes as Node[]) ?? []);
		const replacement = renderSvg({
			source,
			attributes,
			attributeStart: (opening.name as Node).end,
			attributeEnd: opening.end - (opening.selfClosing ? 2 : 1),
			children: closing ? source.slice(opening.end, closing.start) : '',
			icon,
		});
		magic.overwrite(element.start, element.end, replacement);
		usedLocals.add(local);
	}
	if (usedLocals.size === 0) return undefined;
	cleanImports(source, imports, usedLocals, magic);
	return magic.toString();
}

function memberName(node: Node): { parts: string[] } | undefined {
	if (node.type !== 'JSXMemberExpression') return undefined;
	const parts: string[] = [];
	let current: Node = node;
	while (current.type === 'JSXMemberExpression') {
		parts.unshift(String((current.property as Node).name));
		current = current.object as Node;
	}
	if (current.type !== 'JSXIdentifier') return undefined;
	parts.unshift(String(current.name));
	return { parts };
}

function attributeSpans(attributes: Node[]): AttributeSpan[] {
	return attributes.map((attribute) => {
		if (attribute.type === 'JSXSpreadAttribute') return { start: attribute.start, end: attribute.end };
		const value = attribute.value as Node | null;
		return {
			name: String((attribute.name as Node).name),
			start: attribute.start,
			end: attribute.end,
			...(value ? { valueStart: value.start, valueEnd: value.end } : {}),
		};
	});
}

function walk(node: Node, visitor: (node: Node) => void): void {
	visitor(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc') continue;
		if (Array.isArray(value)) {
			for (const child of value) if (isNode(child)) walk(child, visitor);
		} else if (isNode(value)) walk(value, visitor);
	}
}

function isNode(value: unknown): value is Node {
	return Boolean(value && typeof value === 'object' && 'type' in value && 'start' in value && 'end' in value);
}
