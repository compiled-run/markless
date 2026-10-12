import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANNER, CLEAN_NOTE, CODE, DEPS_COST, describe as say, ERASER, FLAGS, NAME, NOTE_FS, PEEL, stopWindow, WRITE } from './model.ts';
import { drawing } from './name.ts';

const art = drawing();

const page = readFileSync(new URL('../../../pages/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./name-anatomy.tsrx', import.meta.url), 'utf8');
const plain = (row: readonly (readonly [string, string])[]) => row.map(([t]) => t).join('');

describe('the marked-up sheet', () => {
	it('carries the page order code as plain code: a let, a plain read and a plain assignment', () => {
		expect(CODE.map(plain)).toEqual(["let status = state('Brewing ⏳');", '<p>Status: {status}</p>', '<button onClick={() => {', "  status = 'Ready for pickup ✅';", '}}>Mark ready 🔔</button>']);
		expect(page).toContain("let status = state('Brewing ⏳');");
		expect(page).toContain("status = 'Ready for pickup ✅';");
		expect(art.code.tokens.map((t) => t.text).join('').replaceAll(' ', '')).toBe(CODE.map(plain).join('').replaceAll(' ', ''));
	});

	it('draws the marks as generic clutter stuck over the code, never inside it', () => {
		expect(FLAGS.map((f) => f.label)).toEqual(['$', 'use…', '.value', 'set…()']);
		expect(art.flags).toHaveLength(FLAGS.length);
		expect(art.card.lines.map((l) => l.text)).toEqual(['RULE 1', 'call me first!']);
		expect(art.sticky.text).toBe('[status]');
		for (const token of art.code.tokens) expect(token.text).not.toMatch(/^\$|\.value|^use[A-Z]|^set[A-Z]/);
	});

	it('says in red what each mark costs, beside it on the desk and never on the code', () => {
		expect(FLAGS.map((f) => f.cost.join(' '))).toEqual(['mark it', 'call it first', 'unwrap it', "can't just assign"]);
		expect(art.card.lines[1]!.text).toBe('call me first!');
		expect(DEPS_COST).toBe('list what it reads');
		expect(NOTE_FS).toBeGreaterThanOrEqual(11);
		const offSheet = ([x, y]: readonly number[]) => x! < 0 || x! > 340 || y! < 0 || y! > 236;
		for (const note of [...art.flags.map((f) => f.cost), art.sticky.cost]) expect(offSheet(note.at), JSON.stringify(note.lines.map((l) => l.text))).toBe(true);
		expect(piece).toMatch(/\.marks \.ink \{\s*fill: var\(--red\)/);
		expect(piece).toMatch(/\.rub \{[^}]*stroke: color-mix\(in oklch, var\(--red\)/);
	});

	it('heads the marked-up sheet with "other tools" in red, and swaps it for "just your code" once clean', () => {
		expect(BANNER).toEqual(['other tools:', 'rules on top of your code']);
		expect(art.banner.lines.map((l) => l.text)).toEqual([...BANNER]);
		expect(art.banner.doodle.length).toBeGreaterThan(100);
		expect(art.banner.clean.text).toBe(CLEAN_NOTE);
		expect(art.banner.fade).toBeLessThanOrEqual(WRITE.from);
		expect(piece).toContain(":is(.peel, .rub, .banner)");
	});

	it('rubs out the pencil marks at each eraser stop, then peels the tabs, then writes the name', () => {
		const lastRub = stopWindow(art.scribbles.stops.length - 1).to;
		expect(lastRub).toBeLessThan(ERASER.start + ERASER.duration);
		expect(art.flags[0]!.peel.style).toContain(`--d:${PEEL.from}ms`);
		expect(PEEL.from).toBeGreaterThan(lastRub);
		const lastPeel = PEEL.from + (FLAGS.length + 1) * PEEL.step + PEEL.length;
		expect(WRITE.from).toBeGreaterThanOrEqual(lastPeel);
		expect(art.name.glyphs.map((g) => g.ch).join('')).toBe(NAME);
		expect(art.name.washDelay).toBeGreaterThan(art.name.glyphs.at(-1)!.delay);
		expect(art.eraser.stops).toHaveLength(art.scribbles.stops.length);
		expect(art.eraser.crumbs.length).toBeGreaterThanOrEqual(art.scribbles.stops.length * 4);
	});

	it('keeps the eraser keyframes on the stop windows the pencil marks use', () => {
		const from = piece.indexOf('@keyframes rub ');
		const frames = piece.slice(from, piece.indexOf('@keyframes', from + 5));
		for (const [i, w] of art.scribbles.stops.entries()) {
			const at = (ms: number) => Math.round(((ms - ERASER.start) / ERASER.duration) * 100);
			expect(frames).toContain(`${at(w.marks[0]!.from)}%`);
			expect(frames).toContain(`${at(w.marks[0]!.to)}%`);
			expect(i).toBeGreaterThanOrEqual(0);
		}
	});

	it('speaks a plain sentence on the toggle', () => {
		expect(say('clean')).toBe('The marks are gone. The sheet shows only the plain code, with Markless written on top: just your code.');
		expect(say('marks')).toMatch(/^The red marks other tools add are back/);
	});

	it('names no other framework', () => {
		const words = JSON.stringify({ CODE, FLAGS, BANNER, CLEAN_NOTE, DEPS_COST, say: [say('marks'), say('clean')], art: { flags: art.flags.map((f) => [f.label, f.cost.lines]), card: art.card.lines, sticky: [art.sticky.text, art.sticky.cost.lines], banner: art.banner.lines } }) + piece;
		expect(words).not.toMatch(/\b(react|vue|svelte|solid|angular|preact|qwik|signal)\b/i);
	});

	it('waits for the reader: starts marked up, erases only on a press, and snaps under reduced motion', () => {
		expect(piece).not.toContain('setInterval');
		expect(piece).not.toContain('onVisible');
		expect(piece).toContain("let phase = state('start');");
		expect(piece).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
		expect(piece).toContain('aria-live="polite"');
	});

	it('is on the intro page, under "Why the name Markless?", after its prose', () => {
		expect(page).toContain("import NameAnatomy from '../components/figures/name/name-anatomy.tsrx';");
		const section = page.indexOf('## Why the name Markless?');
		const at = page.indexOf('<NameAnatomy />');
		expect(at).toBeGreaterThan(page.indexOf('That is the name.', section));
	});

	it('inks every part with enough strokes', () => {
		expect(art.sheet.edge.length).toBeGreaterThan(500);
		expect(art.sheet.shadow.near.length).toBeGreaterThan(500);
		expect(art.flags.every((f) => f.ink.length > 100 && f.shadow.length > 20)).toBe(true);
		expect(art.eraser.ink.length).toBeGreaterThan(300);
		expect(art.sheet.pencil.length).toBeGreaterThan(100);
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by name.test.ts from name.ts. Run \`pnpm test run components/figures/name -u\` to refresh.
import type { drawing } from './name.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./name.art.ts');
	});
});
