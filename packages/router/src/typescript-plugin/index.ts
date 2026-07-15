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
				return withRouteHrefCompletions(
					typeScript,
					info,
					pagesDir,
					fileName,
					position,
					completions,
				);
			};

			return proxy;
		},
	};
}

function withRouteHrefCompletions(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	pagesDir: string,
	fileName: string,
	position: number,
	completions: ts.CompletionInfo | undefined,
): ts.CompletionInfo | undefined {
	if (!isRouteHrefCompletionContext(typeScript, info, fileName, position)) {
		return completions;
	}

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

function isRouteHrefCompletionContext(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	fileName: string,
	position: number,
): boolean {
	if (extname(fileName).toLowerCase() === '.tsrx') {
		const snapshot = info.project.getScriptInfo(fileName)?.getSnapshot();
		if (!snapshot || position < 0 || position > snapshot.getLength()) return false;
		const source = snapshot.getText(0, snapshot.getLength());
		return (
			isInsideStringLikeToken(typeScript, source, position) ||
			isInsideHrefAttributeInitializer(source, position)
		);
	}

	const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName);
	if (!sourceFile || position < 0 || position > sourceFile.getFullText().length) return false;
	const node = deepestNodeAtPosition(sourceFile, position);
	if (node && isStringLikeNode(typeScript, node)) return true;
	for (let current = node; current; current = current.parent) {
		if (!typeScript.isJsxAttribute(current) || current.name.getText(sourceFile) !== 'href') {
			continue;
		}
		const initializer = current.initializer;
		return Boolean(
			initializer && initializer.getStart(sourceFile) <= position && position <= initializer.end,
		);
	}

	// An incomplete JSX initializer may not have a stable AST node yet. The source
	// file still provides an original snapshot for the same narrow lexical check.
	return isInsideHrefAttributeInitializer(sourceFile.getFullText(), position);
}

function isInsideStringLikeToken(
	typeScript: TypeScript,
	source: string,
	position: number,
): boolean {
	const scanner = typeScript.createScanner(
		typeScript.ScriptTarget.Latest,
		false,
		typeScript.LanguageVariant.JSX,
		source,
	);
	const stringLikeTokens = new Set([
		typeScript.SyntaxKind.StringLiteral,
		typeScript.SyntaxKind.NoSubstitutionTemplateLiteral,
		typeScript.SyntaxKind.TemplateHead,
		typeScript.SyntaxKind.TemplateMiddle,
		typeScript.SyntaxKind.TemplateTail,
	]);

	for (let token = scanner.scan(); token !== typeScript.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
		const start = scanner.getTokenPos();
		const end = scanner.getTextPos();
		if (position < start) return false;
		if (stringLikeTokens.has(token) && start < position) {
			if (position < end || (position === end && scanner.isUnterminated())) return true;
		}
		if (position < end) return false;
	}
	return false;
}

function isInsideHrefAttributeInitializer(source: string, position: number): boolean {
	const tagStart = openJsxTagStartAtPosition(source, position);
	if (tagStart === undefined) return false;
	const prefix = source.slice(tagStart + 1, position);
	return /(?:^|\s)href\s*=\s*(?:\{(?:[^{}]|\{[^{}]*\})*|[^\s>]*)$/s.test(prefix);
}

function openJsxTagStartAtPosition(source: string, position: number): number | undefined {
	let tagStart: number | undefined;
	let braceDepth = 0;
	let quote: "'" | '"' | '`' | undefined;
	let escaped = false;

	for (let index = 0; index < position; index += 1) {
		const character = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === '`') {
			quote = character;
			continue;
		}
		if (tagStart === undefined && character === '<') {
			const next = source[index + 1];
			if (next && /[A-Za-z_$/{>]/.test(next)) {
				tagStart = index;
				braceDepth = 0;
			}
			continue;
		}
		if (tagStart === undefined) continue;
		if (character === '{') braceDepth += 1;
		else if (character === '}' && braceDepth > 0) braceDepth -= 1;
		else if (character === '>' && braceDepth === 0) tagStart = undefined;
	}

	return tagStart;
}

function deepestNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
	let deepest: ts.Node | undefined;
	const visit = (node: ts.Node) => {
		if (position < node.getFullStart() || position > node.end) return;
		deepest = node;
		node.forEachChild(visit);
	};
	visit(sourceFile);
	return deepest;
}

function isStringLikeNode(typeScript: TypeScript, node: ts.Node): boolean {
	return (
		typeScript.isStringLiteral(node) ||
		typeScript.isNoSubstitutionTemplateLiteral(node) ||
		node.kind === typeScript.SyntaxKind.TemplateHead ||
		node.kind === typeScript.SyntaxKind.TemplateMiddle ||
		node.kind === typeScript.SyntaxKind.TemplateTail
	);
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
