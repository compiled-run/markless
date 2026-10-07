// The two calls the bundler makes on rolldown/experimental, answered by yuku in the browser.
import { parseJavaScriptModule } from '../../../../packages/compiler/src/index.ts';
import { generate } from './yuku-codegen.ts';

type Diagnostic = { readonly message: string };

function parseTypeScript(code: string): { program: unknown; errors: Diagnostic[] } {
	try {
		return { program: parseJavaScriptModule(code, 'markless-emitted.ts'), errors: [] };
	} catch (error) {
		return {
			program: null,
			errors: [{ message: error instanceof Error ? error.message : String(error) }],
		};
	}
}

type Node = {
	readonly type: string;
	readonly start: number;
	readonly source?: { readonly value?: unknown } | null;
};

// The import and re-export sources of oxc's module record, read off the yuku tree.
function moduleRecord(program: unknown) {
	const body = ((program as { body?: Node[] } | null)?.body ?? []) as Node[];
	const request = (node: Node) =>
		typeof node.source?.value === 'string' ? { value: node.source.value } : null;
	return {
		staticImports: body
			.filter((node) => node.type === 'ImportDeclaration')
			.map((node) => ({ start: node.start, moduleRequest: request(node)! })),
		staticExports: body
			.filter(
				(node) =>
					node.type === 'ExportNamedDeclaration' ||
					node.type === 'ExportAllDeclaration' ||
					node.type === 'ExportDefaultDeclaration',
			)
			.map((node) => ({ start: node.start, entries: [{ moduleRequest: request(node) }] })),
	};
}

export function parseSync(_filename: string, code: string) {
	const parsed = parseTypeScript(code);
	return { ...parsed, module: moduleRecord(parsed.program) };
}

export function transformSync(_filename: string, code: string) {
	const { program, errors } = parseTypeScript(code);
	if (errors.length > 0) return { code: '', errors };
	return { code: generate(program, { strip: true }).code, errors: [] as Diagnostic[] };
}
