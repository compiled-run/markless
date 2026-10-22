import { expect, test } from 'vitest';
import { transformMdxRoute } from '../../packages/router/src/vite/mdx.ts';
import { readFileSync } from 'node:fs';
import { OUTLINE_RESTORE_SCRIPT, OUTLINE_STORAGE_KEY, highlightMdx, stackTables } from './highlight-mdx.ts';

test('the outline keeps native heading links inside an independently mounted reader', async () => {
	const code = await transformMdxRoute(
		'# Title\n\n## First\n\n### Nested `code`\n\n## First\n',
		'/outline.mdx',
	);
	const transform = highlightMdx().transform as {
		handler: (code: string, id: string) => Promise<{ code: string } | undefined>;
	};
	const result = await transform.handler(code, '/outline.mdx');
	const html = JSON.parse(/return \{ html: ("(?:[^"\\]|\\.)*") \};/.exec(result!.code)![1]);
	expect(html).toContain('<markless-outline>');
	expect(html).toContain('aria-label="On this page"');
	expect(html).toContain(
		'<details class="on-this-page-fold"><summary class="on-this-page-title on-this-page-toggle">On this page</summary>',
	);
	expect(html).toContain('href="#first"');
	expect(html).toContain('href="#first-2"');
	expect(html).toContain('<span class="on-this-page-label">Nested <code>code</code></span>');
	expect(html.indexOf('<markless-outline>')).toBeGreaterThan(html.indexOf('</h1>'));
	expect([...html.matchAll(/aria-current="location"/g)]).toHaveLength(1);
	expect(html).toContain('<a class="on-this-page-link" href="#first" aria-current="location">');
	expect(html).toContain(`</nav><script>${OUTLINE_RESTORE_SCRIPT}</script></markless-outline>`);
});

test('the first-paint restore script stays tiny, synchronous and shares the saved-heading key', () => {
	expect(OUTLINE_RESTORE_SCRIPT).not.toContain('<');
	expect(new TextEncoder().encode(OUTLINE_RESTORE_SCRIPT).length).toBeLessThan(512);
	expect(readFileSync(new URL('../public/outline.js', import.meta.url), 'utf8')).toContain(`\`${OUTLINE_STORAGE_KEY}\${location.pathname}\``);
});

test('a markdown table labels each body cell with its column header so a phone can stack the rows', async () => {
	const code = await transformMdxRoute(
		'# Title\n\n## Props\n\n| Prop | Type | What it *does* |\n| --- | :-: | --- |\n| `value` | `string` | Picks a row. |\n| `size` | `number` | Counts. |\n',
		'/table.mdx',
	);
	const transform = highlightMdx().transform as {
		handler: (code: string, id: string) => Promise<{ code: string } | undefined>;
	};
	const result = await transform.handler(code, '/table.mdx');
	const html = JSON.parse(/return \{ html: ("(?:[^"\\]|\\.)*") \};/.exec(result!.code)![1]);
	expect(html).toContain('<table data-stack>');
	expect(html).toContain('data-label="Prop"><code>value</code>');
	expect(html).toContain('<td style="text-align: center" data-label="Type">');
	expect(html).toContain('data-label="What it does">Picks a row.');
	expect(html.match(/data-label=/g)).toHaveLength(6);
});

test('a table without a header row, or with one column, is left as it was', () => {
	const bare = '<table>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>';
	const single =
		'<table>\n<thead>\n<tr>\n<th>Only</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>';
	expect(stackTables(bare)).toBe(bare);
	expect(stackTables(single)).toBe(single);
	expect(
		stackTables(
			'<table>\n<thead>\n<tr>\n<th>A "x"</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>',
		),
	).toContain('<td data-label="A &quot;x&quot;">1</td>');
});

test('highlighting preserves the element order used by client navigation', async () => {
	const code = await transformMdxRoute(
		'import Note from "./note.tsrx";\n\n# Title\n\n<Note />\n\n## First\n\n```text\nplain\n```\n\n## Second\n',
		'/page.mdx',
	);
	const transform = highlightMdx().transform as {
		handler: (code: string, id: string) => Promise<{ code: string } | undefined>;
	};
	const result = await transform.handler(code, '/page.mdx');
	const parts = JSON.parse(/^const marklessMdxParts = (\[.*\]);$/m.exec(result!.code)![1]);
	for (const part of parts.filter((part: { kind: string }) => part.kind === 'html')) {
		const tags = [...part.html.matchAll(/<([a-zA-Z][^\s/>]*)/g)].map((match) => match[1]);
		expect(part.elementTags).toEqual(tags);
		expect(part.elementCount).toBe(tags.length);
	}
	const framed = parts.filter((part: { html?: string }) => part.html?.includes('<div class="torn-strip">'));
	expect(framed).toHaveLength(1);
	expect(framed[0].html).toMatch(/<div class="torn-strip"><span class="torn-art" aria-hidden="true">[\s\S]*<pre><code class="language-text">plain\n?<\/code><\/pre><\/div>/);
});

test('actual Gridlist highlighting is independent of unrelated predecessor fences', async () => {
	const { execFile } = await import('node:child_process');
	const { promisify } = await import('node:util');
	const { writeFileSync, mkdirSync } = await import('node:fs');
	const { join } = await import('node:path');
	const run = promisify(execFile);
	const producer = `
import fs from 'node:fs';
import { createQuickInfoService } from ${JSON.stringify(new URL('./twoslash-quickinfo.ts', import.meta.url).href)};
import { highlightMdx } from ${JSON.stringify(new URL('./highlight-mdx.ts', import.meta.url).href)};
import { transformMdxRoute } from ${JSON.stringify(new URL('../../packages/router/src/vite/mdx.ts', import.meta.url).href)};
const gridPath = ${JSON.stringify(new URL('./fixtures/gridlist.mdx', import.meta.url).pathname)};
const statePath = ${JSON.stringify(new URL('./fixtures/state-cups.mdx', import.meta.url).pathname)};
const source = fs.readFileSync(gridPath, 'utf8');
const fences = text => [...text.matchAll(/^\x60\x60\x60tsrx\\n([\\s\\S]*?)^\x60\x60\x60/gm)].map(match=>match[1].replace(/\\n+$/,''));
const grid = fences(source), state = fences(fs.readFileSync(statePath, 'utf8'));
const prior = process.argv[1] === 'cups' ? state.find(text=>text.includes('function Cups()')) : grid.find(text=>text.includes('function Files()'));
const service = createQuickInfoService();
const priorInfo = service.queryFence(prior, 'tsrx');
const incomplete = grid.filter(text=>text.startsWith('<gridlist.root multiple')||text.startsWith('<gridlist.root wrap'));
const infos = incomplete.map(text=>service.queryFence(text, 'tsrx'));
const code = await transformMdxRoute(source,gridPath);
const transformed = await highlightMdx().transform.handler(code,gridPath);
process.stdout.write(JSON.stringify({priorInfo,infos,code:transformed.code}));
`;
	const results = [];
	for (const name of ['cups', 'files']) {
		const { stdout } = await run(
			process.execPath,
			['--input-type=module', '-e', producer, name],
			{
				maxBuffer: 16 * 1024 * 1024,
			},
		);
		const result = JSON.parse(stdout) as {
			infos: unknown[];
			priorInfo: unknown[];
			code: string;
		};
		expect(result.priorInfo.length).toBeGreaterThan(0);
		expect(result.infos).toEqual([[], []]);
		const parts = JSON.parse(/^const marklessMdxParts = (\[.*\]);$/m.exec(result.code)![1]);
		for (const part of parts.filter((part: { kind: string }) => part.kind === 'html')) {
			const tags = [...part.html.matchAll(/<([a-zA-Z][^\s/>]*)/g)].map((match) => match[1]);
			expect(part.elementTags).toEqual(tags);
			expect(part.elementCount).toBe(tags.length);
		}
		const html = parts
			.filter((part: { kind: string }) => part.kind === 'html')
			.map((part: { html: string }) => part.html)
			.join('');
		expect(html).toContain(
			'Several rows can be picked at once. Writing it also makes the list selectable.',
		);
		expect(html).toContain('class="tsrx-hover" tabindex="0" role="img" aria-label=');
		expect(html).toContain('class="tsrx-tip" aria-hidden="true"');
		if (process.env.MARKLESS_FENCE_EVIDENCE) {
			mkdirSync(process.env.MARKLESS_FENCE_EVIDENCE, { recursive: true });
			writeFileSync(join(process.env.MARKLESS_FENCE_EVIDENCE, name + '.json'), stdout);
		}
		results.push(result.code);
	}
	expect(results[0]).toBe(results[1]);
}, 30000);
