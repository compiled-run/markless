import { extname, isAbsolute, normalize, relative, resolve } from 'pathe';
import type * as ts from 'typescript';

type TypeScript = typeof ts;

type MarklessRouterPluginConfig = {
	pagesDir?: string;
};

const PAGE_EXTENSIONS = new Set(['.tsrx', '.mdx']);
const REQUEST_FILE_EXTENSION = '.ts';

function init(modules: { typescript: TypeScript }): ts.server.PluginModule {
	const typeScript = modules.typescript;

	return {
		create(info) {
			const logger = info.project.projectService?.logger;
			logger?.info('[markless-router] TypeScript plugin loaded');

			const languageService = info.languageService;
			const proxy = Object.create(null) as ts.LanguageService;

			for (const key of Object.keys(languageService) as Array<keyof ts.LanguageService>) {
				const value = languageService[key];
				(proxy as unknown as Record<string, unknown>)[key] =
					typeof value === 'function' ? value.bind(languageService) : value;
			}

			const pluginConfig = (info.config ?? {}) as MarklessRouterPluginConfig;
			const projectRoot = getProjectRoot(typeScript, info);
			const appRoot = getConfiguredProjectRoot(info) ?? projectRoot;
			const pagesDir = resolvePagesDir(appRoot, pluginConfig);

			proxy.getCompletionsAtPosition = (fileName, position, options, formattingSettings) => {
				const completions = languageService.getCompletionsAtPosition(
					fileName,
					position,
					options,
					formattingSettings,
				);
				return withRouteHrefCompletions(typeScript, info, pagesDir, completions);
			};

			return proxy;
		},
	};
}

function withRouteHrefCompletions(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	pagesDir: string,
	completions: ts.CompletionInfo | undefined,
): ts.CompletionInfo | undefined {
	const routeHrefs = routeHrefCompletions(typeScript, info, pagesDir);
	if (routeHrefs.length === 0) {
		return completions;
	}

	const baseCompletions = completions ?? emptyCompletionInfo();
	const routeHrefSet = new Set(routeHrefs);
	const routeEntries = routeHrefs.map(
		(href): ts.CompletionEntry => ({
			name: href,
			kind: typeScript.ScriptElementKind.string,
			kindModifiers: '',
			sortText: `0 ${href}`,
		}),
	);

	return {
		...baseCompletions,
		entries: [
			...routeEntries,
			...baseCompletions.entries.filter((entry) => !routeHrefSet.has(entry.name)),
		],
	};
}

function emptyCompletionInfo(): ts.CompletionInfo {
	return {
		isGlobalCompletion: false,
		isMemberCompletion: false,
		isNewIdentifierLocation: false,
		entries: [],
	};
}

function routeHrefCompletions(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	pagesDir: string,
): string[] {
	const hrefs = new Set<string>();

	for (const pageFileName of routeCompletionPageFileNames(typeScript, info, pagesDir)) {
		const relativeFileId = relative(pagesDir, pageFileName);
		if (!isRelativeInsidePath(relativeFileId)) {
			continue;
		}

		if (!PAGE_EXTENSIONS.has(extname(relativeFileId))) {
			continue;
		}

		const href = routeHrefCompletion(relativeFileId);
		if (href) {
			hrefs.add(href);
		}
	}

	return Array.from(hrefs).toSorted();
}

function routeCompletionPageFileNames(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	pagesDir: string,
): string[] {
	const fileNames = new Set(info.languageServiceHost.getScriptFileNames?.() ?? []);

	for (const fileName of readPageFileNames(typeScript, pagesDir)) {
		fileNames.add(fileName);
	}

	return [...fileNames];
}

function readPageFileNames(typeScript: TypeScript, pagesDir: string): string[] {
	if (typeScript.sys.directoryExists && !typeScript.sys.directoryExists(pagesDir)) {
		return [];
	}

	try {
		return typeScript.sys.readDirectory(
			pagesDir,
			Array.from(PAGE_EXTENSIONS),
			undefined,
			undefined,
		);
	} catch {
		return [];
	}
}

function routeHrefCompletion(fileId: string): string | undefined {
	if (isReservedOrUnsupportedPage(fileId)) {
		return undefined;
	}

	return routeFromFileId(fileId).pattern;
}

function isReservedOrUnsupportedPage(fileId: string): boolean {
	const extension = extname(fileId);
	const withoutExtension = fileId.slice(0, -extension.length);
	const routeFile = normalize(withoutExtension);
	const segments: string[] = routeFile === '.' ? [] : routeFile.split('/').filter(Boolean);

	return (
		segments[0] === 'api' ||
		(segments.length === 1 && (segments[0] === '404' || segments[0] === '500'))
	);
}

function routeFromFileId(fileId: string): { readonly pattern: string; readonly params: string[] } {
	const extension = extname(fileId);
	const withoutExtension = fileId.slice(0, -extension.length);
	const routeFile = normalize(withoutExtension);
	const segments: string[] = routeFile === '.' ? [] : routeFile.split('/').filter(Boolean);

	if (segments.at(-1) === 'index') {
		segments.pop();
	}

	const params: string[] = [];
	const routeSegments: string[] = [];

	for (const segment of segments) {
		const catchAllName = bracketParamName(segment, '[...');
		if (catchAllName) {
			routeSegments.push(`[...${catchAllName}]`);
			params.push(catchAllName);
			continue;
		}

		const dynamicName = bracketParamName(segment, '[');
		if (dynamicName) {
			routeSegments.push(`[${dynamicName}]`);
			params.push(dynamicName);
			continue;
		}

		routeSegments.push(segment);
	}

	return {
		pattern: routePathname(routeSegments),
		params,
	};
}

function bracketParamName(segment: string, opening: '[' | '[...'): string | undefined {
	if (!segment.startsWith(opening) || !segment.endsWith(']')) {
		return undefined;
	}

	const name = segment.slice(opening.length, -1);
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : undefined;
}

function routePathname(segments: readonly string[]): string {
	if (segments.length === 0) {
		return '/';
	}

	return `/${segments.join('/')}`;
}

function getProjectRoot(typeScript: TypeScript, info: ts.server.PluginCreateInfo): string {
	return (
		info.project.getCurrentDirectory() ??
		info.languageServiceHost.getCurrentDirectory?.() ??
		typeScript.sys.getCurrentDirectory()
	);
}

function getConfiguredProjectRoot(info: ts.server.PluginCreateInfo): string | undefined {
	const project = info.project as ts.server.Project & {
		getConfigFilePath?: () => string;
	};

	try {
		const configFilePath = project.getConfigFilePath?.();
		return configFilePath
			? configFilePath.slice(0, configFilePath.lastIndexOf('/'))
			: undefined;
	} catch {
		return undefined;
	}
}

function resolvePagesDir(projectRoot: string, config: MarklessRouterPluginConfig): string {
	const configured = config.pagesDir ?? 'pages';
	return isAbsolute(configured) ? configured : resolve(projectRoot, configured);
}

function isRelativeInsidePath(path: string): boolean {
	return path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path);
}

void REQUEST_FILE_EXTENSION;

export default init;
