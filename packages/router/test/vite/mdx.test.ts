import { describe, expect, it } from 'vitest';
import { transformMdxRoute } from '../../src/vite/mdx.ts';

describe('Markless Router MDX transform', () => {
	it('turns static markdown route content into an Markless SSR artifact', async () => {
		const code = await transformMdxRoute(
			`# Docs

This page is static markdown.
`,
			'/project/pages/docs.mdx',
		);

		expect(code).toContain('renderSsr()');
		expect(code).toContain('<h1>Docs</h1>');
		expect(code).toContain('<p>This page is static markdown.</p>');
		expect(code).toContain('renderData: marklessMdxRenderData');
		expect(code).toContain('export default marklessMdxPage');
	});

	it('renders markdown route content through a real markdown AST', async () => {
		const code = await transformMdxRoute(
			`# Docs

- **Fast** routes
- [Guide](./guide)
`,
			'/project/pages/docs.mdx',
		);

		expect(code).toContain('<ul>');
		expect(code).toContain('<strong>Fast</strong>');
		expect(code).toContain('<a href=\\"./guide\\">Guide</a>');
	});

	it('turns MDX routes with TSRX children into a resumable Markless SSR artifact', async () => {
		const code = await transformMdxRoute(
			`import InteractiveCounter from '../../components/InteractiveCounter.tsrx';

# Body

<InteractiveCounter />
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain(
			`import InteractiveCounter from "../../components/InteractiveCounter.tsrx";`,
		);
		expect(code).toContain('renderSsr(props = {})');
		expect(code).not.toContain('renderCsr(props = {})');
		expect(code).toContain('renderData: marklessMdxRenderData');
		expect(code).toContain('preload()');
		expect(code).toContain('InteractiveCounter.preload?.()');
		expect(code).toContain('resumeContainerEvent(input)');
		expect(code).toContain(`'@markless/core/web/resume'`);
		expect(code).toContain(`'@markless/router/vite/runtime/mdx-route'`);
		expect(code).toContain(`../../components/InteractiveCounter.tsrx?markless-symbols`);
		expect(code).toContain(`../../components/InteractiveCounter.tsrx?markless-render-data`);
		expect(code).toContain('modules[0].marklessRenderData');
		expect(code).not.toContain('modules[0].marklessPrerenderData');
		expect(code).toContain('renderMdxChild(marklessMdxChildren, InteractiveCounter');
		expect(code).toContain('<h1>Body</h1>');
	});

	it('links MDX child render data through the materialized route context', async () => {
		const code = await transformMdxRoute(
			`import InteractiveCounter from '../../components/InteractiveCounter.tsrx';

<InteractiveCounter />
`,
			'/project/pages/docs/[...slug].mdx?markless-route',
		);

		expect(code).toContain(
			'../../components/InteractiveCounter.tsrx?markless-render-data&markless-reached-from=%2Fproject%2Fpages%2Fdocs%2F%5B...slug%5D.mdx',
		);
		expect(code).toContain('modules[0].marklessPrerenderData');
		expect(code).not.toContain('modules[0].marklessRenderData');
	});

	// The host reads storage seeds off the page artifact, which for an MDX route is
	// the composed module, not the .tsrx child that declared the cell.
	it('gathers each TSRX child storage seed onto the MDX page artifact', async () => {
		const code = await transformMdxRoute(
			`import ThemeToggle from '../../components/ThemeToggle.tsrx';
import Density from '../../components/Density.tsrx';

<ThemeToggle />

<ThemeToggle />

<Density />
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain(
			'const marklessMdxStorageSeeds = [...(ThemeToggle.storageSeeds ?? []), ...(Density.storageSeeds ?? [])];',
		);
		expect(code).toContain('storageSeeds: marklessMdxStorageSeeds');
	});

	it('reads TSRX imports and component placeholders from the MDX AST', async () => {
		const code = await transformMdxRoute(
			`import InteractiveCounter
  from '../../components/InteractiveCounter.tsrx';

# Body

<InteractiveCounter
/>
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain(
			`import InteractiveCounter from "../../components/InteractiveCounter.tsrx";`,
		);
		expect(code).toContain('renderMdxChild(marklessMdxChildren, InteractiveCounter');
	});

	it('creates a separate placement for each repeated TSRX child', async () => {
		const code = await transformMdxRoute(
			`import InteractiveCounter from '../../components/InteractiveCounter.tsrx';

<InteractiveCounter />

<InteractiveCounter />
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain('{"kind":"component","componentIndex":0}');
		expect(code).toContain('{"kind":"component","componentIndex":1}');
		expect(code).toContain('"m0:"');
		expect(code).toContain('"m1:"');
	});

	it('passes literal-safe MDX props to TSRX components', async () => {
		const code = await transformMdxRoute(
			`import Callout from '../../components/Callout.tsrx';

<Callout title="Docs" featured count={2} tone={"info"} />
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain(
			`renderMdxChild(marklessMdxChildren, Callout, { "title": "Docs", "featured": true, "count": 2, "tone": "info" }`,
		);
		expect(code).toContain(
			`props: { "title": "Docs", "featured": true, "count": 2, "tone": "info" }`,
		);
	});

	it('passes static MDX children as escaped rendered HTML props', async () => {
		const code = await transformMdxRoute(
			`import Callout from '../../components/Callout.tsrx';

<Callout title="Docs">
Nested **copy**.
</Callout>
`,
			'/project/pages/docs/[...slug].mdx',
		);

		expect(code).toContain(`"children": "<p>Nested <strong>copy</strong>.</p>"`);
	});

	it('lowers literal-safe inline MDX expressions into escaped static HTML', async () => {
		const code = await transformMdxRoute(
			`# {"Docs"}

Count: {2}
`,
			'/project/pages/docs.mdx',
		);

		expect(code).toContain('<h1>Docs</h1>');
		expect(code).toContain('<p>Count: 2</p>');
	});

	it('rejects MDX spread attributes because Markless cannot preserve their scope safely', async () => {
		await expect(
			transformMdxRoute(
				`import Callout from '../../components/Callout.tsrx';

<Callout {...props} />
`,
				'/project/pages/docs/[...slug].mdx',
			),
		).rejects.toThrow('Markless Router MDX cannot lower spread attributes');
	});

	it('rejects non-literal MDX expressions instead of executing route JavaScript', async () => {
		await expect(
			transformMdxRoute(
				`import Callout from '../../components/Callout.tsrx';

<Callout count={props.count} />
`,
				'/project/pages/docs/[...slug].mdx',
			),
		).rejects.toThrow('Markless Router MDX only supports literal-safe expressions');
	});

	it('diagnoses non-.tsrx MDX component imports explicitly', async () => {
		await expect(
			transformMdxRoute(
				`import Callout from '../../components/Callout.ts';

<Callout />
`,
				'/project/pages/docs/[...slug].mdx',
			),
		).rejects.toThrow('default imports from .tsrx files only');
	});
});
