import { parseJavaScriptModule, type JavaScriptAstNode } from '@markless/compiler';
import { dirname, join } from 'pathe';

// The bundle graph's dynamic edges must match the SHIPPED code: generateBundle
// rewrites (preload-wrapper stripping, facade splits) leave real dynamic
// imports — including template-literal specifiers — that rolldown's
// chunk.dynamicImports metadata never carried, producing zero-incoming-edge
// chunks that execute post-interaction without ever being preloaded. This
// scans a chunk's final emitted code for statically-analyzable dynamic-import
// specifiers so metadata can UNION them in. Interpolated specifiers stay
// unscannable by design (covered by symbol roots).
export function scanEmittedDynamicImports(code: string, chunkFileName: string): string[] {
	if (!code.includes('import(')) return [];

	let ast: JavaScriptAstNode;
	try {
		ast = parseJavaScriptModule(code) as JavaScriptAstNode;
	} catch {
		return [];
	}

	const specifiers = new Set<string>();
	const visit = (node: JavaScriptAstNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'ImportExpression') {
			const specifier = staticSpecifier(
				(node as { source?: JavaScriptAstNode }).source ??
					(node as { arguments?: unknown }).arguments,
			);
			if (specifier?.startsWith('.')) {
				specifiers.add(join(dirname(chunkFileName), specifier));
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(ast);
	return [...specifiers];
}

function staticSpecifier(source: unknown): string | undefined {
	const node = Array.isArray(source) ? (source[0] as JavaScriptAstNode) : source;
	if (!node || typeof node !== 'object') return undefined;
	const astNode = node as JavaScriptAstNode & {
		value?: unknown;
		quasis?: ReadonlyArray<{ cooked?: string; value?: { cooked?: string } }>;
		expressions?: readonly unknown[];
	};
	if (astNode.type === 'Literal' || astNode.type === 'StringLiteral') {
		return typeof astNode.value === 'string' ? astNode.value : undefined;
	}
	// Substitution-free template literals only: `./chunk-x.js`.
	if (astNode.type === 'TemplateLiteral' && (astNode.expressions ?? []).length === 0) {
		const quasi = astNode.quasis?.[0];
		return quasi?.value?.cooked ?? quasi?.cooked;
	}
	return undefined;
}

function childNodes(node: JavaScriptAstNode): JavaScriptAstNode[] {
	const children: JavaScriptAstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'loc' || key === 'span' || key === 'range') continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isAstNode(item)) children.push(item);
			}
			continue;
		}
		if (isAstNode(value)) children.push(value);
	}
	return children;
}

function isAstNode(value: unknown): value is JavaScriptAstNode {
	return !!value && typeof value === 'object' && 'type' in (value as object);
}
