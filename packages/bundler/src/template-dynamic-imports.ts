import { parseJavaScriptModule, type JavaScriptAstNode } from '@markless/compiler';
import { dirname, relative, resolve } from 'pathe';

const TEMPLATE_IMPORT_RE = /\bimport\s*\(\s*`/;
const HELPER = '__marklessTemplateImport';

// A Markless virtual module has no directory of its own, so an `import(`./x-${y}.ts`)` it
// carries from the authoring file becomes a root-relative glob Vite expands for virtual ids.
export function rewriteTemplateDynamicImports(code: string, sourceFile: string, root: string) {
	if (!TEMPLATE_IMPORT_RE.test(code)) return code;
	let program: JavaScriptAstNode;
	try {
		program = parseJavaScriptModule(code, 'markless-virtual.js');
	} catch {
		return code;
	}
	const edits: Array<{ readonly start: number; readonly end: number; readonly text: string }> =
		[];
	const visit = (node: unknown): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		const ast = node as JavaScriptAstNode;
		if (ast.type === 'ImportExpression') {
			const edit = templateImportEdit(code, ast, sourceFile, root);
			if (edit) edits.push(edit);
		}
		for (const key in ast) if (key !== 'parent') visit(ast[key]);
	};
	visit(program);
	if (edits.length === 0) return code;
	let next = code;
	for (const edit of edits.sort((a, b) => b.start - a.start))
		next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	return `${next}\nfunction ${HELPER}(modules, path) { const load = modules[path]; return load ? load() : Promise.reject(new Error('Unknown variable dynamic import: ' + path)); }\n`;
}

function templateImportEdit(
	code: string,
	node: JavaScriptAstNode,
	sourceFile: string,
	root: string,
) {
	const source = node.source as JavaScriptAstNode | undefined;
	if (source?.type !== 'TemplateLiteral' || node.options) return null;
	const quasis = source.quasis as ReadonlyArray<JavaScriptAstNode & { value: { raw: string } }>;
	if ((source.expressions as readonly unknown[]).length === 0) return null;
	const head = quasis[0]!;
	const prefix = head.value.raw;
	if (!prefix.startsWith('./') && !prefix.startsWith('../')) return null;
	const slash = prefix.lastIndexOf('/');
	const directory = relative(root, resolve(dirname(sourceFile), prefix.slice(0, slash + 1)));
	const rootPrefix = `/${directory ? `${directory}/` : ''}${prefix.slice(slash + 1)}`;
	const glob = [rootPrefix, ...quasis.slice(1).map((quasi) => quasi.value.raw)].join('*');
	const rest = code.slice(source.start! + 1 + prefix.length, source.end! - 1);
	return {
		start: node.start!,
		end: node.end!,
		text: `${HELPER}(import.meta.glob(${JSON.stringify(glob)}), \`${rootPrefix}${rest}\`)`,
	};
}
