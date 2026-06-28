# Typed Routing

Status: Draft

Arcade Router generates route declarations from `pages/`.

Generated files:

```txt
arcade-router-env.d.ts
.arcade/router/types/routes.d.ts
```

Generated route types use Arcade names:

```ts
ArcadeRouterStaticPageHref;
ArcadeRouterConcretePageHref;
ArcadeRouterRoutePattern;
ArcadeRouterRouteParams;
ArcadeRouterLinkProps;
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

Native anchor typing for TSRX host elements is deferred until the Arcade TSRX
host-element type surface is stable. The first migration slice still generates
the route model and Link props so the later host contract can consume the same
artifact instead of inventing a second route type system.
