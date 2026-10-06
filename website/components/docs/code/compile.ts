// Compiles the files of one <Code> block into modules the frame can link. Runs in the
// compile worker in the browser and under Node in tests; the browser build swaps the
// compiler's native parser, analyzer and printer for their WebAssembly builds.
import { normalizeMarklessDevError } from '../../../../packages/bundler/src/dev-error/index.ts';
import {
	stripEmittedTypes,
	transformTsrxModule,
} from '../../../../packages/bundler/src/transform.ts';
import { parseJavaScriptModule } from '../../../../packages/compiler/src/index.ts';
import type {
	CodeDiagnostic,
	CodeFile,
	CompiledModule,
	CompileOutcome,
	ImportSite,
} from './protocol.ts';

type AstNode = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly source?: AstNode & { readonly value?: unknown };
	readonly [key: string]: unknown;
};

/** The file a block runs: its first `.tsrx`, whose default export is the component shown. */
export function entryFile(files: readonly CodeFile[]): CodeFile | undefined {
	return files.find((file) => file.name.endsWith('.tsrx'));
}

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
		for (const key in node)
			if (key !== 'source' || node.type === 'ImportExpression') visit(node[key]);
	};
	visit(program);
	return sites.sort((a, b) => b.start - a.start);
}

function diagnosticsOf(error: unknown, file: CodeFile): CodeDiagnostic[] {
	const payload = normalizeMarklessDevError(error, { id: file.name });
	const loc = (error as { loc?: { line?: number; column?: number } } | null)?.loc;
	if (payload.diagnostics.length === 0)
		return [
			{
				file: file.name,
				line: loc?.line ?? 0,
				column: loc?.column ?? 0,
				message: payload.details,
			},
		];
	return payload.diagnostics.map((diagnostic) => {
		const detail = [diagnostic.why, diagnostic.suggestion].filter(Boolean).join('\n');
		return {
			file: file.name,
			line: diagnostic.line ?? loc?.line ?? 1,
			column: diagnostic.column ?? loc?.column ?? 1,
			message: diagnostic.code.startsWith('MARKLESS_DEV_RUNTIME_ERROR')
				? diagnostic.message
				: `${diagnostic.code}: ${diagnostic.message}`,
			...(detail ? { detail } : {}),
		};
	});
}

async function compileFile(file: CodeFile, buildId: string): Promise<CompiledModule[]> {
	if (file.name.endsWith('.css'))
		return [{ id: file.name, kind: 'style', code: file.code, imports: [] }];
	if (file.name.endsWith('.tsrx')) {
		const result = await transformTsrxModule({
			filename: `/code/${file.name}`,
			moduleId: file.name,
			source: file.code,
			buildId,
			environment: 'client',
			directCsr: true,
			// The execution log installs page globals once, which would pin them to the first run.
			executionLog: 'never',
		});
		const modules: CompiledModule[] = [
			{
				id: file.name,
				kind: 'script',
				code: result.code,
				imports: importSites(result.code, file.name),
			},
		];
		for (const module of result.virtualModules) {
			const code = String(module.source);
			const style = module.id.endsWith('.css');
			modules.push({
				id: module.id,
				kind: style ? 'style' : 'script',
				code,
				imports: style ? [] : importSites(code, module.id),
			});
		}
		return modules;
	}
	const code = await stripEmittedTypes(file.code, file.name);
	return [{ id: file.name, kind: 'script', code, imports: importSites(code, file.name) }];
}

/** Compiles every file; the first failing file stops the run and reports where it failed. */
export async function compileFiles(
	files: readonly CodeFile[],
	buildId: string,
): Promise<CompileOutcome> {
	const entry = entryFile(files);
	if (!entry)
		return {
			ok: false,
			diagnostics: [
				{
					file: files[0]?.name ?? '',
					line: 1,
					column: 1,
					message:
						'A Code block needs one .tsrx file whose default export is the component to show.',
				},
			],
		};
	const modules: CompiledModule[] = [];
	for (const file of files) {
		try {
			modules.push(...(await compileFile(file, buildId)));
		} catch (error) {
			return { ok: false, diagnostics: diagnosticsOf(error, file) };
		}
	}
	return { ok: true, entry: entry.name, modules };
}
