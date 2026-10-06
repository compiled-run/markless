import { describe, expect, it } from 'vitest';
import { codePane, findCodeBlocks, rewriteCodeBlocks } from './code-blocks.ts';

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
		['no .tsrx file', '<Code>\n```ts title="a.ts"\nx\n```\n</Code>', /exactly one \.tsrx/],
		[
			'two .tsrx files',
			'<Code>\n```tsrx title="A.tsrx"\nx\n```\n```tsrx title="B.tsrx"\nx\n```\n</Code>',
			/exactly one \.tsrx/,
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
