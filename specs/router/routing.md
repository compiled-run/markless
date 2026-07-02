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

`api/` and `middleware/` are top-level request lifecycle folders. `pages/api/`
is not supported.

The router package may integrate with an HTTP runtime through an adapter, but
shared route manifesting and request-file parsing must stay runtime-agnostic.
Renderer work must consume Markless compiled `.tsrx` artifacts; it must not
reintroduce TSX, hydration, VDOM, or app-authored client/server entry ceremony.
