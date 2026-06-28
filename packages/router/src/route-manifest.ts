import { extname, join, normalize, relative } from 'pathe';
import { joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo';

const PAGES_DIR = 'pages';
const PAGE_EXTENSIONS = new Set(['.tsrx', '.mdx']);

export interface RouteManifestRoute {
	readonly pathname: string;
	readonly pattern: string;
	readonly file: string;
	readonly params: readonly RouteManifestParam[];
}

export interface RouteManifestParam {
	readonly name: string;
	readonly kind: 'dynamic' | 'catch-all';
}

export interface RouteManifestStatusPages {
	readonly notFound?: string;
	readonly error?: string;
}

export interface RouteManifest {
	readonly routes: readonly RouteManifestRoute[];
	readonly statusPages: RouteManifestStatusPages;
}

export interface RouteManifestMatch {
	readonly route: RouteManifestRoute;
	readonly params: Readonly<Record<string, string>>;
}

type InternalRouteManifestRoute = RouteManifestRoute & {
	readonly identity: string;
	readonly relativeFile: string;
};

type NormalizedPage =
	| {
			readonly kind: 'route';
			readonly route: InternalRouteManifestRoute;
	  }
	| {
			readonly kind: 'status';
			readonly status: keyof RouteManifestStatusPages;
			readonly file: string;
	  };

type NormalizedRouteSegment = {
	readonly pathname: string;
	readonly identity: string;
	readonly params: readonly RouteManifestParam[];
};

export function buildRouteManifestFromFileIds(fileIds: readonly string[]): RouteManifest {
	const pages = unique(fileIds.map(normalizeRouteFileId))
		.filter(isPageModuleFile)
		.toSorted((left, right) => left.localeCompare(right))
		.map(normalizePage);
	const routes = pages.flatMap((page) => (page.kind === 'route' ? [page.route] : []));

	assertNoRouteConflicts(routes);

	const statusPages: Partial<Record<keyof RouteManifestStatusPages, string>> = {};
	for (const page of pages) {
		if (page.kind === 'status') {
			statusPages[page.status] = page.file;
		}
	}

	return {
		routes: routes.map(toPublicRoute).toSorted(compareRoutes),
		statusPages,
	};
}

export function normalizeRequestPathname(pathname: string): string {
	const normalizedPathname = withoutTrailingSlash(withLeadingSlash(pathname));
	return normalizedPathname === '' ? '/' : normalizedPathname;
}

export function normalizeRouteFileId(fileId: string): string {
	return withoutLeadingSlash(normalize(fileId));
}

export function matchRouteManifest(
	pathname: string,
	manifest: RouteManifest,
): RouteManifestMatch | undefined {
	const requestPathname = normalizeRequestPathname(pathname);

	for (const route of manifest.routes) {
		const params = matchRoutePathname(route, requestPathname);
		if (params) {
			return { route, params };
		}
	}
}

function isPageModuleFile(file: string): boolean {
	const pageFile = pageRelativeFile(file);
	return pageFile !== undefined && PAGE_EXTENSIONS.has(extname(pageFile));
}

function normalizePage(file: string): NormalizedPage {
	const relativeFile = file;
	const pageFile = pageRelativeFile(file)!;
	const extension = extname(pageFile);
	const withoutExtension = pageFile.slice(0, -extension.length);

	if (withoutExtension === 'api' || withoutExtension.startsWith('api/')) {
		throw new Error(
			`API routes inside pages/ are not supported. Use top-level api/: ${relativeFile}`,
		);
	}

	const routeFile = normalize(join(withoutExtension));
	const rawSegments = routeFile === '.' ? [] : routeFile.split('/');

	if (rawSegments.length === 1 && rawSegments[0] === '404') {
		return { kind: 'status', status: 'notFound', file: relativeFile };
	}

	if (rawSegments.length === 1 && rawSegments[0] === '500') {
		return { kind: 'status', status: 'error', file: relativeFile };
	}

	if (rawSegments.length > 1 && ['404', '500'].includes(rawSegments.at(-1)!)) {
		throw new Error(`Nested status pages are not supported in v0: ${relativeFile}`);
	}

	if (rawSegments.at(-1) === 'index') {
		rawSegments.pop();
	}

	const pattern = routePathname(rawSegments);
	const segments = rawSegments.map((segment, index) =>
		normalizeSegment(segment, index, rawSegments, relativeFile),
	);
	const pathnameSegments = segments.map((segment) => segment.pathname);
	const identitySegments = segments.map((segment) => segment.identity);
	const params = segments.flatMap((segment) => segment.params);

	return {
		kind: 'route',
		route: {
			pathname: routePathname(pathnameSegments),
			pattern,
			identity: routePathname(identitySegments),
			params,
			file: relativeFile,
			relativeFile,
		},
	};
}

function pageRelativeFile(file: string): string | undefined {
	if (file === PAGES_DIR || !file.startsWith(`${PAGES_DIR}/`)) {
		return undefined;
	}

	return relative(PAGES_DIR, file);
}

function normalizeSegment(
	segment: string,
	index: number,
	segments: readonly string[],
	relativeFile: string,
): NormalizedRouteSegment {
	const catchAll = segment.match(/^\[\.\.\.([A-Za-z_$][\w$]*)\]$/);

	if (catchAll) {
		if (index !== segments.length - 1) {
			throw new Error(`Catch-all route segments must be final: ${relativeFile}`);
		}

		return {
			pathname: '**',
			identity: '**',
			params: [{ name: catchAll[1]!, kind: 'catch-all' }],
		};
	}

	const dynamic = segment.match(/^\[([A-Za-z_$][\w$]*)\]$/);

	if (dynamic) {
		return {
			pathname: `:${dynamic[1]}`,
			identity: ':param',
			params: [{ name: dynamic[1]!, kind: 'dynamic' }],
		};
	}

	if (segment.includes('[') || segment.includes(']')) {
		throw new Error(`Unsupported route segment pattern: ${relativeFile}`);
	}

	return {
		pathname: segment,
		identity: segment,
		params: [],
	};
}

function assertNoRouteConflicts(routes: readonly InternalRouteManifestRoute[]): void {
	const routesByIdentity = new Map<string, InternalRouteManifestRoute[]>();

	for (const route of routes) {
		const existingRoutes = routesByIdentity.get(route.identity) ?? [];
		existingRoutes.push(route);
		routesByIdentity.set(route.identity, existingRoutes);
	}

	for (const [identity, conflictingRoutes] of routesByIdentity) {
		if (conflictingRoutes.length < 2) {
			continue;
		}

		const files = conflictingRoutes
			.map((route) => route.relativeFile)
			.toSorted((left, right) => left.localeCompare(right));

		throw new Error(
			[
				`Route conflict: ${identity} is defined by both:`,
				...files.map((file) => `- ${file}`),
			].join('\n'),
		);
	}
}

function toPublicRoute(route: InternalRouteManifestRoute): RouteManifestRoute {
	return {
		pathname: route.pathname,
		pattern: route.pattern,
		params: route.params,
		file: route.file,
	};
}

function compareRoutes(left: RouteManifestRoute, right: RouteManifestRoute): number {
	const leftSegments = splitRoutePathname(left.pathname);
	const rightSegments = splitRoutePathname(right.pathname);
	const length = Math.max(leftSegments.length, rightSegments.length);

	for (let index = 0; index < length; index += 1) {
		const leftSegment = leftSegments[index];
		const rightSegment = rightSegments[index];

		if (leftSegment === undefined) return -1;
		if (rightSegment === undefined) return 1;

		const rankDifference = segmentRank(leftSegment) - segmentRank(rightSegment);
		if (rankDifference !== 0) return rankDifference;
		if (segmentRank(leftSegment) === 0 && leftSegment !== rightSegment) {
			return leftSegment.localeCompare(rightSegment);
		}
	}

	return left.pathname.localeCompare(right.pathname);
}

function splitRoutePathname(pathname: string): string[] {
	const route = withoutLeadingSlash(pathname);
	return route === '' ? [] : route.split('/');
}

function matchRoutePathname(
	route: RouteManifestRoute,
	requestPathname: string,
): Readonly<Record<string, string>> | undefined {
	const routeSegments = splitRoutePathname(route.pathname);
	const requestSegments = splitRoutePathname(requestPathname);
	const catchAllIndex = routeSegments.indexOf('**');

	if (catchAllIndex === -1 && routeSegments.length !== requestSegments.length) {
		return undefined;
	}

	if (catchAllIndex !== -1 && requestSegments.length <= catchAllIndex) {
		return undefined;
	}

	const params: Record<string, string> = {};

	for (let index = 0; index < routeSegments.length; index += 1) {
		const routeSegment = routeSegments[index]!;
		const requestSegment = requestSegments[index]!;

		if (routeSegment === '**') {
			const catchAllParam = route.params.find((param) => param.kind === 'catch-all');
			if (!catchAllParam) return undefined;
			params[catchAllParam.name] = joinURL(
				requestSegment,
				...requestSegments.slice(index + 1),
			);
			return params;
		}

		if (routeSegment.startsWith(':')) {
			params[routeSegment.slice(1)] = requestSegment;
			continue;
		}

		if (routeSegment !== requestSegment) {
			return undefined;
		}
	}

	return params;
}

function segmentRank(segment: string): number {
	if (segment === '**') return 2;
	if (segment.startsWith(':')) return 1;
	return 0;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function routePathname(segments: readonly string[]): string {
	if (segments.length === 0) {
		return '/';
	}

	const [base, ...rest] = segments;
	return withLeadingSlash(joinURL(base!, ...rest));
}
