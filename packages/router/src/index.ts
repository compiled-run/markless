export {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	normalizeRequestPathname,
	normalizeRouteFileId,
} from './route-manifest.ts';
export type {
	RouteManifest,
	RouteManifestMatch,
	RouteManifestParam,
	RouteManifestRoute,
	RouteManifestStatusPages,
} from './route-manifest.ts';
export {
	normalizeRequestFileId,
	parseRequestFile,
	transformRequestFileSource,
} from './request-files.ts';
export type {
	ApiRequestFileCache,
	ApiRequestFileMethod,
	ApiRequestFileRoute,
	RequestFileDefaultExport,
	RequestFileDiagnostic,
	RequestFileDiagnosticCode,
	RequestFileParam,
	RequestFileParseResult,
	RequestFileTransformResult,
} from './request-files.ts';
export { ARCADE_ROUTER_ROUTE_EVENT, dispatchRouteUpdate, routePageProps } from './route-state.ts';
export type {
	RouteDocumentModule,
	RoutePageModule,
	RouteState,
	RouteUpdate,
} from './route-state.ts';

export interface PageProps<Params extends object = Readonly<Record<string, string>>> {
	readonly params: Readonly<Params>;
	readonly url: {
		readonly href: string;
		readonly pathname: string;
		readonly search: string;
	};
	readonly status: number;
}

export interface ArcadeRouterGeneratedRoutes {}

export interface LinkNavigationProps {
	readonly prefetch?: boolean | 'intent' | 'viewport';
	readonly replace?: boolean;
	readonly scroll?: boolean;
}

export type DefaultLinkProps = {
	readonly href?: string;
	readonly children?: unknown;
	readonly class?: string;
	readonly id?: string;
	readonly target?: string;
	readonly rel?: string;
	readonly [prop: string]: unknown;
} & LinkNavigationProps;

export type LinkProps = ArcadeRouterGeneratedRoutes extends { readonly link: infer Props }
	? Props
	: DefaultLinkProps;

export interface AppLocals {}

export interface HttpResponse {
	readonly headers: Headers;
	status?: number;
	statusText?: string;
}

export interface HttpContext<Locals extends object = AppLocals> {
	readonly locals: Locals;
	readonly request: Request;
	readonly response: HttpResponse;
	readonly url: URL;
}

export interface EndpointHttpContext<
	Params extends object = Readonly<Record<string, string>>,
	Locals extends object = AppLocals,
> extends HttpContext<Locals> {
	readonly params: Readonly<Params>;
}

export interface MiddlewareHttpContext<
	Locals extends object = AppLocals,
> extends HttpContext<Locals> {}

type RuntimeHttpEvent = {
	readonly context?: Record<string, unknown>;
	readonly req?: Request;
	readonly res?: HttpResponse;
	readonly url?: URL;
};

export function __arcadeCreateHttpContext<
	Params extends object = Readonly<Record<string, string>>,
	Locals extends object = AppLocals,
>(event: RuntimeHttpEvent): EndpointHttpContext<Params, Locals> {
	const context = event.context ?? {};
	const url = event.url ?? new URL('http://localhost/');

	return {
		locals: context as Locals,
		params: (context.params ?? {}) as Params,
		request: event.req ?? new Request(url),
		response: event.res ?? { headers: new Headers() },
		url,
	};
}

export function Html(props: { readonly children?: unknown }): unknown {
	return props.children;
}

export function Link(_props: LinkProps): unknown {
	throw new Error('Arcade Router Link must be compiled from a .tsrx file before runtime use.');
}
