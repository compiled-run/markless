import upstreamTsrxTypeScriptPlugin from '@tsrx/typescript-plugin';
import { join } from 'node:path';
import { installMarklessCompletions } from './completions.ts';
import {
	MARKLESS_TSRX_PARSE_ERROR_CODE,
	clampMarklessDiagnosticStart,
	getMarklessTsrxParseFailure,
	isMarklessTsrxFile,
	mapMarklessSourcePositionToGenerated,
	updateMarklessTsrxParseFailure,
} from './language.ts';

type TsserverPluginModules = { readonly typescript: any };
type TsserverPlugin = {
	create(info: any): any;
	getExternalFiles?(project: any, updateLevel?: any): string[];
};

// @tsrx/typescript-plugin is nested inside this package as a regular dependency so a
// Markless app installs one package and writes one plugin name. Upstream owns the Volar
// language layer and reaches the Markless compiler through the tsconfig `tsrx.compiler`
// declaration; this module layers the Markless editor behaviour on top of it. Upstream
// ships JavaScript without type declarations, so its published factory shape - a
// tsserver plugin init function - is asserted here once instead of at every call site.
const upstreamPlugin = upstreamTsrxTypeScriptPlugin as unknown as (
	modules: TsserverPluginModules,
) => TsserverPlugin;

// tsserver calls create() once per project, but a consumer who copies upstream's README
// can end up listing @tsrx/typescript-plugin next to @markless/typescript-plugin. Key the
// guard on the language service host: upstream replaces info.languageService with its own
// proxy during create, while the host object stays the same identity across both plugin
// entries. It is also the identity Volar's own duplicate-decoration guard uses.
const marklessLanguageServices = new WeakMap<object, any>();

// The Markless parse failure for a file is recorded while the Markless virtual code
// compiles it. Upstream owns the registered language layer, so the record is refreshed
// here from the authored snapshot instead, once per script version.
const parseFailureVersions = new Map<string, string>();

const plugin = (modules: TsserverPluginModules) => {
	const upstream = upstreamPlugin(modules);
	const getUpstreamExternalFiles = upstream.getExternalFiles?.bind(upstream);
	return {
		...upstream,
		getExternalFiles(project: any, updateLevel: any) {
			const externalFiles = getUpstreamExternalFiles?.(project, updateLevel) ?? [];
			if (!projectContainsTsrx(project)) return externalFiles;
			const contract = join(__dirname, 'markless-tsrx.d.ts');
			return externalFiles.includes(contract) ? externalFiles : [...externalFiles, contract];
		},
		create(info: any) {
			const alreadyInstalled = marklessLanguageServices.get(info.languageServiceHost);
			if (alreadyInstalled) return alreadyInstalled;

			// Bind before upstream's create: it decorates the host and swaps in a proxy
			// language service, and both of these must still read authored TSRX coordinates.
			const getSourceSnapshot = info.languageServiceHost.getScriptSnapshot.bind(
				info.languageServiceHost,
			);
			const getSourceVersion = info.languageServiceHost.getScriptVersion?.bind(
				info.languageServiceHost,
			);
			const nativeJsxClosingTag = info.languageService.getJsxClosingTagAtPosition?.bind(
				info.languageService,
			);
			const nativeCompletionEntryDetails =
				info.languageService.getCompletionEntryDetails?.bind(info.languageService);
			// Upstream short-circuits and hands back info.languageService untouched when this
			// host was already decorated, so the result is treated as an opaque service rather
			// than as a guaranteed Volar proxy.
			const languageService = upstream.create(info) ?? info.languageService;
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
			const getSyntacticDiagnostics =
				enhancedLanguageService.getSyntacticDiagnostics.bind(enhancedLanguageService);
			enhancedLanguageService.getSyntacticDiagnostics = (fileName: string) => {
				const diagnostics = getSyntacticDiagnostics(fileName);
				if (!isMarklessTsrxFile(fileName)) return diagnostics;
				const snapshot = getSourceSnapshot(fileName);
				refreshMarklessParseFailure(fileName, snapshot, getSourceVersion?.(fileName));
				const failure = getMarklessTsrxParseFailure(fileName);
				if (!failure) return diagnostics;
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
			if (nativeCompletionEntryDetails) {
				const getCompletionEntryDetails =
					enhancedLanguageService.getCompletionEntryDetails.bind(enhancedLanguageService);
				enhancedLanguageService.getCompletionEntryDetails = (
					fileName: string,
					position: number,
					entryName: string,
					formatOptions: unknown,
					importSource: string | undefined,
					preferences: unknown,
					data: unknown,
				) => {
					const details = getCompletionEntryDetails(
						fileName,
						position,
						entryName,
						formatOptions,
						importSource,
						preferences,
						data,
					);
					if (
						!isMarklessTsrxFile(fileName) ||
						!hasUnmappedCodeAction(details, fileName)
					) {
						return details;
					}
					const snapshot = getSourceSnapshot(fileName);
					if (!snapshot) return details;
					const generatedPosition = mapMarklessSourcePositionToGenerated(
						fileName,
						snapshot,
						position,
					);
					if (generatedPosition === undefined) return details;
					return withLeadingRegionChanges(
						details,
						nativeCompletionEntryDetails(
							fileName,
							snapshot.getLength() + generatedPosition,
							entryName,
							formatOptions,
							importSource,
							preferences,
							data,
						),
						fileName,
						snapshot.getLength(),
					);
				};
			}
			if (nativeJsxClosingTag) {
				const proxiedJsxClosingTag =
					languageService.getJsxClosingTagAtPosition?.bind(languageService);
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
					return nativeJsxClosingTag(fileName, snapshot.getLength() + generatedPosition);
				};
			}
			marklessLanguageServices.set(info.languageServiceHost, enhancedLanguageService);
			return enhancedLanguageService;
		},
	};
};

// Compiling the authored source is what records - or clears - the file's parse failure,
// so this recompiles it when its script version changes and then leaves the record for
// getSyntacticDiagnostics to read.
function refreshMarklessParseFailure(
	fileName: string,
	snapshot: any,
	version: string | undefined,
): void {
	if (!snapshot) return;
	if (version !== undefined && parseFailureVersions.get(fileName) === version) return;
	if (version !== undefined) parseFailureVersions.set(fileName, version);
	updateMarklessTsrxParseFailure(fileName, snapshot.getText(0, snapshot.getLength()));
}

function hasUnmappedCodeAction(details: any, fileName: string): boolean {
	return Boolean(
		details?.codeActions?.some(
			(action: any) => !action.changes?.some((change: any) => change.fileName === fileName),
		),
	);
}

// TypeScript inserts a brand-new import at offset 0 of the document it is handed. For a
// .tsrx file that document is a blanked-out copy of the authored source followed by the
// generated TSX, so offset 0 lands in the blanked copy, which carries no mappings - the
// editor host drops the whole code action and the user is offered an import that changes
// nothing. The blanked copy is character-for-character as long as the authored source, so
// a change inside it belongs at the same authored offset; re-anchor exactly those.
function withLeadingRegionChanges(
	details: any,
	generatedDetails: any,
	fileName: string,
	sourceLength: number,
): any {
	return {
		...details,
		codeActions: details.codeActions.map((action: any, index: number) => {
			if (action.changes?.some((change: any) => change.fileName === fileName)) return action;
			const generatedAction = generatedDetails?.codeActions?.[index];
			if (generatedAction?.description !== action.description) return action;
			const textChanges = (generatedAction.changes ?? [])
				.filter((change: any) => change.fileName === fileName)
				.flatMap((change: any) => change.textChanges)
				.filter(
					(textChange: any) =>
						textChange.span.start + textChange.span.length <= sourceLength,
				);
			if (textChanges.length === 0) return action;
			return { ...action, changes: [...(action.changes ?? []), { fileName, textChanges }] };
		}),
	};
}

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

export default plugin;
