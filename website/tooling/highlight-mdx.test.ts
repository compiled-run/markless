import { expect, test } from 'vitest';
import { transformMdxRoute } from '../../packages/router/src/vite/mdx.ts';
import { highlightMdx } from './highlight-mdx.ts';

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
	expect(html).toContain('href="#first"');
	expect(html).toContain('href="#first-2"');
	expect(html).toContain('<span class="on-this-page-label">Nested <code>code</code></span>');
	expect(html.indexOf('<markless-outline>')).toBeGreaterThan(html.indexOf('</h1>'));
});

test('highlighting preserves the element order used by client navigation', async () => {
	const code = await transformMdxRoute(
		'import Note from "./note.tsrx";\n\n# Title\n\n<Note />\n\n## First\n\n## Second\n',
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
const gridPath = ${JSON.stringify(new URL('../pages/markless/ui/gridlist.mdx', import.meta.url).pathname)};
const statePath = ${JSON.stringify(new URL('../pages/markless/concepts/state.mdx', import.meta.url).pathname)};
const source = fs.readFileSync(gridPath, 'utf8');
const fences = text => [...text.matchAll(/^\x60\x60\x60tsrx\\n([\\s\\S]*?)^\x60\x60\x60/gm)].map(match=>match[1].replace(/\\n+$/,''));
const grid = fences(source), state = fences(fs.readFileSync(statePath, 'utf8'));
const prior = process.argv[1] === 'counter' ? state.find(text=>text.includes('function Counter()')) : grid.find(text=>text.includes('function Files()'));
const service = createQuickInfoService();
const priorInfo = service.queryFence(prior, 'tsrx');
const incomplete = grid.filter(text=>text.startsWith('<gridlist.root multiple')||text.startsWith('<gridlist.root wrap'));
const infos = incomplete.map(text=>service.queryFence(text, 'tsrx'));
const code = await transformMdxRoute(source,gridPath);
const transformed = await highlightMdx().transform.handler(code,gridPath);
process.stdout.write(JSON.stringify({priorInfo,infos,code:transformed.code}));
`;
	const results = [];
	for (const name of ['counter', 'files']) {
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
