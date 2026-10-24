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
of the router's own around it. When `{children}` sits inside an element that can
hold any content (normally `<body>`), that element is the page's resume
container: the page's top-level elements are its own children and it carries
the container attributes. A `<!--markless:page-end-->` comment
(`PROTOCOL_CONTAINER_END_COMMENT`) closes the page's nodes, and when document
content precedes `{children}` in that element (`<body><header />{children}
<footer /></body>`) a `<!--markless:page-start-->` comment
(`PROTOCOL_CONTAINER_START_COMMENT`) opens them. Document content on either side
stays where the author wrote it and is never counted as the page's: every
position resume reads counts from the start comment. A site's `body > main`,
`header + main`, `body > footer` and sibling selectors between the page's own
parts keep matching on the landing, after a navigation swap and after a client
render of a `#/` route.

- The page's payload and resumer scripts follow its last element, so `+` and
  `:last-child` between the page's last element and what follows it see those
  scripts.
- Only whitespace before `{children}` writes no start comment. Any other
  element `{children}` sits in (a `<ul>`, a `<p>`) keeps a
  `<div data-async-container>` around the page.
- A navigation response carries only the page and the start comment, never the
  document content before it.
- A navigation swap keeps the container element and every node the two pages
  share, and changes only what differs, in one task: a node of the leaving page
  stays when the next page has a node of the same kind at the same place (same
  tag and `id`), and takes the next page's attributes, text and children.
  What both pages render alike (a header, a sidebar) is therefore the same
  nodes afterwards, so the hover under a resting pointer, focus, scroll offsets,
  running CSS transitions and a loaded `<iframe>` survive the swap. The page's
  scripts are always fresh nodes and run again, `<template>` elements are always
  replaced, a custom element is replaced unless it is unchanged, and a form
  control shows the value the server rendered for the next page.
- Nothing of the leaving page's runtime survives on the kept nodes: the swap
  retires its runtime, its startup scripts' listeners go quiet, and the state
  the framework kept on the container and on any node of it is dropped before
  the next page starts, exactly as on a landing. Attributes a script set on the
  container stay, and the document's nodes before the start comment and after
  the end comment are not touched.

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

### Layout templates

Pages that render the same layout (header, sidebar, footer) send it once, not
with every navigation.

- At build, after the page server is written, the router renders the region
  document of up to 48 param-free pages, taken in turn from each first path
  segment, and finds the text groups of them share. Each group of two or more
  becomes a template: the shared text as segments, named by its hash. A group
  is only merged into another when one fewer template download outweighs what
  every page of both groups would stop sharing on each visit. Pages that fail,
  time out or answer anything but 200 HTML at build are left out. A template
  is written as an immutable client file, `/_markless/layouts/<hash>.txt`
  (`LAYOUT_TEMPLATE_DIR` in
  `packages/router/src/vite/runtime/layout-template.ts`), and the page server
  receives the templates with its build.
- A navigation fetch asks the content path, `/_markless/content` +
  page path (`CONTENT_PATH_PREFIX`). The server renders the page as it does
  for the fragment path. When a template holds the region document (its
  segments occur in it, in order), the response is a comment naming the
  template and the document's length, then the page's own text between the
  segments, each piece prefixed with its length. Otherwise it is the region
  document itself. Either way, settled `@pending` arms stream after the region
  end marker as before. The answer is decided per request from the page's own
  render, so a page that renders differently for a visitor than at build is
  still answered exactly.
- The browser downloads each template once per tab, starting as soon as a
  content response names it, puts the region document back together, and
  checks it against the length in the comment. The swap then runs on exactly
  the text the fragment path would have answered. If the template cannot be
  fetched or the text does not add up, the browser fetches the fragment path
  instead.
- The fragment path keeps answering the whole region document, so a tab from
  an earlier deploy, which never asks the content path, keeps working.
- A CDN or ISR cache needs the same rule for the content path as for the
  fragment path; the content path depends on the page URL and the deploy alone.

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
