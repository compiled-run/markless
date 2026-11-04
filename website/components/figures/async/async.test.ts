import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARRIVES, CHECKING, describeWait, flip, WAIT_TOUR } from './model.ts';
import { drawing } from './wait.ts';

const waitArt = drawing();

const page = readFileSync(new URL('../../../pages/concepts/async.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./wait-anatomy.tsrx', import.meta.url), 'utf8');

describe('the parcel and the waiting spot', () => {
	it('holds the spot in pencil while the date is on its way, then inks it in', () => {
		expect(piece).toContain('{CHECKING}');
		expect(piece).toContain('{ARRIVES}');
		expect(CHECKING).toBe('checking…');
		expect(describeWait(true)).toBe(`Reloaded. The arrival spot held "checking…" in pencil until the date came back, then showed ${ARRIVES}. Nothing else on the page changed.`);
		expect(describeWait(false)).toBe(`The page shows Arrives ${ARRIVES}.`);
		expect(WAIT_TOUR[0]).toBe('reload');
		expect(flip('odd')).toBe('even');
	});

	it('wires only the arrival spot; the shop name, product and price never move', () => {
		expect(piece.match(/class="pulse to-page"/g)).toHaveLength(1);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/ARRIVES|CHECKING|beat/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('WIRED BEFORE THE PAGE RAN');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(waitArt.parcel.ink.length).toBeGreaterThan(300);
		expect(waitArt.wires.main.length).toBeGreaterThan(50);
		expect(waitArt.wires.thin.length).toBeGreaterThan(50);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(waitArt));
	});

	it('is on the Async page under its own heading', () => {
		expect(page).toContain("import WaitAnatomy from '../../components/figures/async/wait-anatomy.tsrx';");
		expect(page.indexOf('## Watch a spot wait')).toBeLessThan(page.indexOf('<WaitAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by async.test.ts from wait.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wait.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(waitArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wait.art.ts');
	});
});
