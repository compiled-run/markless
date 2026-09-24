import type { JavaScriptAstNode } from '@markless/compiler';
import { chunkDynamicImports, parseChunkCode, spansAnyOffset, textOffsets } from './chunk-ast.ts';
import { dirname, join } from 'pathe';

// Code rewrites can add import edges absent from Rolldown's chunk metadata.
export function scanEmittedDynamicImports(code: string, chunkFileName: string): string[] {
	if (!code.includes('import(')) return [];

	let recorded;
	try {
		recorded = chunkDynamicImports(chunkFileName, code);
	} catch {
		return [];
	}
	if (recorded) {
		const specifiers = new Set<string>();
		for (const { specifier } of recorded)
			if (specifier?.startsWith('.')) specifiers.add(join(dirname(chunkFileName), specifier));
		return [...specifiers];
	}

	let ast: JavaScriptAstNode;
	try {
		const parsed = parseChunkCode(chunkFileName, code);
		if (parsed.errors.length) return [];
		ast = parsed.program as unknown as JavaScriptAstNode;
	} catch {
		return [];
	}

	const specifiers = new Set<string>();
	const offsets = textOffsets(code, 'import');
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
		for (const child of childNodes(node)) if (spansAnyOffset(offsets, child)) visit(child);
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
