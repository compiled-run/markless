import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSubmit, describeSwitch, EMAILS, nextEmail } from './form-model.ts';
import { drawing } from './form.ts';

const formArt = drawing();
const piece = readFileSync(new URL('./form-anatomy.tsrx', import.meta.url), 'utf8');

describe('a form that keeps the page only with preventDefault()', () => {
	it('types sample emails and says what each submit did', () => {
		expect(nextEmail([])).toBe(EMAILS[0]);
		expect(nextEmail([EMAILS[0]])).toBe(EMAILS[1]);
		expect(describeSubmit(true, 'ada@example.com')).toBe('preventDefault() kept the page: ada@example.com joined the list, and nothing reloaded.');
		expect(describeSubmit(false, 'ada@example.com')).toBe('No preventDefault(): the browser reloaded the page, and ada@example.com was thrown away.');
		expect(describeSwitch(false)).toBe('preventDefault() is off: Join reloads the page.');
	});

	it('is a switch, a box and a button, each keyboard-reachable', () => {
		expect(piece).toContain('role="switch"');
		expect(piece.match(/tabindex="0"/g)).toHaveLength(3);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same window every time', () => {
		expect(formArt.window.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(formArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by form.test.ts from form.ts. Run the figure tests with -u to refresh.
import type { drawing } from './form.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(formArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./form.art.ts');
	});
});
