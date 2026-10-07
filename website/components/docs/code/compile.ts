// Compiles the files of one <Code> block into modules the frame can link. Runs in the
// compile worker in the browser and under Node in tests; the browser build swaps the
// compiler's native parser, analyzer and printer for their WebAssembly builds.
import { normalizeMarklessDevError } from '../../../../packages/bundler/src/dev-error/index.ts';
import { buildBlock, ModuleBuildError, type SourceHost } from './bundle-host.ts';
import type { CodeDiagnostic, CodeFile, CompileOutcome } from './protocol.ts';

export { importSites } from './import-sites.ts';

/** The file a block runs: its first `.tsrx`, whose default export is the component shown. */
export function entryFile(files: readonly CodeFile[]): CodeFile | undefined {
	return files.find((file) => file.name.endsWith('.tsrx'));
}

function diagnosticsOf(error: unknown, file: string): CodeDiagnostic[] {
	const payload = normalizeMarklessDevError(error, { id: file });
	const loc = (error as { loc?: { line?: number; column?: number } } | null)?.loc;
	if (payload.diagnostics.length === 0)
		return [
			{
				file,
				line: loc?.line ?? 0,
				column: loc?.column ?? 0,
				message: payload.details,
			},
		];
	return payload.diagnostics.map((diagnostic) => {
		const detail = [diagnostic.why, diagnostic.suggestion].filter(Boolean).join('\n');
		return {
			file,
			line: diagnostic.line ?? loc?.line ?? 1,
			column: diagnostic.column ?? loc?.column ?? 1,
			message: diagnostic.code.startsWith('MARKLESS_DEV_RUNTIME_ERROR')
				? diagnostic.message
				: `${diagnostic.code}: ${diagnostic.message}`,
			...(detail ? { detail } : {}),
		};
	});
}

/** Compiles every file and what it imports; a failure reports the block file it happened in. */
export async function compileFiles(
	files: readonly CodeFile[],
	buildId: string,
	host: SourceHost,
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
	try {
		const modules = await buildBlock(files, buildId, host);
		return { ok: true, entry: `${host.codeDir}${entry.name}`, modules };
	} catch (error) {
		const at = error instanceof ModuleBuildError ? error.moduleId : '';
		const path = at.replace(/\?.*$/, '');
		const file = path.startsWith(host.codeDir) ? path.slice(host.codeDir.length) : '';
		return {
			ok: false,
			diagnostics: diagnosticsOf(
				error instanceof ModuleBuildError ? error.cause : error,
				file,
			),
		};
	}
}
