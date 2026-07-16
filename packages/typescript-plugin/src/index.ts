import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin.js';
import { join } from 'node:path';
import { installMarklessCompletions } from './completions.ts';
import {
	MARKLESS_TSRX_PARSE_ERROR_CODE,
	clampMarklessDiagnosticStart,
	getMarklessTsrxParseFailure,
	getMarklessTsrxLanguagePlugin,
	isMarklessTsrxFile,
	mapMarklessSourcePositionToGenerated,
} from './language.ts';

const volarPlugin = createLanguageServicePlugin(() => ({
	languagePlugins: [getMarklessTsrxLanguagePlugin()],
}));

const plugin = (modules: Parameters<typeof volarPlugin>[0]) => {
	const volar = volarPlugin(modules);
	const getExternalFiles = volar.getExternalFiles?.bind(volar);
	return {
		...volar,
		getExternalFiles(project: any, updateLevel: any) {
			const externalFiles = getExternalFiles?.(project, updateLevel) ?? [];
			if (!projectContainsTsrx(project)) return externalFiles;
			const contract = join(__dirname, 'markless-jsx.d.ts');
			return externalFiles.includes(contract) ? externalFiles : [...externalFiles, contract];
		},
		create(info: Parameters<typeof volar.create>[0]) {
			const getSourceSnapshot = info.languageServiceHost.getScriptSnapshot.bind(
				info.languageServiceHost,
			);
			const nativeJsxClosingTag = info.languageService.getJsxClosingTagAtPosition?.bind(
				info.languageService,
			);
			const languageService = volar.create(info);
			const enhancedLanguageService = Object.create(null);
			for (const key of Object.keys(languageService)) {
				const value = languageService[key as keyof typeof languageService];
				enhancedLanguageService[key] =
					typeof value === 'function' ? value.bind(languageService) : value;
			}
			installMarklessCompletions(
				modules.typescript,
				info,
				enhancedLanguageService,
				getSourceSnapshot,
			);
			const getSyntacticDiagnostics = enhancedLanguageService.getSyntacticDiagnostics.bind(
				enhancedLanguageService,
			);
			enhancedLanguageService.getSyntacticDiagnostics = (fileName: string) => {
				const diagnostics = getSyntacticDiagnostics(fileName);
				if (!isMarklessTsrxFile(fileName)) return diagnostics;
				const failure = getMarklessTsrxParseFailure(fileName);
				if (!failure) return diagnostics;
				const snapshot = getSourceSnapshot(fileName);
				const sourceLength = snapshot?.getLength() ?? 0;
				const sourceFile = enhancedLanguageService.getProgram()?.getSourceFile(fileName);
				// Volar uses an empty placeholder SourceFile for non-empty TSRX sources in
				// tsserver. It cannot provide a meaningful direct-consumer coordinate bound.
				const diagnosticFile =
					sourceFile?.text.length === 0 && sourceLength > 0 ? undefined : sourceFile;
				return [
					...diagnostics,
					{
						file: diagnosticFile,
						start: clampMarklessDiagnosticStart(
							failure.pos,
							sourceLength,
							diagnosticFile?.text.length,
						),
						length: 1,
						category: modules.typescript.DiagnosticCategory.Error,
						code: MARKLESS_TSRX_PARSE_ERROR_CODE,
						source: 'markless',
						messageText: `Markless TSRX parse error: ${failure.message}`,
					},
				];
			};
			if (nativeJsxClosingTag) {
				const proxiedJsxClosingTag = languageService.getJsxClosingTagAtPosition?.bind(
					languageService,
				);
				enhancedLanguageService.getJsxClosingTagAtPosition = (
					fileName: string,
					position: number,
				) => {
					if (!isMarklessTsrxFile(fileName)) {
						return proxiedJsxClosingTag?.(fileName, position);
					}
					const snapshot = getSourceSnapshot(fileName);
					if (!snapshot) return proxiedJsxClosingTag?.(fileName, position);
					const generatedPosition = mapMarklessSourcePositionToGenerated(
						fileName,
						snapshot,
						position,
					);
					if (generatedPosition === undefined) {
						return proxiedJsxClosingTag?.(fileName, position);
					}
					return nativeJsxClosingTag(
						fileName,
						snapshot.getLength() + generatedPosition,
					);
				};
			}
			return enhancedLanguageService;
		},
	};
};

function projectContainsTsrx(project: any): boolean {
	const fileNameLists = [
		project.parsedCommandLine?.fileNames,
		project.getRootFiles?.(),
		project.getFileNames?.(),
	];
	if (
		fileNameLists.some((fileNames) =>
			fileNames?.some((fileName: string) => isMarklessTsrxFile(fileName)),
		)
	) {
		return true;
	}

	// When an extra extension first opens, TypeScript has already associated it
	// with a configured project but has not added it to that project's root names.
	// Use that project-scoped open-file association for the initial external-files
	// pull; later pulls take the normal root/program path above.
	const projectService = project.projectService;
	const configuredProject = project.canonicalConfigFilePath;
	if (!projectService?.openFiles || !configuredProject) return false;
	const canonicalize = projectService.toCanonicalFileName?.bind(projectService);
	return [...projectService.openFiles.keys()].some((fileName: string) => {
		if (!isMarklessTsrxFile(fileName)) return false;
		const openFileConfig = projectService.configFileForOpenFiles?.get(fileName);
		return (
			typeof openFileConfig === 'string' &&
			(canonicalize?.(openFileConfig) ?? openFileConfig) === configuredProject
		);
	});
}

Object.defineProperty(plugin, '__getMarklessTsrxLanguagePlugin', {
	value: getMarklessTsrxLanguagePlugin,
});

export default plugin;
