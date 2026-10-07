import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_CSS, CONTROLS_CSS, STAGE_CSS } from '../../tooling/ui-playground-css.ts';

const card = ['./preview-card.tsrx', './preview-card/code.tsrx']
	.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
	.join('\n');

// Chrome PreviewCard has no part for: Show all, the event log, the scenario bar, text fields, the dropdown select.
const NOT_DRAWN = /^\.pg-(showall|log|bar-|field|rest|pick)/;

const flat = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

/** Top-level rules and at-rule blocks, in source order. */
function blocks(css: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of css) {
		current += char;
		if (char === '{') depth++;
		if (char === '}' && --depth === 0) {
			out.push(flat(current));
			current = '';
		}
	}
	return out;
}

function subject(block: string): string {
	const [head, inner] = block.split('{');
	return (head.startsWith('@') ? inner : head).split(',')[0].trim();
}

describe('PreviewCard', () => {
	it('draws its frame, controls, stage and code with the playground CSS, rule for rule', () => {
		const styles = [...card.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => flat(match[1]));
		const missing = blocks(`${CONTROLS_CSS}\n${STAGE_CSS}\n${CODE_CSS}`)
			.filter((block) => !NOT_DRAWN.test(subject(block)))
			.filter((block) => !styles.some((style) => style.includes(block)));
		expect(missing).toEqual([]);
	});

	it('gives every part a <style>, so the compiler stamps the scope class on its elements', () => {
		const parts = card.split(/^export (?:default )?function /m).slice(1);
		const bare = parts.filter((part) => !part.includes('<style>')).map((part) => part.split('(')[0]);
		expect(parts.length).toBeGreaterThan(5);
		expect(bare).toEqual([]);
	});
});
