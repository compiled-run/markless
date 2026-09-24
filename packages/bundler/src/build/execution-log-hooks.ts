import type { JavaScriptAstNode } from '@markless/compiler';
import { parseChunkCode, spansAnyOffset, textOffsets } from './chunk-ast.ts';
import { MARKLESS_EXECUTION_LOG_GLOBAL } from '../execution-log.ts';

export function executionLogIdentityOffsets(code: string, fileName: string): Set<number> {
	const offsets = new Set<number>();
	if (!code.includes(MARKLESS_EXECUTION_LOG_GLOBAL)) return offsets;
	const parsed = parseChunkCode(fileName, code);
	if (parsed.errors.length)
		throw new Error(
			`Cannot preserve execution identities in ${fileName}: invalid emitted JavaScript.`,
		);
	const logOffsets = textOffsets(code, MARKLESS_EXECUTION_LOG_GLOBAL);
	const visit = (node: JavaScriptAstNode): void => {
		if (node.type === 'CallExpression') {
			const callee = node.callee as JavaScriptAstNode | undefined;
			const log = callee?.object as JavaScriptAstNode | undefined;
			const root = log?.object as JavaScriptAstNode | undefined;
			const argument = (node.arguments as JavaScriptAstNode[] | undefined)?.[0];
			if (
				member(callee, 'add') &&
				member(log, MARKLESS_EXECUTION_LOG_GLOBAL) &&
				root?.type === 'Identifier' &&
				root.name === 'globalThis' &&
				((argument?.type === 'Literal' && typeof argument.value === 'string') ||
					(argument?.type === 'TemplateLiteral' &&
						(argument.expressions as unknown[]).length === 0)) &&
				typeof argument.start === 'number'
			)
				offsets.add(argument.start);
		}
		for (const value of Object.values(node)) {
			for (const child of Array.isArray(value) ? value : [value]) {
				if (
					child &&
					typeof child === 'object' &&
					'type' in child &&
					spansAnyOffset(logOffsets, child)
				)
					visit(child as JavaScriptAstNode);
			}
		}
	};
	visit(parsed.program as unknown as JavaScriptAstNode);
	return offsets;
}

function member(node: JavaScriptAstNode | undefined, name: string): boolean {
	if (node?.type !== 'MemberExpression') return false;
	const property = node.property as JavaScriptAstNode | undefined;
	return node.computed
		? property?.type === 'Literal' && property.value === name
		: property?.type === 'Identifier' && property.name === name;
}
