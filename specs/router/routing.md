# Routing

Status: Draft

Markless Router maps files under top-level `pages/` to URL routes.

Supported page extensions:

```txt
.tsrx
.mdx
```

Unsupported page extensions:

```txt
.tsx
.jsx
```

Required mappings:

```txt
pages/index.tsrx          -> /
pages/index.mdx           -> / if pages/index.tsrx is absent
pages/about.tsrx          -> /about
pages/docs.mdx            -> /docs
pages/blog/[slug].tsrx    -> /blog/:slug
pages/docs/[...slug].mdx  -> /docs/**
pages/404.tsrx or .mdx    -> unmatched page requests, status 404
pages/500.tsrx or .mdx    -> unhandled page rendering errors, status 500
```

Route conflict rules are extension-neutral. `pages/docs.tsrx` and
`pages/docs.mdx` both map to `/docs`, so the router must fail with a direct
conflict error.

`api/` and `middleware/` are top-level request lifecycle folders. A page file
(`.tsrx` or `.mdx`) under `pages/api/` is a page like any other, so
`pages/api/index.tsrx` answers `/api` beside the endpoints in `api/`; other
modules beside it stay page code. Under `/api` only those pages answer, never a
root catch-all page. One address answered by both a page and an endpoint that
takes GET (a file with no method suffix, or `.get`/`.head`) fails the build
with a `Route conflict:` error naming both files; an endpoint for another
method, such as `api/contact.post.ts` beside `pages/api/contact.tsrx`, leaves
the page its GET.

## Page placement

The page's markup lands where the document's `{children}` sits, with no element
of the router's own around it. When `{children}` is the first thing inside an
element that can hold any content (normally `<body>`), that element is the
page's resume container: the page's top-level elements are its own children, it
carries the container attributes, and a `<!--markless:page-end-->` comment
(`PROTOCOL_CONTAINER_END_COMMENT`) closes the page's nodes, so document content
after `{children}` stays in place and is never counted as the page's. A site's
`body > footer`, `body > header:first-child` and sibling selectors between the
page's own parts keep matching on the landing, after a navigation swap and
after a client render of a `#/` route.

- The page's payload and resumer scripts follow its last element, so `+` and
  `:last-child` between the page's last element and what follows it see those
  scripts.
- Document content before `{children}` inside the same element (`<body><nav />
  {children}</body>`) would shift every page element the browser finds by its
  position, which built resume modules record, so that page keeps a
  `<div data-async-container>` around it.
- A navigation swap replaces the container element with a fresh one, so
  nothing the leaving page attached to it survives. Attributes a script set on
  it, and the nodes after the page-end comment, move to the new one; a script
  holding a reference to the old `<body>` element holds a detached one.

## Page request and response

A page component receives `PageProps`: `params`, `url`, `status`, and `http`.
`http` is the same `HttpContext` that API routes and middleware receive:

```txt
http.request            the incoming Request
http.url                its URL
http.locals             the object middleware wrote for this request
http.response.status    the page response status (defaults to the route status)
http.response.headers   headers added to the page response
```

Example, `pages/invoices/[id].tsrx`:

```tsrx
import type { PageProps } from '@markless/router';
import { findInvoice } from '../../src/invoices.ts';

export default function Invoice({ params, http }: PageProps<{ id: string }>) @{
	const invoice = findInvoice(params.id);
	if (!invoice) http.response.status = 404;
	const title = invoice ? `Invoice ${invoice.number}` : 'No such invoice';

	<h1>{title}</h1>
}
```

`GET /invoices/missing` answers 404 with the page's own body.

Rules:

- `http` exists only while the page renders on the server. Pages rendered in
  the browser (`mode: 'hash'` routing, client-rendered route changes) receive
  no `http`.
- The status and headers go out with the first byte. Blocking and streaming
  responses both honor writes made before that. Pages re-run their body for
  each render pass, so repeating a write that matches what was sent is
  allowed, and an identical `headers.append` is kept once. A later write that
  changes the status, status text, or headers throws
  `MARKLESS_ROUTER_RESPONSE_COMMITTED`; on a streamed page that error ends the
  stream.
- Headers middleware adds to `http.response.headers` (including every
  `set-cookie`) go out with every page response, whatever its status: a
  matched page, a page that set an error status, and the `404`/`500` status
  pages. A page header replaces a middleware header of the same name;
  `set-cookie` values are kept from both.
- Page props are serialized into the resumable payload; the router leaves
  `http` out of that payload.
- The compiler refuses browser code that reads `http`: event handlers,
  `attach` behaviors, a `computed()` that re-runs after resume (sync or
  async), markup the browser rebuilds (`@if`, `@for`, `@try` arms), and props
  passed to a child that reads them in browser code. The diagnostic is
  `MARKLESS_SERVER_ONLY_PROP_BROWSER_READ`. To give the browser one value,
  copy it into `state()` in the page body.
- The compiler learns which prop is server-only from the router: the router
  declares `http` on the default export of every `pages/` module through the
  Markless plugin. The rule follows that declaration, not the type annotation,
  so an untyped page is checked the same way.
- The router has no prerender mode of its own. A page prerendered by Nitro's
  `prerender` option renders once at build time against Nitro's build request:
  `http` describes that request, not a visitor, and a static host does not
  replay the headers the page set. Nitro writes no file for a route that
  answers with an error status such as 404, and lists it as a failed route
  (the build stops only with `prerender.failOnError`).

## Navigation

A route change fetches the destination's page region from the server and
swaps it in. That request names its own path: the page path under the prefix
`/_markless/fragment` (`FRAGMENT_PATH_PREFIX` in
`packages/router/src/vite/fragment-navigation.ts`), with the page's query kept,
so `/docs?tab=a` is fetched as `/_markless/fragment/docs?tab=a`. The server
answers that path with the region document and renders the page for the page
URL, so `url` and `http.url` never show the prefix. Every request to the page
URL itself answers the whole document.

- A page response depends on its URL alone, so a CDN or ISR cache that keys
  on the URL and ignores `Vary` keeps navigation fetches and page loads apart.
- A host rewrite that drops the query string keeps them apart too. On Vercel,
  Nitro's ISR rewrite passes the function only the path: a `/**` ISR rule
  matches the fragment path and caches it under that path, and a narrower
  rule such as `/docs/**` does not match it, so the fragment renders fresh.
  A prerendered page's static file never answers its fragment path on Vercel;
  on the Node server, Nitro's static handler sees the page path and answers a
  prerendered page's fragment path with its whole document.
- Route rules, middleware and request files see the page path: the router's
  Nitro plugin rewrites the request URL before routing, so a guard on a page
  path also guards its fragment. `http.request.url` keeps the fragment path.
- The address bar and history entries show the page URL, never the prefix.
- A redirect off the fragment path answers with a whole document; the router
  then loads the destination as a document.
- The prefix is root-relative; apps served under a non-root base path are not
  covered yet.

`navigate(href, { replace, scroll })` from `@markless/router` navigates from
code exactly as a click on `<Link href={href} replace scroll>` does: a page of
the app swaps in place, and anything the router cannot take (a path that names
no page, another origin, a call before the router has started) loads as a
document. `replace` replaces the
current history entry; `scroll: false` keeps the scroll position. It returns a
promise that resolves once the new page is in place; a navigation that loads a
new document leaves the page, so its promise never settles. It runs in the
browser only and throws `MARKLESS_ROUTER_NAVIGATE_SERVER` on the server.

The router package may integrate with an HTTP runtime through an adapter, but
shared route manifesting and request-file parsing must stay runtime-agnostic.
Renderer work must consume Markless compiled `.tsrx` artifacts; it must not
reintroduce TSX, client component re-execution, VDOM, or app-authored client/server entry ceremony.
