import { basename, extname, join, normalize, relative } from 'pathe';
import { joinURL, withLeadingSlash, withoutLeadingSlash } from 'ufo';

const API_DIR = 'api';
const MIDDLEWARE_DIR = 'middleware';
const REQUEST_FILE_EXTENSION = '.ts';
const HTTP_METHODS = new Set([
	'connect',
	'delete',
	'get',
	'head',
	'options',
	'patch',
	'post',
	'put',
	'trace',
]);

export type RequestFileDiagnosticCode =
	| 'http-method-export'
	| 'invalid-cache-metadata'
	| 'missing-default-function';

export interface RequestFileDiagnostic {
	readonly code: RequestFileDiagnosticCode;
	readonly message: string;
}

export interface RequestFileDefaultExport {
	readonly kind: 'function';
	readonly parameterName?: string;
}

export interface RequestFileParam {
	readonly name: string;
	readonly kind: 'dynamic' | 'catch-all';
}

export interface ApiRequestFileRoute {
	readonly pathname: string;
	readonly pattern: string;
	readonly params: readonly RequestFileParam[];
}

export interface ApiRequestFileCache {
	readonly maxAge: number;
}

export interface RequestFileTransformResult {
	readonly code: string;
	readonly file: string;
	readonly kind: 'api' | 'middleware';
}

interface NormalizedRequestRouteSegment {
	readonly params: readonly RequestFileParam[];
	readonly pathname: string;
	readonly pattern: string;
}

export type ApiRequestFileMethod =
	| 'all'
	| 'connect'
	| 'delete'
	| 'get'
	| 'head'
	| 'options'
	| 'patch'
	| 'post'
	| 'put'
	| 'trace';

export type RequestFileParseResult =
	| {
			readonly diagnostics: readonly [];
			readonly file: string;
			readonly kind: 'none';
	  }
	| {
			readonly cache?: ApiRequestFileCache;
			readonly defaultExport?: RequestFileDefaultExport;
			readonly diagnostics: readonly RequestFileDiagnostic[];
			readonly file: string;
			readonly kind: 'api';
			readonly method: ApiRequestFileMethod;
			readonly route: ApiRequestFileRoute;
	  }
	| {
			readonly defaultExport?: RequestFileDefaultExport;
			readonly diagnostics: readonly RequestFileDiagnostic[];
			readonly file: string;
			readonly kind: 'middleware';
	  };

export function parseRequestFile(fileId: string, sourceText: string): RequestFileParseResult {
	const file = normalizeRequestFileId(fileId);
	const apiFile = apiRelativeFile(file);
	if (apiFile) {
		return parseApiRequestFile(file, apiFile, sourceText);
	}

	const middlewareFile = middlewareRelativeFile(file);
	if (middlewareFile) {
		return parseMiddlewareRequestFile(file, sourceText);
	}

	return { diagnostics: [], file, kind: 'none' };
}

export function normalizeRequestFileId(fileId: string): string {
	return withoutLeadingSlash(normalize(fileId));
}

export function transformRequestFileSource(
	fileId: string,
	sourceText: string,
): RequestFileTransformResult | undefined {
	const requestFile = parseRequestFile(fileId, sourceText);
	if (
		requestFile.kind === 'none' ||
		requestFile.diagnostics.length > 0 ||
		!requestFile.defaultExport
	) {
		return undefined;
	}

	const handler = localizeDefaultExport(sourceText);
	if (!handler) {
		return undefined;
	}

	return {
		code: requestFileWrapperSource(requestFile, handler.code, handler.name),
		file: requestFile.file,
		kind: requestFile.kind,
	};
}

function parseApiRequestFile(
	file: string,
	apiFile: string,
	sourceText: string,
): Extract<RequestFileParseResult, { kind: 'api' }> {
	const defaultExport = findDefaultFunctionExport(sourceText);
	const cache = parseCacheMetadata(sourceText);
	const diagnostics = [
		...missingDefaultFunctionDiagnostics('api', defaultExport),
		...httpMethodExportDiagnostics(sourceText),
		...cacheMetadataDiagnostics(sourceText, cache),
	];

	return {
		...(cache ? { cache } : {}),
		...(defaultExport ? { defaultExport } : {}),
		diagnostics,
		file,
		kind: 'api',
		...apiRouteFromFile(apiFile),
	};
}

function parseMiddlewareRequestFile(
	file: string,
	sourceText: string,
): Extract<RequestFileParseResult, { kind: 'middleware' }> {
	const defaultExport = findDefaultFunctionExport(sourceText);
	const diagnostics = missingDefaultFunctionDiagnostics('middleware', defaultExport);

	return {
		...(defaultExport ? { defaultExport } : {}),
		diagnostics,
		file,
		kind: 'middleware',
	};
}

function apiRouteFromFile(apiFile: string): {
	readonly method: ApiRequestFileMethod;
	readonly route: ApiRequestFileRoute;
} {
	const withoutExtension = apiFile.slice(0, -REQUEST_FILE_EXTENSION.length);
	const rawSegments = normalize(join(withoutExtension)).split('/');
	const finalSegment = rawSegments.at(-1)!;
	const method = methodSuffix(finalSegment);

	if (method !== 'all') {
		rawSegments[rawSegments.length - 1] = finalSegment.slice(0, -(method.length + 1));
	}

	if (rawSegments.at(-1) === 'index') {
		rawSegments.pop();
	}

	const segments = rawSegments.filter(Boolean);
	const normalizedSegments = segments.map(normalizeRouteSegment);
	const pathnameSegments = normalizedSegments.map((segment) => segment.pathname);
	const patternSegments = normalizedSegments.map((segment) => segment.pattern);

	return {
		method,
		route: {
			params: normalizedSegments.flatMap((segment) => segment.params),
			pathname: requestPathname([API_DIR, ...pathnameSegments]),
			pattern: requestPathname([API_DIR, ...patternSegments]),
		},
	};
}

function normalizeRouteSegment(segment: string): NormalizedRequestRouteSegment {
	const catchAll = segment.match(/^\[\.\.\.([A-Za-z_$][\w$]*)\]$/);
	if (catchAll) {
		return {
			params: [{ kind: 'catch-all', name: catchAll[1]! }],
			pathname: '**',
			pattern: `[...${catchAll[1]}]`,
		};
	}

	const dynamic = segment.match(/^\[([A-Za-z_$][\w$]*)\]$/);
	if (dynamic) {
		return {
			params: [{ kind: 'dynamic', name: dynamic[1]! }],
			pathname: `:${dynamic[1]}`,
			pattern: `[${dynamic[1]}]`,
		};
	}

	return {
		params: [],
		pathname: segment,
		pattern: segment,
	};
}

function requestPathname(segments: readonly string[]): string {
	if (segments.length === 0) {
		return '/';
	}

	const [base, ...rest] = segments;
	return withLeadingSlash(joinURL(base!, ...rest));
}

function methodSuffix(finalSegment: string): ApiRequestFileMethod {
	const suffix = finalSegment.split('.').at(-1);
	return suffix && HTTP_METHODS.has(suffix) ? (suffix as ApiRequestFileMethod) : 'all';
}

function findDefaultFunctionExport(sourceText: string): RequestFileDefaultExport | undefined {
	const directFunction = sourceText.match(
		/\bexport\s+default\s+(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(\s*([A-Za-z_$][\w$]*)?/,
	);
	if (directFunction) {
		return { kind: 'function', parameterName: directFunction[1] };
	}

	const directArrow = sourceText.match(
		/\bexport\s+default\s+(?:async\s+)?(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))\s*=>/,
	);
	if (directArrow) {
		return { kind: 'function', parameterName: directArrow[1] ?? directArrow[2] };
	}

	const defaultIdentifier = sourceText.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/)?.[1];
	if (!defaultIdentifier) {
		return undefined;
	}

	const escapedIdentifier = escapeRegExp(defaultIdentifier);
	const constArrow = sourceText.match(
		new RegExp(
			`\\bconst\\s+${escapedIdentifier}\\s*=\\s*(?:async\\s+)?(?:\\(\\s*([A-Za-z_$][\\w$]*)?\\s*\\)|([A-Za-z_$][\\w$]*))\\s*=>`,
		),
	);
	if (constArrow) {
		return { kind: 'function', parameterName: constArrow[1] ?? constArrow[2] };
	}

	const functionDeclaration = sourceText.match(
		new RegExp(
			`\\b(?:async\\s+)?function\\s+${escapedIdentifier}\\s*\\(\\s*([A-Za-z_$][\\w$]*)?`,
		),
	);
	if (functionDeclaration) {
		return { kind: 'function', parameterName: functionDeclaration[1] };
	}

	return undefined;
}

function parseCacheMetadata(sourceText: string): ApiRequestFileCache | undefined {
	const objectLiteral = sourceText.match(
		/\bexport\s+const\s+cache\s*=\s*(\{[\s\S]*?\})\s*;?/,
	)?.[1];
	if (!objectLiteral) {
		return undefined;
	}

	const maxAge = objectLiteral.match(/^\{\s*maxAge\s*:\s*(\d+(?:\.\d+)?)\s*,?\s*\}$/)?.[1];
	return maxAge ? { maxAge: Number(maxAge) } : undefined;
}

function missingDefaultFunctionDiagnostics(
	kind: 'api' | 'middleware',
	defaultExport: RequestFileDefaultExport | undefined,
): RequestFileDiagnostic[] {
	if (defaultExport) return [];

	return [
		{
			code: 'missing-default-function',
			message:
				kind === 'api'
					? 'API files must default export a function.'
					: 'Middleware files must default export a function.',
		},
	];
}

function httpMethodExportDiagnostics(sourceText: string): RequestFileDiagnostic[] {
	const exportedMethods = new Set<string>();
	const exportPatterns = [
		/\bexport\s+(?:async\s+)?function\s+([A-Z]+)\b/g,
		/\bexport\s+const\s+([A-Z]+)\b/g,
		/\bexport\s*\{([^}]+)\}/g,
	];

	for (const pattern of exportPatterns) {
		for (const match of sourceText.matchAll(pattern)) {
			const exportClause = match[1];
			if (!exportClause) continue;

			if (exportClause.includes(',')) {
				for (const exportName of exportClause.split(',')) {
					addHttpMethodExport(exportedMethods, exportName);
				}
				continue;
			}

			addHttpMethodExport(exportedMethods, exportClause);
		}
	}

	return Array.from(exportedMethods)
		.toSorted()
		.map((method) => ({
			code: 'http-method-export' as const,
			message: `Do not export ${method}; the HTTP method comes from the filename.`,
		}));
}

function addHttpMethodExport(methods: Set<string>, exportName: string): void {
	const method = exportName
		.trim()
		.split(/\s+as\s+/i)
		.at(-1)
		?.trim();
	if (method && HTTP_METHODS.has(method.toLowerCase())) {
		methods.add(method.toUpperCase());
	}
}

function cacheMetadataDiagnostics(
	sourceText: string,
	cache: ApiRequestFileCache | undefined,
): RequestFileDiagnostic[] {
	if (!/\bexport\s+const\s+cache\b/.test(sourceText) || cache) {
		return [];
	}

	return [
		{
			code: 'invalid-cache-metadata',
			message: 'Use export const cache for endpoint cache metadata.',
		},
	];
}

function apiRelativeFile(file: string): string | undefined {
	if (!isRequestModuleFile(file) || file === API_DIR || !file.startsWith(`${API_DIR}/`)) {
		return undefined;
	}

	return relative(API_DIR, file);
}

function middlewareRelativeFile(file: string): string | undefined {
	if (
		!isRequestModuleFile(file) ||
		file === MIDDLEWARE_DIR ||
		!file.startsWith(`${MIDDLEWARE_DIR}/`)
	) {
		return undefined;
	}

	return relative(MIDDLEWARE_DIR, file);
}

function localizeDefaultExport(
	sourceText: string,
): { readonly code: string; readonly name: string } | undefined {
	const defaultIdentifierMatch = sourceText.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/);
	if (defaultIdentifierMatch) {
		return {
			code: sourceText.replace(defaultIdentifierMatch[0], ''),
			name: defaultIdentifierMatch[1]!,
		};
	}

	const directDefaultMatch = sourceText.match(/\bexport\s+default\b/);
	if (!directDefaultMatch || directDefaultMatch.index === undefined) {
		return undefined;
	}

	return {
		code: `${sourceText.slice(
			0,
			directDefaultMatch.index,
		)}const __markless_request_handler__ =${sourceText.slice(
			directDefaultMatch.index + directDefaultMatch[0].length,
		)}`,
		name: '__markless_request_handler__',
	};
}

function requestFileWrapperSource(
	requestFile: Extract<RequestFileParseResult, { kind: 'api' | 'middleware' }>,
	sourceText: string,
	handlerName: string,
): string {
	const defineImport =
		requestFile.kind === 'api' && requestFile.cache
			? 'import { __marklessDefineCachedHandler as __markless_define_handler__ } from "@markless/router";'
			: 'import { __marklessDefineHandler as __markless_define_handler__ } from "@markless/router";';
	const wrappedHandler = `(event) =>
	${handlerName}(__markless_create_http_context__(event))`;
	const wrappedDefault =
		requestFile.kind === 'api' && requestFile.cache
			? `__markless_define_handler__(${wrappedHandler}, cache)`
			: `__markless_define_handler__(${wrappedHandler})`;

	return `${defineImport}
import { __marklessCreateHttpContext as __markless_create_http_context__ } from "@markless/router";

${sourceText.trimEnd()}

export default ${wrappedDefault};
`;
}

function isRequestModuleFile(file: string): boolean {
	return extname(file) === REQUEST_FILE_EXTENSION && basename(file) !== REQUEST_FILE_EXTENSION;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
