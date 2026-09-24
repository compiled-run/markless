// TSRX static text is JSX text: line-break whitespace is layout, same-line whitespace is content.
// The formatter reflows text on that assumption, so formatting must never change the page.
import { format } from '@tsrx/oxc/format';
import { expect, test } from 'vitest';
import rootConfig from '../../../vite.config.ts';
import { jsxTextValue } from '../src/ast/tsrx.ts';
import { compileTsrxModule } from '../src/index.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function serverRender(source: string): Promise<string> {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(
		compiled.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) =>
			`from '${new URL(`../../web/src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`
	)) as {
		readonly marklessRenderSsr: () => Promise<{ readonly html: string }>;
	};
	return (await loaded.marklessRenderSsr()).html;
}

function templateStatics(renderData: unknown): string {
	const chunks = (renderData as { chunks?: Array<{ statics?: string[] }> }).chunks ?? [];
	return chunks.flatMap((chunk) => chunk.statics ?? []).join('|');
}

test.each([
	['text on one line keeps its edges', ' a  b ', ' a  b '],
	['whitespace with no line break is kept', ' ', ' '],
	['a tab alone reads as a space', '\t', ' '],
	['whitespace holding a line break renders nothing', '\n\t\t', ''],
	['blank lines render nothing', '\n\n  \n', ''],
	['edges that cross a line break are dropped', '\n\t\thello\n\t', 'hello'],
	['inner line breaks join with one space', 'hello\n\t\tbig\n\t\tworld', 'hello big world'],
	['the first line keeps its leading space', ' tail\n\t', ' tail'],
	['the last line keeps its trailing space', '\n\thead ', 'head '],
	['trailing spaces before a break go', 'a   \n   b', 'a b'],
	['blank lines between words collapse into one space', 'a\n\n\n b', 'a b'],
	['CRLF and lone CR are line breaks', 'a\r\n  b\r  c', 'a b c'],
	['a non-breaking space is content, not layout', '\n\u00a0\n', '\u00a0'],
])('%s', (_name, raw, expected) => {
	expect(jsxTextValue(raw)).toBe(expected);
});

const PAGE = `import { state } from '@markless/core';
export default function Page() @{
	let first = state('one');
	let second = state('two');
	<main>
		<p data-pair>{first} {second}</p>
		<p data-inline><b>x</b> <i>y</i></p>
		<p data-block>
			hello
			<b>there</b>
			world
		</p>
		<p data-explicit><b>x</b>{' '}
			<i>y</i>
		</p>
		<p data-entity>
			fish &amp; chips
			&lt;tag&gt;
		</p>
		<p data-edge>left <em>mid</em> right</p>
		<button type="button" onClick={() => { first = 'uno'; }}>go</button>
	</main>
}`;

test('server-rendered text follows the JSX whitespace rule', async () => {
	const html = await serverRender(PAGE);
	expect(html).toMatch(/<p data-pair="">one(<!--[^>]*-->)* (<!--[^>]*-->)*two/);
	expect(html).toContain('<b>x</b> <i>y</i>');
	expect(html).toContain('<p data-block="">hello<b>there</b>world</p>');
	expect(html).toMatch(/<b>x<\/b>(<!--[^>]*-->)* (<!--[^>]*-->)*<i>y<\/i><\/p>/);
	expect(html).toContain('<p data-entity="">fish &amp; chips &lt;tag&gt;</p>');
	expect(html).toContain('<p data-edge="">left <em>mid</em> right</p>');
});

test('client templates carry the same text as the server render', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: PAGE,
		symbols: [],
	});
	const statics = templateStatics(compiled.renderData);
	expect(statics).toContain('<b>x</b> <i>y</i>');
	expect(statics).toContain('<p data-block="">hello<b>there</b>world</p>');
	expect(statics).toContain('<p data-entity="">fish &amp; chips &lt;tag&gt;</p>');
	expect(statics).not.toMatch(/>\s+hello|world\s+</);
});

const ROWS = `import { state } from '@markless/core';
export default function List() @{
	let rows = state([{ id: 1, name: 'a' }]);
	<ul>
		@for (const row of rows; key row.id) {
			<li>
				item
				<strong>{row.name}</strong>
				done
			</li>
		}
	</ul>
	<button type="button" onClick={() => { rows = [...rows, { id: 2, name: 'b' }]; }}>add</button>
}`;

test('row templates drop line-break whitespace too', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: ROWS,
		symbols: [],
	});
	const statics = templateStatics(compiled.renderData);
	expect(statics).toContain('<li>item<strong>');
	expect(statics).toContain('</strong>done</li>');
});

const UNFORMATTED = `import { state } from '@markless/core';
export default function Crumbs() @{
	let page = state('Guide');
	<nav>
		<p>Home › <a href="/docs">Docs</a> › {page} and a long enough tail of prose to make the formatter wrap this line</p>
		<p><b>one</b> <i>two</i> <u>three</u> <s>four</s> <em>five</em> <strong>six</strong> <small>seven</small></p>
		<button type="button" onClick={() => { page = 'API'; }}>next</button>
	</nav>
}
`;

test('formatting a module with the repo formatter leaves its rendered HTML unchanged', async () => {
	const formatted = await format('Crumbs.tsrx', UNFORMATTED, rootConfig.fmt ?? {});
	expect(formatted.errors).toEqual([]);
	expect(formatted.code).not.toBe(UNFORMATTED);
	expect(formatted.code).toMatch(/<p>\n\s+Home/);
	expect(await serverRender(formatted.code)).toBe(await serverRender(UNFORMATTED));
});
