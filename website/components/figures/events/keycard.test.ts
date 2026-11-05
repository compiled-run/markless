import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capOf, cardText, describeKey } from './keycard-model.ts';
import { drawing } from './keycard.ts';

const keyArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/events.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./keycard-anatomy.tsrx', import.meta.url), 'utf8');

describe('a key, its event card and the hand', () => {
	it('puts the event’s real key on the card', () => {
		expect(cardText('a')).toBe('key: "a"');
		expect(cardText('ArrowLeft')).toBe('key: "ArrowLeft"');
		expect(capOf('ArrowLeft')).toBe('Arrow');
		expect(capOf(' ')).toBe('␣');
		expect(describeKey('a')).toBe('The browser handed your handler an event: key is "a".');
	});

	it('has three objects, and only a press sends a card', () => {
		for (const part of ['class="key"', 'class="card"', 'class="hand"']) expect(piece).toContain(part);
		expect(piece).toContain('key = event.key;');
		expect(piece).not.toMatch(/class="cord"|art\.wires|class="hand"[^>]*on[A-Z]/);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same scene every time', () => {
		expect(keyArt.hand.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(keyArt));
	});

	it('is on the Events page under its own heading', () => {
		expect(page).toContain("import KeycardAnatomy from '../../components/figures/events/keycard-anatomy.tsrx';");
		expect(page.indexOf('## Press a key')).toBeLessThan(page.indexOf('<KeycardAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by keycard.test.ts from keycard.ts. Run the figure tests with -u to refresh.
import type { drawing } from './keycard.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(keyArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./keycard.art.ts');
	});
});
