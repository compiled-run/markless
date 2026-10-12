import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compact, drawing, tornStripCss } from './snippet-ink.ts';
import { frameCodeBlocks, TORN_STRIP_ART } from './torn-strip.ts';

const GLOBAL_CSS = new URL('../../../styles/global.css', import.meta.url);
const START = '/* torn-strip art: written by components/docs/snippet/snippet.test.ts from snippet-ink.ts; refresh with `vp test -u`. */\n';
const END = '/* end torn-strip art */';

describe('torn-strip markup', () => {
	it('wraps each code block and keeps the code as its only readable content', () => {
		const pre = '<pre data-lang="ts" class="shiki"><code>let cart = 0;</code></pre>';
		const html = frameCodeBlocks(`<p>A count:</p>${pre}<p>and</p><pre><code class="language-text">plain</code></pre>`);
		expect(html.match(/<div class="torn-strip">/g)).toHaveLength(2);
		expect(html).toContain(`<div class="torn-strip">${TORN_STRIP_ART}${pre}</div>`);
		expect(TORN_STRIP_ART).toMatch(/^<span class="torn-art" aria-hidden="true">/);
		expect(TORN_STRIP_ART.replace(/<[^>]*>/g, '')).toBe('');
	});

	it('leaves HTML without a code block alone', () => {
		const html = '<p>Inline <code>let</code> only.</p><pre-ish></pre-ish>';
		expect(frameCodeBlocks(html)).toBe(html);
	});
});

describe('torn-strip art', () => {
	const art = drawing();

	it('tears both edges unevenly: tooth spacing and depth vary, with deeper nicks', () => {
		const ys = (d: string) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
		for (const paper of [art.torn.upper.paper, art.torn.lower.paper]) {
			const edge = ys(paper);
			const spread = Math.max(...edge) - Math.min(...edge);
			expect(spread).toBeGreaterThan(4);
		}
	});

	it('writes path data as compact relative commands that keep the shape', () => {
		expect(compact('M1 2L3.5 2.5L3 -1ZM10 10Q11 11 12 10.5Q13 13 14 14')).toBe('m1 2l2.5 .5-.5-3.5zm9 8q1 1 2 .5 1 2.5 2 3.5');
	});

	it('is frozen into global.css as masks only, drawn in black so tokens colour it (run with -u after editing)', async () => {
		const css = readFileSync(GLOBAL_CSS, 'utf8');
		const start = css.indexOf(START);
		const end = css.indexOf(END);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const block = tornStripCss(art);
		expect(block).not.toMatch(/%3C(filter|pattern|use|image)\b|href=/);
		await expect(css.slice(0, start + START.length) + block + css.slice(end)).toMatchFileSnapshot(GLOBAL_CSS.pathname);
	});
});
