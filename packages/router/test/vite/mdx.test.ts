import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterAll, describe, expect, it } from 'vitest';
import { parseSync } from 'rolldown/experimental';
import {
	MDX_ROUTE_RUNTIME_SPECIFIER,
	mdxTransformPlugin,
	transformMdxRoute,
} from '../../src/vite/mdx.ts';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'markless-mdx-config-'));
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function installedRouterRoot(name: string) {
	const root = join(fixtureRoot, name);
	mkdirSync(join(root, 'node_modules', '@markless', 'router'), { recursive: true });
	return root;
}

function linkedRouterRoot(name: string) {
	const root = join(fixtureRoot, name, 'app');
	const source = join(fixtureRoot, name, 'packages', 'router');
	mkdirSync(source, { recursive: true });
	mkdirSync(join(root, 'node_modules', '@markless'), { recursive: true });
	symlinkSync(source, join(root, 'node_modules', '@markless', 'router'), 'dir');
	return root;
}

function callConfig(
	config: {
		root: string;
		resolve?: { preserveSymlinks?: boolean; alias?: Record<string, string> };
	},
	env: { command: 'serve' | 'build' },
) {
	const hook = mdxTransformPlugin().config;
	const handler = typeof hook === 'function' ? hook : hook?.handler;
	return handler?.call({} as never, config, {
		...env,
		mode: env.command === 'serve' ? 'development' : 'production',
	});
}

describe('Markless Router MDX transform', () => {
	it.each(['markless-resume', 'markless-route'])(
		'defers static page data until rendering is demanded in %s',
		async (query) => {
			const marker = 'Static prose must stay dormant during a counter click';
			const code = await transformMdxRoute(
				`import Control from './Control.tsrx';\n\n# ${marker}\n\n<Control value={8} />`,
				`/project/pages/interaction.mdx?${query}`,
			);
			const parsed = parseSync('interaction.js', code);
			expect(parsed.errors).toEqual([]);
			const data = parsed.program.body
				.flatMap((node) => (node.type === 'VariableDeclaration' ? node.declarations : []))
				.find(
					(node) =>
						node.id.type === 'Identifier' && node.id.name === 'marklessMdxRenderData',
				)?.init;
			if (!data || data.type !== 'ArrowFunctionExpression')
				throw new Error('render data must remain a lazy factory');
			expect(code.indexOf(marker)).toBeGreaterThan(data.start);
			expect(code.indexOf(marker)).toBeLessThan(data.end);
		},
	);

	it('pre-bundles its runtime entry on the dev server and not for a build', () => {
		const root = installedRouterRoot('installed');

		expect(callConfig({ root }, { command: 'serve' })).toEqual({
			optimizeDeps: { include: [MDX_ROUTE_RUNTIME_SPECIFIER] },
		});
		expect(callConfig({ root }, { command: 'build' })).toBeUndefined();
	});

	it('serves a linked @markless/router from source instead of pre-bundling it', () => {
		expect(
			callConfig({ root: linkedRouterRoot('linked') }, { command: 'serve' }),
		).toBeUndefined();
	});

	it('pre-bundles a linked @markless/router when the consumer preserves symlinks', () => {
		expect(
			callConfig(
				{ root: linkedRouterRoot('linked-preserve'), resolve: { preserveSymlinks: true } },
				{ command: 'serve' },
			),
		).toEqual({
			optimizeDeps: { include: [MDX_ROUTE_RUNTIME_SPECIFIER] },
		});
	});

	it('serves an aliased @markless/router source instead of pre-bundling it', () => {
		const root = installedRouterRoot('aliased');
		const source = join(fixtureRoot, 'aliased-src', 'router');
		mkdirSync(source, { recursive: true });
		expect(
			callConfig(
				{ root, resolve: { alias: { '@markless/router': source } } },
				{ command: 'serve' },
			),
		).toBeUndefined();
	});

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

	it('static markdown routes declare every identifier the page object references', async () => {
		const code = await transformMdxRoute('# Docs\n', '/project/pages/docs.mdx');
		// 0.3.1 emitted `storageSeeds: marklessMdxStorageSeeds` here without declaring it,
		// so every static .mdx page threw ReferenceError at load.
		expect(code).toContain('storageSeeds: []');
		expect(code).not.toContain('marklessMdxStorageSeeds');
		// The emitted module must evaluate.
		const { default: page } = await import(
			`data:text/javascript;base64,${Buffer.from(code.replace(/^import .*$/m, 'const createMdxRenderDataSurface = () => ({});')).toString('base64')}`
		);
		expect(page.storageSeeds).toEqual([]);
		expect(page.renderSsr().html).toContain('<h1>Docs</h1>');
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

	// A composed page reaches an island's own module only lazily, through the
	// `?markless-symbols` loader on the first dispatch that needs a symbol - after
	// the runtime start has already asked once whether an overlay loader exists.
	// The route module itself has to name the behaviour, or a served docs page
	// never installs the stack and an outside press closes nothing.
	it('composed routes install the overlay loader before any island resumes', async () => {
		const code = await transformMdxRoute(
			`import Share from '../../components/Share.tsrx';

# Body

<Share />
`,
			'/project/pages/docs/popover.mdx',
		);

		expect(code).toContain('globalThis.__marklessOverlay ??=');
		expect(code).toContain(`import('@markless/web/fns/overlay')`);
		expect(code.indexOf('globalThis.__marklessOverlay ??=')).toBeLessThan(
			code.indexOf('export function resumeContainerEvent'),
		);
	});

	it('static markdown routes name no overlay loader', async () => {
		const code = await transformMdxRoute('# Docs\n', '/project/pages/docs.mdx');
		expect(code).not.toContain('__marklessOverlay');
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

	it('navigation modules load render data without server-rendering component imports', async () => {
		const code = await transformMdxRoute(
			`import Summary from '../../components/Summary.tsrx';
import Choices from '../../components/Choices.tsrx';

# Options

<Choices label="Pick one" />
<Summary count={3} />
`,
			'/project/pages/options.mdx?markless-route',
		);

		expect(code).not.toContain('import Summary from');
		expect(code).not.toContain('import Choices from');
		expect(code).not.toContain('@markless/core/web/resume');
		expect(code).not.toContain('renderSsr');
		expect(code).toContain('renderData: marklessMdxRenderData');
		expect(code).toContain('loadSymbol: marklessMdxLoadSymbol');
		expect(code).toContain('Choices.tsrx?markless-symbols');
		expect(code).toContain('Summary.tsrx?markless-render-data');
		expect(code).toContain('"label": "Pick one"');
		expect(code).toContain('"count": 3');
		expect(code).toContain('globalThis.__marklessOverlay ??=');
	});

	it('resume modules leave component render data lazy and omit server rendering', async () => {
		const code = await transformMdxRoute(
			`import Meter from './Meter.tsrx';\n\n<Meter value={8} />`,
			'/project/pages/meter.mdx?markless-resume',
		);
		expect(code).not.toContain('import Meter from');
		expect(code).not.toContain('renderSsr');
		expect(code).toContain('export function resumeContainerEvent(input)');
		expect(code).not.toContain('import { resumeFromPayloadDocument }');
		expect(code).toContain("import('@markless/core/web/resume')");
		expect(code).toContain(
			'tryResumeMdxScalar(input, marklessMdxLoadScalarPlan, marklessMdxLoadSymbol)',
		);
		expect(code).toContain('loadScalarActionPlan');
		expect(code).toContain('./Meter.tsrx?markless-symbols&markless-scalar-plans');
		expect(code).toContain('renderData: marklessMdxRenderData');
		expect(code).toContain('return Promise.all([import("./Meter.tsrx?markless-render-data")])');
		expect(code).toContain('modules[0].marklessRenderData');
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

	it('tells the author the default import to write for a named .tsrx import', async () => {
		await expect(
			transformMdxRoute(
				`import { Sidebar as DocsNav } from '../../components/docs/Sidebar.tsrx';

<DocsNav />
`,
				'/project/pages/docs/[...slug].mdx',
			),
		).rejects.toThrow(
			"Write `import DocsNav from '../../components/docs/Sidebar.tsrx';` and make Sidebar the file's `export default`",
		);
	});

	it('tells the author to split a .tsrx import that names more than one binding', async () => {
		await expect(
			transformMdxRoute(
				`import Callout, { tones } from '../../components/Callout.tsrx';

<Callout />
`,
				'/project/pages/docs/[...slug].mdx',
			),
		).rejects.toThrow("Write `import Callout from '../../components/Callout.tsrx';` alone");
	});
});
