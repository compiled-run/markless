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
export { startRouteUpdateRenderer } from './route-renderer.ts';
export { MARKLESS_ROUTER_ROUTE_EVENT, dispatchRouteUpdate, routePageProps } from './route-state.ts';
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

export interface MarklessRouterGeneratedRoutes {}

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

export type LinkProps = MarklessRouterGeneratedRoutes extends { readonly link: infer Props }
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

export function __marklessCreateHttpContext<
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

export const Html = Object.assign(
	function Html(props: { readonly children?: unknown }): unknown {
		return props.children;
	},
	{
		renderSsr(props: { readonly children?: unknown } = {}) {
			return { html: props.children == null ? '' : String(props.children) };
		},
	},
);

export const Link = Object.assign(
	function Link(props: LinkProps = {}): unknown {
		return props.children;
	},
	{
		renderCsr(props: LinkProps = {}) {
			const anchor = document.createElement('a');
			for (const [name, value] of linkAnchorAttributes(props)) {
				anchor.setAttribute(name, value);
			}
			anchor.innerHTML = linkChildrenHtml(props);
			return { root: anchor };
		},
		renderSsr(props: LinkProps = {}) {
			const attributes = linkAnchorAttributes(props).map(([name, value]) =>
				value === '' ? name : `${name}="${escapeHtml(value)}"`,
			);

			return { html: `<a ${attributes.join(' ')}>${linkChildrenHtml(props)}</a>` };
		},
	},
);

function linkAnchorAttributes(props: LinkProps): Array<readonly [string, string]> {
	const attributes = new Map<string, string>();
	const input = props as Record<string, unknown>;

	for (const [name, value] of Object.entries(input)) {
		if (isLinkInternalProp(name)) continue;
		const attributeValue = linkAttributeValue(value);
		if (attributeValue !== undefined) attributes.set(name, attributeValue);
	}

	attributes.set('href', typeof props.href === 'string' ? props.href : '#');
	attributes.set('data-markless-router-link', '');
	if (props.replace) attributes.set('data-markless-router-replace', '');
	if (props.scroll === false) attributes.set('data-markless-router-scroll', 'manual');
	return [...attributes];
}

function isLinkInternalProp(name: string): boolean {
	return (
		name === 'children' ||
		name === 'params' ||
		name === 'prefetch' ||
		name === 'replace' ||
		name === 'scroll' ||
		name === '__marklessSsrCallbacks'
	);
}

function linkAttributeValue(value: unknown): string | undefined {
	if (value === true) return '';
	if (value === false || value == null) return undefined;
	if (typeof value === 'function' || typeof value === 'symbol') return undefined;
	return String(value);
}

function linkChildrenHtml(props: LinkProps): string {
	return props.children == null ? '' : String(props.children);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
