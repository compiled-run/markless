import { describe, expect, it } from 'vitest';
import { codePane, FIRST_TAB, findCodeBlocks, rewriteCodeBlocks } from './code-blocks.ts';

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
		expect(module).toContain('<Code files={files} panes={panes} note="Edit the card">');
		const files = JSON.parse(/const files = (.*);/.exec(module)?.[1] ?? '[]') as { name: string }[];
		expect(files.map((file) => file.name)).toEqual(['Card.tsrx', 'Page.tsrx']);
		const panes = JSON.parse(/const panes = (.*);/.exec(module)?.[1] ?? '[]') as { name: string }[];
		expect(panes.map((pane) => pane.name)).toEqual(['Page.tsrx', 'Card.tsrx']);
		const tabs = JSON.parse(/const panes = (.*);/.exec(module)?.[1] ?? '[]') as { tab: string }[];
		expect(tabs.map((pane) => pane.tab)).toEqual([FIRST_TAB, 'Card.tsrx']);
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
		expect(module).toContain('<Code files={files} panes={panes} note="Try it">');
		expect(module).toContain('<Starter />');
	});

	it('leaves a page without blocks alone and drops a now-unused Code import', async () => {
		expect(await rewriteCodeBlocks('# Plain\n', PAGE, '/site', () => {})).toBeUndefined();
		const withImport = `import Code from '../../components/docs/code.tsrx';\n\n${page}`;
		const next = await rewriteCodeBlocks(withImport, PAGE, '/site', () => {});
		expect(next).not.toMatch(/^import Code /m);
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
