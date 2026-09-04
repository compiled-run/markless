import { describe, expect, test, vi } from 'vitest';
import type { IconifyJSON } from '@iconify/types';
import { compileTsrxModule } from '../../../compiler/src/index.ts';
import { icons } from '../src/vite.ts';
import { lucide } from '../src/index.ts';

const collection: IconifyJSON = {
	prefix: 'test-pack',
	width: 24,
	height: 24,
	icons: {
		'arrow-down': { body: '<path d="M1 2"/>' },
		'1-circle': { body: '<circle cx="12" cy="12" r="10"/>' },
	},
	aliases: { downward: { parent: 'arrow-down' } },
};

function transformer(loadCollection = vi.fn(async () => collection)) {
	const warn = vi.fn();
	const plugin = icons({
		availableCollections: ['test-pack'],
		loadCollection,
	});
	const transform = plugin.transform as {
		handler(code: string, id: string): Promise<{ code: string; map: unknown } | undefined>;
	};
	return {
		loadCollection,
		warn,
		transform: transform.handler.bind({ warn, info: vi.fn() }),
	};
}

describe('icons transform', () => {
	test('rewrites TSRX member tags, aliases, attributes, children, and imports', async () => {
		const { transform } = transformer();
		const source = `
import { testpack as glyphs, retained } from '@markless/icons';
import { testpack as foreign } from 'elsewhere';
export function App() @{
	const props = { id: 'arrow' };
	<section>
		<glyphs.arrowdown class="icon" style={{ color: 'red' }} aria-hidden data-pin onClick={() => 1} {...props} />
		<glyphs.downward width="2rem" title="Down" description={props.id}></glyphs.downward>
		<glyphs.icon1circle height={size} />
		<foreign.arrowdown />
		<local.arrowdown />
		<glyphs.arrow.down />
	</section>
}
`;
		const result = await transform(source, '/src/App.tsrx');

		// `glyphs` is still named by the untouched three-part tag, so its specifier stays.
		expect(result?.code).toContain('import { testpack as glyphs, retained } from');
		expect(result?.code).toContain(
			'<svg class="icon" style={{ color: \'red\' }} aria-hidden data-pin onClick={() => 1} {...props} width="1em" height="1em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M1 2"/></svg>',
		);
		expect(result?.code).toContain(
			'<svg width="2rem" height="1em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" role="img"><title>{"Down"}</title><desc>{props.id}</desc><path d="M1 2"/></svg>',
		);
		expect(result?.code).toContain(
			'<svg height={size} width="1em" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><circle',
		);
		expect(result?.code).toContain('<foreign.arrowdown />');
		expect(result?.code).toContain('<local.arrowdown />');
		expect(result?.code).toContain('<glyphs.arrow.down />');
	});

	test('rewrites MDX flow and inline tags but leaves fenced code untouched', async () => {
		const { transform } = transformer();
		const source = `import { testpack as i } from '@markless/icons';

<i.arrowdown />

Text <i.downward title={"Down"} /> here.

\`\`\`tsx
<i.arrowdown />
\`\`\`
`;
		const result = await transform(source, '/pages/icons.mdx');
		expect(result?.code.match(/<svg/g)).toHaveLength(2);
		expect(result?.code).toContain('```tsx\n<i.arrowdown />\n```');
		expect(result?.code).not.toContain("from '@markless/icons'");
	});

	test('loads a collection once, reports unknown icons, leaves non-pack namespaces alone', async () => {
		const setup = transformer();
		await setup.transform(
			`import { testpack } from '@markless/icons'; export function A() @{ <><testpack.arrowdown/><testpack.downward/></> }`,
			'/a.tsrx',
		);
		expect(setup.loadCollection).toHaveBeenCalledTimes(1);
		await expect(
			setup.transform(
				`import { testpack } from '@markless/icons'; export function A() @{ <testpack.arrowdwn/> }`,
				'/bad.tsrx',
			),
		).rejects.toThrow('/bad.tsrx');
		// A namespace that is not a pack is a component family (accordion, select): left alone.
		await expect(
			setup.transform(
				`import { missing } from '@markless/icons'; export function A() @{ <missing.arrowdown/> }`,
				'/pack.tsrx',
			),
		).resolves.toBeUndefined();
	});

	test('the transformed TSRX compiles without an icon component runtime', async () => {
		const { transform } = transformer();
		const transformed = await transform(
			`import { testpack } from '@markless/icons'; export default function App() @{ <testpack.arrowdown aria-hidden="true"/> }`,
			'/App.tsrx',
		);
		const compiled = await compileTsrxModule({
			filename: '/App.tsrx',
			source: transformed!.code,
			symbols: [],
		});
		const moduleSource = [
			`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
			`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
			compiled.publicRenderModule.renderDataModuleSource,
			compiled.publicRenderModule.ssrModuleSource,
			'export { marklessRenderSsr };',
		]
			.join('\n')
			.replace(
				/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
				(_match, _quote: string, helper: string) =>
					`from '${new URL(`../../../web/src/fns/${helper}.ts`, import.meta.url).href}'`,
			);
		const module = (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`
		)) as { marklessRenderSsr(): Promise<{ html: string }> };
		const output = await module.marklessRenderSsr();
		expect(output.html).toContain('<svg');
		expect(output.html).toContain('<path d="M1 2"></path>');
		expect(moduleSource).not.toContain('@markless/icons');
	});

	test('runtime proxies fail loudly when the plugin did not transform a tag', () => {
		expect(() => lucide.chevrondown).toThrow(
			/@markless\/icons.*ui\(\) from '@markless\/ui\/vite'.*icons\(\) from '@markless\/icons\/vite'/,
		);
	});

	test('sanitizes unsupported body styles with a named build diagnostic', async () => {
		const unsafe: IconifyJSON = {
			prefix: 'test-pack',
			icons: { unsafe: { body: '<path style="fill:{color}" d="M0 0"/>' } },
		};
		const setup = transformer(vi.fn(async () => unsafe));
		const result = await setup.transform(
			`import { testpack } from '@markless/icons'; export function A() @{ <testpack.unsafe/> }`,
			'/unsafe.tsrx',
		);
		expect(result?.code).toContain('<path d="M0 0"/>');
		expect(setup.warn).toHaveBeenCalledWith(
			expect.stringMatching(/\/unsafe\.tsrx.*testpack\.unsafe.*unsafe/),
		);
	});
	test('a string title or description becomes a quoted child, an expression stays one', async () => {
		const { transform } = transformer();
		const result = await transform(
			`import { testpack } from '@markless/icons'; export function A() @{ <><testpack.arrowdown title="a < b {x} & c" /><testpack.downward description={label} /></> }`,
			'/label.tsrx',
		);

		expect(result?.code).toContain('<title>{"a < b {x} & c"}</title>');
		expect(result?.code).toContain('<desc>{label}</desc>');
	});

	test('an authored role or aria-hidden survives the accessibility defaults', async () => {
		const { transform } = transformer();
		const result = await transform(
			`import { testpack } from '@markless/icons'; export function A() @{ <><testpack.arrowdown title="Down" role="presentation" /><testpack.downward aria-hidden="false" /></> }`,
			'/aria.tsrx',
		);

		expect(result?.code).toContain('role="presentation"');
		expect(result?.code).not.toContain('role="img"');
		expect(result?.code).toContain('aria-hidden="false"');
		expect(result?.code).not.toContain('aria-hidden="true"');
	});

	test('a pack local named only by rewritten tags loses its specifier', async () => {
		const { transform } = transformer();
		const result = await transform(
			`import { testpack as glyphs, retained } from '@markless/icons'; export function A() @{ <glyphs.arrowdown/> }`,
			'/dropped.tsrx',
		);

		expect(result?.code).toContain("import { retained } from '@markless/icons'");
		expect(result?.code).not.toContain('glyphs');
	});

	test('a pack local read outside a tag keeps its import specifier', async () => {
		const { transform } = transformer();
		const result = await transform(
			`import { testpack } from '@markless/icons'; const fallback = testpack.arrowdown; export function A() @{ <testpack.arrowdown/> }`,
			'/kept.tsrx',
		);

		expect(result?.code).toContain("import { testpack } from '@markless/icons'");
		expect(result?.code).toContain('<svg');
	});

	test('a default specifier survives when every named pack specifier goes', async () => {
		const { transform } = transformer();
		const result = await transform(
			`import shared, { testpack } from '@markless/icons'; export function A() @{ <testpack.arrowdown/> }`,
			'/default.tsrx',
		);

		expect(result?.code).toContain("import shared from '@markless/icons'");
	});

	test('an icon tag inside another icon tag is a named error', async () => {
		const { transform } = transformer();

		await expect(
			transform(
				`import { testpack } from '@markless/icons'; export function A() @{ <testpack.arrowdown><testpack.downward/></testpack.arrowdown> }`,
				'/nested.tsrx',
			),
		).rejects.toThrow(/\/nested\.tsrx.*<testpack\.downward> sits inside <testpack\.arrowdown>/);
	});

	test('an import shown inside a fenced block binds nothing', async () => {
		const { transform } = transformer();
		const source = [
			'```mdx',
			"import { testpack as i } from '@markless/icons';",
			'',
			'<i.arrowdown />',
			'```',
			'',
			'<i.arrowdown />',
			'',
		].join('\n');

		expect(await transform(source, '/docs/fenced.mdx')).toBeUndefined();
	});

	test('a tag inside a backtick span stays prose', async () => {
		const { transform } = transformer();
		const source = `import { testpack as i } from '@markless/icons';\n\nWrite \`<i.arrowdown />\` to draw <i.downward />.\n`;

		const result = await transform(source, '/docs/prose.mdx');

		expect(result?.code).toContain('`<i.arrowdown />`');
		expect(result?.code.match(/<svg/g)).toHaveLength(1);
	});
});
