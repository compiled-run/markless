// Finds where a compiled module names other modules, so the link step can rewrite each name.
import { parseJavaScriptModule } from '../../../../packages/compiler/src/index.ts';
import type { ImportSite } from './protocol.ts';

type AstNode = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly source?: AstNode & { readonly value?: unknown };
	readonly [key: string]: unknown;
};

/** Every module specifier in `code`, last first so splicing keeps earlier offsets valid. */
export function importSites(code: string, name: string): ImportSite[] {
	const program = parseJavaScriptModule(code, `${name}.js`) as unknown as AstNode;
	const sites: ImportSite[] = [];
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) return value.forEach(visit);
		if (!value || typeof value !== 'object') return;
		const node = value as AstNode;
		if (
			(node.type === 'ImportDeclaration' ||
				node.type === 'ExportAllDeclaration' ||
				node.type === 'ExportNamedDeclaration') &&
			node.source
		)
			sites.push({
				start: node.source.start,
				end: node.source.end,
				specifier: String(node.source.value),
				dynamic: false,
			});
		else if (node.type === 'ImportExpression' && node.source?.type === 'Literal')
			sites.push({
				start: node.start,
				end: node.end,
				specifier: String(node.source.value),
				dynamic: true,
			});
		// The symbol resolver imports from a table of module ids, so a computed import() is a module edge too.
		else if (node.type === 'ImportExpression' && node.source)
			sites.push({
				start: node.start,
				end: node.end,
				specifier: code.slice(node.source.start, node.source.end),
				dynamic: true,
				computed: true,
			});
		for (const key in node)
			if (key !== 'source' || node.type === 'ImportExpression') visit(node[key]);
	};
	visit(program);
	return sites.sort((a, b) => b.start - a.start);
}
