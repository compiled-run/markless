# Typed Routing

Status: Draft

Markless Router generates route declarations from `pages/`.

Generated files:

```txt
markless-router-env.d.ts
.output/markless/router/types/routes.d.ts
```

Generated route types use Markless names:

```ts
MarklessRouterStaticPageHref;
MarklessRouterConcretePageHref;
MarklessRouterRoutePattern;
MarklessRouterRouteParams;
MarklessRouterLinkProps;
```

Dynamic routes use file-route pattern syntax:

```tsrx
<Link href="/blog/[slug]" params={{ slug: post.slug }}>
	{post.title}
</Link>
```

Catch-all routes accept a string, number, or readonly segment array:

```tsrx
<Link href="/docs/[...slug]" params={{ slug: ['guides', 'intro'] }}>
	Docs
</Link>
```

Native anchor typing for TSRX host elements is deferred until the Markless TSRX
host-element type surface is stable. The first migration slice still generates
the route model and Link props so the later host contract can consume the same
artifact instead of inventing a second route type system.
