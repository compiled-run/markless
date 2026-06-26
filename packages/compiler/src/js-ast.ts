import { parseModule } from '@tsrx/core';

export type JavaScriptAstNode = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

export function parseJavaScriptModule(
	source: string,
	filename = 'generated.js',
): JavaScriptAstNode {
	return parseModule(source, filename) as unknown as JavaScriptAstNode;
}
