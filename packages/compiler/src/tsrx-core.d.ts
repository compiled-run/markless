declare module '@tsrx/core' {
	import type { ParseOptions } from '@tsrx/core/types';
	import type * as AST from '@tsrx/core/types/estree';

	export function parseModule(
		source: string,
		filename?: string,
		options?: ParseOptions,
	): AST.Program;
	export function isEventAttribute(name: string): boolean;
	export function normalizeEventName(name: string): string;
}
