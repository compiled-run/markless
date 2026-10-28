import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	codePane,
	FIRST_TAB,
	findCodeBlocks,
	PAGE_STYLE,
	rewriteCodeBlocks,
	scopedPageStyle,
} from './code-blocks.ts';

const SHARED_SHEET = readFileSync(new URL('../components/docs/code/style.css', import.meta.url), 'utf8');

const PAGE = '/site/pages/concepts/demo.mdx';

const page = `import Sidebar from '../../components/docs/sidebar.tsrx';

# Demo

\`\`\`tsrx
<Code>
\`\`\`

<Code note="Try it">
\`\`\`tsrx title="Panel.tsrx"
import { label } from './text.ts';

export default function Panel() @{
	<p>{label}</p>
}
\`\`\`

\`\`\`ts title="text.ts"
export const label: string = 'hi';
\`\`\`
</Code>

After.
`;

describe('findCodeBlocks', () => {
	it('reads a <Code> whose note contains a > or quotes of the other kind', () => {
		const withArrow = page.replace('<Code note="Try it">', `<Code note="Type <b>{count}</b>, then watch 'it' > 0">`);
		const [block] = findCodeBlocks(withArrow, PAGE);
		expect(block?.attributes).toBe(`note="Type <b>{count}</b>, then watch 'it' > 0"`);
	});

	it('reads a braced attribute that nests objects and strings holding braces and backticks', () => {
		const steps = "showUpdates steps={[{ label: 'Show `{shots}` twice', rewrites: 2 }, { label: \"it's }\", shows: '>' }]}";
		const [block] = findCodeBlocks(page.replace('<Code note="Try it">', `<Code ${steps}>`), PAGE);
		expect(block?.attributes).toBe(steps);
	});

	it('reads each titled fence inside <Code> as a file and skips <Code> inside a fence', () => {
		const [block, ...rest] = findCodeBlocks(page, PAGE);
		expect(rest).toEqual([]);
		expect(block?.attributes).toBe('note="Try it"');
		expect(block?.files.map((file) => file.name)).toEqual(['Panel.tsrx', 'text.ts']);
		expect(block?.files[1]?.code).toBe("export const label: string = 'hi';\n");
		expect(page.split('\n')[block!.startLine]).toBe('<Code note="Try it">');
		expect(page.split('\n')[block!.endLine]).toBe('</Code>');
	});

	it.each([
		['an untitled fence', '<Code>\n```tsrx\nx\n```\n</Code>', /needs title=/],
		['prose inside the block', '<Code>\nhello\n</Code>', /only titled code fences/],
		['no .tsrx file', '<Code>\n```ts title="a.ts"\nx\n```\n</Code>', /at least one \.tsrx/],
		[
			'an entry that names no .tsrx fence',
			'<Code entry="C.tsrx">\n```tsrx title="A.tsrx"\nx\n```\n```ts title="C.ts"\nx\n```\n</Code>',
			/entry="C\.tsrx" names no \.tsrx fence/,
		],
		[
			'a fence titled like the generated module',
			'<Code>\n```tsrx title="block.tsrx"\nx\n```\n</Code>',
			/block\.tsrx/,
		],
		[
			'a repeated title',
			'<Code>\n```ts title="a.ts"\nx\n```\n```ts title="a.ts"\nx\n```\n</Code>',
			/both titled/,
		],
		['an unknown extension', '<Code>\n```js title="a.js"\nx\n```\n</Code>', /not a file name/],
		['a missing </Code>', '<Code>\n```tsrx title="A.tsrx"\nx\n```\n', /never closed/],
	])('rejects %s and names the line', (_, source, message) => {
		expect(() => findCodeBlocks(source, PAGE)).toThrow(message);
		expect(() => findCodeBlocks(source, PAGE)).toThrow(/demo\.mdx:\d+:/);
	});
});

const twoFiles = `<Code note="Edit the card">
\`\`\`tsrx title="Page.tsrx"
import Card from './Card.tsrx';

export default function Page() @{
	<Card />
}
\`\`\`

\`\`\`tsrx title="Card.tsrx"
export default function Card() @{
	<p>card</p>
}
\`\`\`
</Code>
`;

describe('several .tsrx files in one block', () => {
	it('runs the first .tsrx fence when no entry is named', () => {
		const [block] = findCodeBlocks(twoFiles, PAGE);
		expect(block?.entry).toBe('Page.tsrx');
		expect(block?.files.map((file) => file.name)).toEqual(['Page.tsrx', 'Card.tsrx']);
	});

	it('runs the fence entry= names and keeps entry= off the component', async () => {
		const named = twoFiles.replace('<Code note="Edit the card">', '<Code entry="Card.tsrx" note="Edit the card">');
		const [block] = findCodeBlocks(named, PAGE);
		expect(block?.entry).toBe('Card.tsrx');
		expect(block?.attributes).toBe('note="Edit the card"');

		const written = new Map<string, string>();
		await rewriteCodeBlocks(named, PAGE, '/site', (path, text) => written.set(path, text));
		const dir = '/site/components/docs/code/generated/concepts-demo-1';
		const module = written.get(`${dir}/block.tsrx`) ?? '';
		expect(module).toContain('import Starter from "./Card.tsrx";');
		expect(module).toContain('<Code files={files} panes={panes} note="Edit the card" stylesheets={[sheet0]}>');
		const files = JSON.parse(/const files = (.*);/.exec(module)?.[1] ?? '[]') as { name: string }[];
		expect(files.map((file) => file.name)).toEqual(['Card.tsrx', 'Page.tsrx', PAGE_STYLE]);
		const panes = JSON.parse(/const panes = (.*);/.exec(module)?.[1] ?? '[]') as { name: string }[];
		expect(panes.map((pane) => pane.name)).toEqual(['Page.tsrx', 'Card.tsrx', PAGE_STYLE]);
		const tabs = JSON.parse(/const panes = (.*);/.exec(module)?.[1] ?? '[]') as { tab: string }[];
		expect(tabs.map((pane) => pane.tab)).toEqual([FIRST_TAB, 'Card.tsrx', PAGE_STYLE]);
	});

	it('writes every .tsrx file beside the module so the entry\'s relative imports resolve', async () => {
		const written = new Map<string, string>();
		await rewriteCodeBlocks(twoFiles, PAGE, '/site', (path, text) => written.set(path, text));
		const dir = '/site/components/docs/code/generated/concepts-demo-1';
		expect(written.get(`${dir}/Page.tsrx`)).toContain("import Card from './Card.tsrx';");
		expect(written.get(`${dir}/Card.tsrx`)).toContain('export default function Card()');
		expect(written.get(`${dir}/block.tsrx`)).toContain('import Starter from "./Page.tsrx";');
	});
});

describe('rewriteCodeBlocks', () => {
	it('swaps each block for a generated module and writes the starter files beside it', async () => {
		const written = new Map<string, string>();
		const next = await rewriteCodeBlocks(page, PAGE, '/site', (path, text) =>
			written.set(path, text),
		);
		expect(next).toMatch(
			/^import CodeBlock1 from "\.\.\/\.\.\/components\/docs\/code\/generated\/concepts-demo-1\/block\.tsrx";\n\n/,
		);
		expect(next).toContain('\n<CodeBlock1 />\n');
		expect(next).not.toContain('title="Panel.tsrx"');
		expect(next).toContain('```tsrx\n<Code>\n```');
		expect(next?.split('\n').length).toBe(page.split('\n').length + 2);

		const dir = '/site/components/docs/code/generated/concepts-demo-1';
		expect(written.get(`${dir}/text.ts`)).toBe("export const label: string = 'hi';\n");
		expect(written.get(`${dir}/Panel.tsrx`)).toContain('export default function Panel()');
		const module = written.get(`${dir}/block.tsrx`) ?? '';
		expect(module).toContain('import Code from "../../../code.tsrx";');
		expect(module).toContain('import Starter from "./Panel.tsrx";');
		expect(module).toContain('<Code files={files} panes={panes} note="Try it" stylesheets={[sheet0]}>');
		expect(module).toContain('<Starter />');
	});

	it('leaves a page without blocks alone and drops a now-unused Code import', async () => {
		expect(await rewriteCodeBlocks('# Plain\n', PAGE, '/site', () => {})).toBeUndefined();
		const withImport = `import Code from '../../components/docs/code.tsrx';\n\n${page}`;
		const next = await rewriteCodeBlocks(withImport, PAGE, '/site', () => {});
		expect(next).not.toMatch(/^import Code /m);
	});
});

describe('the shared style.css tab', () => {
	const dir = '/site/components/docs/code/generated/concepts-demo-1';
	const filesOf = (module: string) =>
		JSON.parse(/const files = (.*);/.exec(module)?.[1] ?? '[]') as { name: string; code: string }[];

	it('adds the site sheet as the last tab of a block without a .css fence and links its scoped copy', async () => {
		const written = new Map<string, string>();
		await rewriteCodeBlocks(page, PAGE, '/site', (path, text) => written.set(path, text));
		const module = written.get(`${dir}/block.tsrx`) ?? '';
		const files = filesOf(module);
		expect(files.map((file) => file.name)).toEqual(['Panel.tsrx', 'text.ts', PAGE_STYLE]);
		expect(files.at(-1)?.code).toBe(SHARED_SHEET);
		expect(written.get(`${dir}/${PAGE_STYLE}`)).toBe(SHARED_SHEET);
		expect(module).toContain('import sheet0 from "../page-style.css?url";');
		expect(written.get('/site/components/docs/code/generated/page-style.css')).toBe(scopedPageStyle(SHARED_SHEET));
	});

	it('leaves a block that brings its own .css fence with only its own sheet', async () => {
		const own = page.replace(
			'```ts title="text.ts"',
			'```css title="look.css"\np { color: red; }\n```\n\n```ts title="text.ts"',
		);
		const written = new Map<string, string>();
		await rewriteCodeBlocks(own, PAGE, '/site', (path, text) => written.set(path, text));
		const module = written.get(`${dir}/block.tsrx`) ?? '';
		expect(filesOf(module).map((file) => file.name)).toEqual(['Panel.tsrx', 'look.css', 'text.ts']);
		expect(module).toContain('import sheet0 from "./look.css?url";');
	});

	it('confines the in-page copy to the result box, reading body as that box', () => {
		const scoped = scopedPageStyle('body {\n\tcolor: red;\n}\n\nh1,\nbody p {\n\tmargin: 0;\n}\n');
		expect(scoped).toBe('@scope (.code-stage) {\n:scope {\n\tcolor: red;\n}\n\nh1,\n:scope p {\n\tmargin: 0;\n}\n}\n');
	});

	it('fits the code column beside the preview', () => {
		const wide = SHARED_SHEET.split('\n').filter((line) => line.replaceAll('\t', '  ').length > 50);
		expect(wide).toEqual([]);
	});
});

describe('codePane', () => {
	it('keeps every character of the file and colours runs with the site highlighter', async () => {
		const code =
			"import { state } from '@markless/core';\n\nexport default function A() @{\n\t<p>{1}</p>\n}\n";
		const pane = await codePane({ name: 'A.tsrx', code });
		expect(pane.lines.map((line) => line.runs.map((run) => run.text).join('')).join('\n')).toBe(
			code.replace(/\n$/, ''),
		);
		expect(pane.lines[0]?.runs.some((run) => run.style?.includes('--shiki-dark'))).toBe(true);
	});
});
