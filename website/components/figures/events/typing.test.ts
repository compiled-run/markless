import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeTyping, flip, press, START, typed, TYPING_TOUR } from './typing-model.ts';
import { drawing } from './typing.ts';

const typingArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/events.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./typing-anatomy.tsrx', import.meta.url), 'utf8');

describe('the name field and the name box', () => {
	it('types one letter per press and says what the handler got', () => {
		expect(START).toBe(1);
		expect(typed(2)).toBe('Ad');
		expect(press(3)).toBe(1);
		expect(describeTyping(2, true)).toBe('Struck a key. The browser\'s input event ran the onInput handler, which set name to "Ad". The preview now shows Ad; nothing else on the page changed.');
		expect(TYPING_TOUR[0]).toBe('key');
		expect(flip('odd')).toBe('even');
	});

	it('wires only the preview; the shop name, product and price never move', () => {
		expect(piece).toContain('>onInput</text>');
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/letters|name\}|beat/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
				expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(typingArt.keys).toHaveLength(21);
		expect(typingArt.page.field.roller.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(typingArt));
	});

	it('is on the Events page under its own heading', () => {
		expect(page).toContain("import TypingAnatomy from '../../components/figures/events/typing-anatomy.tsrx';");
		expect(page.indexOf('## Strike a key')).toBeLessThan(page.indexOf('<TypingAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by typing.test.ts from typing.ts. Run the figure tests with -u to refresh.
import type { drawing } from './typing.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(typingArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./typing.art.ts');
	});
});
