import {
	createExternalDelegateStructureTokens,
	createExternalDelegateView,
} from '@markless/web/fns/external-delegate';
import {
	LINK_ATTRIBUTE,
	PREFETCH_ATTRIBUTE,
	REPLACE_ATTRIBUTE,
	SCROLL_ATTRIBUTE,
} from './link-attributes.ts';
import { IN_PLACE_LOCATION_HEADER, IN_PLACE_REQUEST_HEADER } from '@markless/web/fns/in-place-headers';
import { HTML_ATTRIBUTES_SLOT } from './route-dom.ts';
import { rememberRequestLocals } from './request-locals.ts';

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
export { navigate } from './navigate.ts';
export type { NavigateOptions } from './navigate.ts';
export { startRouteUpdateRenderer } from './route-renderer.ts';
// Consumed by the published vite-plugin client entry (src/vite/entries/
// client-entry.ts), which can only reach this module through the package's
// root export once installed from npm.
export { __marklessRouterStartSpaNavigation, ensureNavigationRuntime } from './spa-navigation.ts';
export {
	MARKLESS_ROUTER_RENDERED_EVENT,
	MARKLESS_ROUTER_ROUTE_EVENT,
	dispatchRouteUpdate,
	routePageProps,
} from './route-state.ts';
export type {
	RouteDocumentModule,
	RoutePageModule,
	RouteState,
	RouteUpdate,
} from './route-state.ts';

export interface PageProps<
	Params extends object = Readonly<Record<string, string>>,
	Locals extends object = AppLocals,
> {
	/**
	 * The request and the response being written, the same object API routes and middleware get.
	 * It exists only while the page renders on the server: the compiler refuses any read of it from
	 * code that runs in the browser. Set `http.response.status` and `http.response.headers` before the
	 * first byte is sent; a later write that changes them throws `MARKLESS_ROUTER_RESPONSE_COMMITTED`.
	 */
	readonly http: HttpContext<Locals>;
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
	/**
	 * `false`: nothing for this link downloads before it is clicked. Only page routes are ever
	 * prefetched (with a `Purpose: prefetch` header), never `/api` endpoints; set `false` on a link to
	 * a page whose GET has side effects (a one-time token, a counter) so only the click requests it.
	 */
	readonly prefetch?: boolean;
	readonly replace?: boolean;
	readonly scroll?: boolean;
}

declare global {
	namespace __MarklessTypeService {
		/** Filled in by @markless/typescript-plugin's JSX contract; a plain TypeScript program loads none. */
		interface RouterContract {}
	}
}

type JsxChild = __MarklessTypeService.RouterContract extends { readonly child: infer Child }
	? Child
	: unknown;

type HtmlAttributes = __MarklessTypeService.RouterContract extends {
	readonly htmlAttributes: infer Attributes;
}
	? Attributes
	: { readonly [name: string]: unknown };

export type DefaultLinkProps = {
	readonly href?: string;
	readonly children?: JsxChild;
	readonly class?: string;
	readonly id?: string;
	readonly target?: string;
	readonly rel?: string;
	readonly [prop: string]: unknown;
} & LinkNavigationProps;

export type LinkProps = MarklessRouterGeneratedRoutes extends { readonly link: infer Props }
	? Props &
			Pick<DefaultLinkProps, 'children' | 'class' | 'id' | 'target' | 'rel'> & {
				readonly [prop: string]: unknown;
			}
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
	if (event.req) rememberRequestLocals(event.req, context, event.res?.headers);

	return {
		locals: context as Locals,
		params: (context.params ?? {}) as Params,
		request: event.req ?? new Request(url),
		response: event.res ?? { headers: new Headers() },
		url,
	};
}

const CROSS_SITE_WRITE_REFUSED =
	'MARKLESS_ROUTER_CROSS_SITE_WRITE_REFUSED: this api/ route refused a write that a browser sent from another site. Writes are accepted from pages on this origin and from callers that are not browsers, such as curl or another server.';

/** The 403 an api/ route answers when a browser sends it a write from another site, so a page elsewhere cannot act for a signed-in visitor. */
export function __marklessRefuseCrossSiteWrite(event: RuntimeHttpEvent): Response | undefined {
	const request = event.req;
	if (!request || request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
		return undefined;
	const site = request.headers.get('sec-fetch-site');
	const origin = request.headers.get('origin');
	const crossSite = site
		? site !== 'same-origin' && site !== 'none'
		: origin !== null && origin !== (event.url ?? new URL(request.url)).origin;
	return crossSite
		? new Response(CROSS_SITE_WRITE_REFUSED, {
				status: 403,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		: undefined;
}

// The redirects after which the browser fetches the location with GET; a 307 or 308 repeats the POST, so it stays the browser's.
const REDIRECTS_TO_GET: ReadonlySet<number> = new Set([301, 302, 303]);

/**
 * A form Markless sends in place marks its POST; this api/ route's redirect to an http(s) page then answers with no
 * body and its location in a header, with every other header (cookies included), so the page that location names is
 * not fetched and thrown away. Runs after the cross-site check, so the mark changes only how an accepted request's
 * redirect is answered; the answer is never stored, and any other method or location keeps the redirect.
 */
export function __marklessAnswerInPlace(event: RuntimeHttpEvent, answer: unknown): unknown {
	const request = event.req;
	// A Response, or an answer shaped like one (h3's redirect() returns its own HTTPResponse class).
	const shaped = answer as { readonly status?: unknown; readonly headers?: unknown; readonly body?: unknown } | null;
	if (typeof shaped?.status !== 'number' || !(shaped.headers instanceof Headers)) return answer;
	if (!REDIRECTS_TO_GET.has(shaped.status)) return answer;
	if (request?.method !== 'POST' || !request.headers.get(IN_PLACE_REQUEST_HEADER)) return answer;
	const location = shaped.headers.get('location');
	if (location === null) return answer;
	let landed: URL;
	try {
		landed = new URL(location, event.url ?? request.url);
	} catch {
		return answer;
	}
	if (landed.protocol !== 'http:' && landed.protocol !== 'https:') return answer;
	if (shaped.body instanceof ReadableStream) void shaped.body.cancel().catch(() => {});
	const headers = new Headers(shaped.headers);
	for (const name of ['location', 'content-length', 'content-encoding']) headers.delete(name);
	headers.set(IN_PLACE_LOCATION_HEADER, location);
	headers.set('cache-control', 'no-store');
	headers.append('vary', IN_PLACE_REQUEST_HEADER);
	return new Response(null, { status: 200, headers });
}

export const Html = Object.assign(
	function Html(props: HtmlAttributes & { readonly children?: JsxChild }): unknown {
		return props.children;
	},
	{
		renderSsr(
			props: {
				readonly children?: JsxChild;
				readonly [name: string]: unknown;
			} = {},
			renderContext?: { readonly [HTML_ATTRIBUTES_SLOT]?: Record<string, unknown> },
		) {
			const { children, ...attributes } = props;
			if (renderContext?.[HTML_ATTRIBUTES_SLOT])
				Object.assign(renderContext[HTML_ATTRIBUTES_SLOT], attributes);
			return { html: children == null ? '' : String(children), elementCount: 0 };
		},
	},
);

type LinkComponent = {
	(props?: LinkProps): unknown;
	renderCsr(props?: LinkProps): {
		root: HTMLAnchorElement;
		view: ReturnType<typeof createExternalDelegateView>;
		liveHostNodes: Map<string, HTMLAnchorElement>;
	};
	renderSsr(
		props?: LinkProps,
		renderContext?: { readonly idPrefix?: string },
	): {
		html: string;
		elementCount: number;
		structureTokens: ReturnType<typeof createExternalDelegateStructureTokens>;
		view: ReturnType<typeof createExternalDelegateView>;
	};
};

export const Link: LinkComponent = Object.assign(
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
			return {
				root: anchor,
				view: linkExternalDelegateView(),
				liveHostNodes: new Map([['router:link', anchor]]),
			};
		},
		renderSsr(props: LinkProps = {}, renderContext?: { readonly idPrefix?: string }) {
			const attributes = linkAnchorAttributes(props).map(([name, value]) =>
				value === '' ? name : `${name}="${escapeHtml(value)}"`,
			);

			return {
				html: `<a ${attributes.join(' ')}>${linkChildrenHtml(props)}</a>`,
				elementCount: 1,
				structureTokens: createExternalDelegateStructureTokens({
					hostNodeId: 'router:link',
					idPrefix: renderContext?.idPrefix,
					tagName: 'a',
				}),
				view: linkExternalDelegateView(),
			};
		},
	},
);

function linkExternalDelegateView() {
	return createExternalDelegateView({
		eventName: 'click',
		hostNodeId: 'router:link',
		owner: 'router',
		tagName: 'a',
	});
}

function linkAnchorAttributes(props: LinkProps): Array<readonly [string, string]> {
	const attributes = new Map<string, string>();
	const input = props as Record<string, unknown>;

	for (const [name, value] of Object.entries(input)) {
		if (isLinkInternalProp(name)) continue;
		const attributeValue = linkAttributeValue(value);
		if (attributeValue !== undefined) attributes.set(name, attributeValue);
	}

	attributes.set('href', typeof props.href === 'string' ? props.href : '#');
	attributes.set(LINK_ATTRIBUTE, '');
	if (props.replace) attributes.set(REPLACE_ATTRIBUTE, '');
	if (props.prefetch === false) attributes.set(PREFETCH_ATTRIBUTE, 'none');
	if (props.scroll === false) attributes.set(SCROLL_ATTRIBUTE, 'manual');
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
