import { describe, expect, it } from 'vitest';
import { parseAst } from 'vite';
import { parseModule } from '@tsrx/yuku';
import { __marklessRouteHref } from '../../src/vite/entries/route-href.ts';
import { anchorTransformPlugin, transformAnchorSource } from '../../src/vite/anchor-transform.ts';
import type { RouteTypegenFileSystem } from '../../src/vite/route-typegen.ts';

const routePatterns = new Map([
	['/blog/[slug]', [{ name: 'slug', kind: 'dynamic' }]],
	['/docs/[...slug]', [{ name: 'slug', kind: 'catch-all' }]],
]);

describe('anchor transform', () => {
	it.each(['@markless/router', '@markless/core/router'])(
		'compiles data-driven Link anchors from %s',
		async (entry) => {
			const source = `import { Link as RouteLink } from '${entry}';
export default function Menu({ pages, replace, scroll }) @{
	@for (const page of pages; key page.href) {
		<RouteLink href={page.href} class={page.active ? 'active' : 'link'} replace={replace} scroll={scroll} prefetch={false}><span>{page.title}</span></RouteLink>
	}
}`;
			const plugin = anchorTransformPlugin();
			const handler = (plugin.transform as { handler: Function }).handler;
			(plugin.configResolved as Function)({ root: '/project' });
			const result = await handler.call(
				{ fs: routeTypegenFs(), parse: parseModule },
				source,
				'/project/menu.tsrx',
			);
			expect(result?.code).toContain('<a data-markless-router-link');
			expect(result?.code).toContain('href={page.href}');
			expect(result?.code).toContain("class={page.active ? 'active' : 'link'}");
			expect(result?.code).toContain(
				"data-markless-router-replace={(replace) ? '' : undefined}",
			);
			expect(result?.code).toContain(
				"data-markless-router-scroll={(scroll) === false ? 'manual' : undefined}",
			);
			expect(result?.code).toContain('<span>{page.title}</span></a>');
			expect(result?.code).toContain('data-markless-router-prefetch="none"');
			expect(result?.code).not.toMatch(/\sprefetch=/);
		},
	);
	it('lowers per-link prefetch choices to a data attribute', async () => {
		const source = `import { Link } from '@markless/router';
export default function Nav({ mode }) @{
	<nav>
		<Link href="/a" prefetch={true}>A</Link>
		<Link href="/b" prefetch={false}>B</Link>
		<Link href="/c" prefetch>C</Link>
		<Link href="/d" prefetch={mode}>D</Link>
	</nav>
}`;
		const plugin = anchorTransformPlugin();
		const handler = (plugin.transform as { handler: Function }).handler;
		(plugin.configResolved as Function)({ root: '/project' });
		const result = await handler.call(
			{ fs: routeTypegenFs(), parse: parseModule },
			source,
			'/project/nav.tsrx',
		);
		expect(result?.code).toContain('<a data-markless-router-link href="/a">A</a>');
		expect(result?.code).toContain(
			'<a data-markless-router-link href="/b" data-markless-router-prefetch="none">B</a>',
		);
		expect(result?.code).toContain('<a data-markless-router-link href="/c">C</a>');
		expect(result?.code).toContain(
			"data-markless-router-prefetch={(mode) === false ? 'none' : undefined}",
		);
	});

	it('lowers native route-pattern anchors and preserves normal props', () => {
		const source = `export default () => {
  const slug = "hello";

  return (
    <a class="post" href="/blog/[slug]" params={{ slug }} target="_self" aria-current="page" onClick={() => {}}>
      Post
    </a>
  );
};
`;

		const transformed = transform(source);

		expect(transformed).toContain(
			'import { __marklessRouteHref } from "virtual:markless-router/route-href";',
		);
		expect(transformed).toContain(
			'<a class="post" href={__marklessRouteHref("/blog/[slug]", { slug })} target="_self" aria-current="page" onClick={() => {}}>',
		);
		expect(transformed).not.toContain('params=');
	});

	it('does not rewrite static anchors or expression hrefs', () => {
		const source = `export default () => {
  const slug = "hello";

  return (
    <nav>
      <a href="/about">About</a>
      <a href={\`/blog/\${slug}\`}>Blog</a>
    </nav>
  );
};
`;

		expect(transform(source)).toBe(source);
	});

	it('lowers imported Link route patterns and preserves Link runtime props', () => {
		const source = `import { Link } from "@markless/router";

export default () => {
  const slug = "hello";

  return (
    <Link class="post" href="/blog/[slug]" params={{ slug }} prefetch={false} replace scroll={false}>
      Blog
    </Link>
  );
};
`;

		const transformed = transform(source);

		expect(transformed).toContain(
			'import { __marklessRouteHref } from "virtual:markless-router/route-href";',
		);
		expect(transformed).toContain(
			'<Link class="post" href={__marklessRouteHref("/blog/[slug]", { slug })} prefetch={false} replace scroll={false}>',
		);
		expect(transformed).not.toContain('params=');
	});

	it('lowers imported Link route patterns from the public markless/router entry', () => {
		const source = `import { Link } from "@markless/core/router";

export default function Home() {
	const slug = ["getting-started"];

	return <Link href="/docs/[...slug]" params={{ slug }}>
		Docs
	</Link>;
}
`;

		const transformed = transform(source);

		expect(transformed).toContain(
			'import { __marklessRouteHref } from "virtual:markless-router/route-href";',
		);
		expect(transformed).toContain(
			'<Link href={__marklessRouteHref("/docs/[...slug]", { slug })}>',
		);
		expect(transformed).not.toContain('params=');
	});

	it('runs as a Vite transform for TSRX modules', () => {
		const plugin = anchorTransformPlugin();
		const transformFilter = (
			plugin.transform as {
				filter: { id: RegExp };
			}
		).filter;

		expect(transformFilter.id.test('/project/pages/index.tsrx')).toBe(true);
	});

	it('transforms route-pattern markup from ids with package-cache-looking segments', async () => {
		const plugin = anchorTransformPlugin();
		const transformHandler = (
			plugin.transform as {
				handler: (
					this: {
						fs: RouteTypegenFileSystem;
						parse: (code: string, options: Record<string, unknown>) => unknown;
					},
					code: string,
					id: string,
				) => Promise<{ code: string; map: null } | undefined>;
			}
		).handler;
		const id = '/project/node_modules/.deno/cache/app/page.tsx';
		const source = `export default () => <a href="/blog/[slug]" params={{ slug: "hello" }}>Post</a>;`;

		(plugin.configResolved as ((config: { root: string }) => void) | undefined)?.({
			root: '/project',
		});
		const result = await transformHandler.call(
			{
				fs: routeTypegenFs(),
				parse: (code, options) =>
					parseAst(code, options as Parameters<typeof parseAst>[1], id),
			},
			source,
			id,
		);

		expect(result?.code).toContain('href="/blog/hello"');
		expect(result?.code).not.toContain('virtual:markless-router/route-href');
		expect(result?.code).not.toContain('params=');
	});

	it('does not rewrite static Links or unrelated Link components', () => {
		const source = `import { Link } from "@markless/router";
import { Link as DesignLink } from "./design";

export default () => {
  return (
    <nav>
      <Link href="/about">About</Link>
      <DesignLink href="/blog/[slug]" params={{ slug: "hello" }}>Design</DesignLink>
    </nav>
  );
};
`;

		expect(transform(source)).toBe(source);
	});

	it('rejects route-pattern anchors that do not match pages', () => {
		expect(() =>
			transform(`export default () => <a href="/missing/[slug]" params={{ slug: "x" }} />;`),
		).toThrow('Typed route error: /missing/[slug] does not match any route in pages/.');
	});

	it('rejects route-pattern Links that do not match pages', () => {
		expect(() =>
			transform(
				`import { Link } from "@markless/router";

export default () => <Link href="/missing/[slug]" params={{ slug: "x" }} />;`,
			),
		).toThrow('Typed route error: /missing/[slug] does not match any route in pages/.');
	});

	it('rejects route-pattern anchors without params', () => {
		expect(() => transform(`export default () => <a href="/blog/[slug]">Blog</a>;`)).toThrow(
			'Typed route error: /blog/[slug] requires params:\n- slug',
		);
	});

	it('rejects route-pattern anchors with unknown object literal params', () => {
		expect(() =>
			transform(`export default () => <a href="/blog/[slug]" params={{ id: "hello" }} />;`),
		).toThrow('Typed route error: /blog/[slug] does not define param:\n- id');
	});

	it('rejects route-pattern anchors with missing object literal params', () => {
		expect(() =>
			transform(`export default () => <a href="/blog/[slug]" params={{}} />;`),
		).toThrow('Typed route error: /blog/[slug] requires params:\n- slug');
	});

	it('encodes dynamic and catch-all params', () => {
		expect(__marklessRouteHref('/blog/[slug]', { slug: 'hello world' })).toBe(
			'/blog/hello%20world',
		);
		expect(__marklessRouteHref('/blog/[slug]', { slug: 'a/b' })).toBe('/blog/a%2Fb');
		expect(__marklessRouteHref('/docs/[...slug]', { slug: 'guides/getting-started' })).toBe(
			'/docs/guides/getting-started',
		);
		expect(
			__marklessRouteHref('/docs/[...slug]', {
				slug: ['guides', 'getting started'],
			}),
		).toBe('/docs/guides/getting%20started');
	});

	it('rejects empty catch-all params', () => {
		expect(() => __marklessRouteHref('/docs/[...slug]', { slug: '' })).toThrow(
			'Typed route error: /docs/[...slug] requires a non-empty catch-all param.',
		);
		expect(() => __marklessRouteHref('/docs/[...slug]', { slug: [] })).toThrow(
			'Typed route error: /docs/[...slug] requires a non-empty catch-all param.',
		);
	});
});

function transform(source: string) {
	return transformAnchorSource(
		source,
		parseAst(source, { astType: 'ts', lang: 'tsx', range: true }, '/project/page.tsx'),
		routePatterns,
	);
}

function routeTypegenFs(): RouteTypegenFileSystem {
	return {
		async mkdir() {},
		async readdir(path) {
			if (path === '/project/pages') {
				return [dirent('blog', 'directory')];
			}

			if (path === '/project/pages/blog') {
				return [dirent('[slug].tsrx', 'file')];
			}

			throw notFound(path);
		},
		async readFile(path) {
			throw notFound(path);
		},
		async writeFile() {},
	};
}

function dirent(name: string, type: 'directory' | 'file') {
	return {
		name,
		isDirectory: () => type === 'directory',
		isFile: () => type === 'file',
	};
}

function notFound(path: string) {
	return Object.assign(new Error(`${path} not found`), { code: 'ENOENT' });
}
