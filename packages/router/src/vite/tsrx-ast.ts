import { parse } from '@tsrx/yuku';

export type TsrxNode = {
	readonly type?: string;
	readonly [key: string]: unknown;
};

/** A `.tsrx` module's tree; throws a `SyntaxError` naming the first error, as a module that does not parse has no tree to read. */
export function parseTsrxModule(source: string): TsrxNode {
	const { program, diagnostics } = parse(source, { preserveParens: true });
	const error = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
	if (error) throw new SyntaxError(`${error.message} (${error.start}:${error.end})`);
	return program as unknown as TsrxNode;
}
