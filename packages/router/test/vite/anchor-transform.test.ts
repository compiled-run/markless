import { describe, expect, it } from 'vite-plus/test';
import { parseAst } from 'vite';
import { __marklessRouteHref } from '../../src/vite/entries/route-href.ts';
import { anchorTransformPlugin, transformAnchorSource } from '../../src/vite/anchor-transform.ts';
import type { RouteTypegenFileSystem } from '../../src/vite/route-typegen.ts';

const routePatterns = new Map([
	['/blog/[slug]', [{ name: 'slug', kind: 'dynamic' }]],
	['/docs/[...slug]', [{ name: 'slug', kind: 'catch-all' }]],
]);

describe('anchor transform', () => {
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
    <Link class="post" href="/blog/[slug]" params={{ slug }} prefetch="intent" replace scroll={false}>
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
			'<Link class="post" href={__marklessRouteHref("/blog/[slug]", { slug })} prefetch="intent" replace scroll={false}>',
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

		expect(result?.code).toContain(
			'href={__marklessRouteHref("/blog/[slug]", { slug: "hello" })}',
		);
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
