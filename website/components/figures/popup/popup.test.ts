import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legsFrom } from './drive.ts';
import { CAPTION, CHAPTERS, CUT, describe as say, flip, KEPT, KEYS, LAST, LISTING, MOVE_MS, NODE_KEYS, NODES, nodeOf, press, READY_TEXT, REST_MS, SCRUB_STEP, SHOW, START, STEPS, stopAt, TAP_MS, timelineText, USES } from './model.ts';
import { drawing } from './popup.ts';

const art = drawing();
const page = readFileSync(new URL('../../../pages/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./popup-anatomy.tsrx', import.meta.url), 'utf8');
const codeOf = (key: (typeof NODE_KEYS)[number]) => nodeOf(key).code.map((t) => t.text).join('');

describe('the pop-up book', () => {
	it('reads the order into eight cutouts, with the Status line split into fixed text and live text', () => {
		expect([...NODE_KEYS].sort()).toEqual(['assign', 'button', 'label', 'latte', 'onClick', 'order', 'slot', 'status']);
		expect(nodeOf('order').parent).toBeNull();
		expect(codeOf('latte')).toBe('<p>☕ Latte for Marcus</p>');
		expect(codeOf('label')).toBe('Status:');
		expect(codeOf('slot')).toBe('{status}');
		expect(codeOf('button')).toBe('<button>Mark ready 🔔');
		expect(nodeOf('onClick').parent).toBe('button');
		expect(nodeOf('assign').parent).toBe('onClick');
		expect(NODES.map((n) => [n.key, n.kind])).toContainEqual(['onClick', 'click code']);
		expect(NODES.map((n) => [n.key, n.kind])).toContainEqual(['slot', 'live text']);
	});

	it('lifts every cutout from its own words in the printed code', () => {
		const rows = LISTING.map((row) => row.map((t) => t.text).join(''));
		for (const key of NODE_KEYS) {
			const [row, col] = CUT[key];
			const head = codeOf(key).replace(/^<button>.*/, '<button').replace(/^status = state.*/, 'status = state');
			expect(rows[row]!.slice(col)).toContain(head.slice(0, 6));
		}
	});

	it('ties both uses of status to its one declaration and ships only what can change', () => {
		expect(USES).toEqual(['slot', 'assign']);
		for (const key of USES) expect(codeOf(key)).toMatch(/\bstatus\b/);
		expect([...KEPT].sort()).toEqual(['assign', 'onClick', 'slot', 'status']);
		expect(nodeOf('slot').stamp).toBe('SHOWS status');
		expect(nodeOf('assign').stamp).toBe('CHANGES status');
		expect(nodeOf('onClick').stamp).toBe('RUNS ON CLICK');
		expect(nodeOf('status').stamp).toBe("STARTS AS 'Brewing ⏳'");
		for (const n of NODES.filter((n) => !KEPT.includes(n.key))) expect(n.stamp).toBe('NEVER CHANGES');
	});

	it('tells one story in eight stops and plays it in about ten seconds', () => {
		expect(STEPS).toHaveLength(8);
		expect(LAST).toBe(7);
		expect(MOVE_MS).toHaveLength(LAST);
		const total = MOVE_MS.reduce((a, b) => a + b, 0) + REST_MS * (LAST + 1) + TAP_MS;
		expect(total).toBeGreaterThan(8000);
		expect(total).toBeLessThan(10500);
		expect(KEYS[0]).toBe(0);
		expect(KEYS.at(-1)).toBe(LAST);
		for (let i = 0; i <= LAST; i++) expect(KEYS).toContain(i);
		for (const w of [...Object.values(SHOW), ...CAPTION]) expect(w[0] < w[1] && w[1] <= w[2] && w[2] < w[3]).toBe(true);
		for (let i = 0; i < LAST; i++) expect(CAPTION[i]![3]).toBeLessThanOrEqual(CAPTION[i + 1]![0] + 1e-9);
	});

	it('names six chapters on the timeline, each a stop the slider can land on exactly', () => {
		expect(CHAPTERS.map((c) => c.name)).toEqual(['Read', 'Tie', 'Stamp', 'Fold', 'Ship', 'Tap']);
		expect(CHAPTERS.map((c) => c.at)).toEqual([1, 2, 3, 4, 6, LAST]);
		for (let i = 0; i <= LAST; i++) {
			const value = Math.round(i / SCRUB_STEP) * SCRUB_STEP;
			expect(value).toBeCloseTo(i, 9);
			expect(stopAt(value)).toBe(i);
		}
		expect(stopAt(3.999)).toBe(3);
		expect(stopAt(LAST)).toBe(LAST);
		expect(timelineText(4)).toBe('Fold: unchanging pieces fold flat');
		expect(timelineText(4.5)).toBe('Fold: unchanging pieces fold flat');
		expect(timelineText(5.2)).toBe('Fold: the rest folds shut into a map');
		expect(timelineText(0)).toMatch(/^Start: /);
		for (const c of CHAPTERS) expect(timelineText(c.at).startsWith(c.name + ': ')).toBe(true);
	});

	it('plays on from any point to the end, at the same pace as from the top', () => {
		const full = legsFrom(0);
		expect(full[0]).toEqual({ ms: REST_MS * 2, to: 0 });
		expect(full.at(-1)!.to).toBe(LAST);
		const spent = (legs: { ms: number }[]) => legs.reduce((a, l) => a + l.ms, 0);
		expect(spent(full)).toBe(MOVE_MS.reduce((a, b) => a + b, 0) + REST_MS * (LAST + 1));
		const half = legsFrom(3.5);
		expect(half[0]).toEqual({ ms: MOVE_MS[3]! / 2, to: 4 });
		expect(half.at(-1)!.to).toBe(LAST);
		expect(legsFrom(LAST)).toEqual([]);
	});

	it('controls the story with one timeline: a play and pause button and a slider, with no bookmark tabs or replay link', () => {
		expect(piece).toContain("import { slider } from '@markless/ui';");
		expect(piece).toContain('<slider.thumb');
		expect(piece).toContain('aria-valuetext={spoken}');
		expect(piece).toContain('aria-pressed={playing}');
		expect(piece).toContain('aria-label="Play the story"');
		expect(piece).toContain('role="switch"');
		expect(piece).not.toMatch(/role="tab|bookmark|play again/);
		for (const view of art.views) {
			expect(view.rail.ink.length).toBeGreaterThan(300);
			expect(view.rail.ticks.match(/M/g)!.length).toBeGreaterThanOrEqual(LAST + 1);
		}
		expect(art.ink.timeline.thumb.hatch.length).toBeGreaterThan(50);
	});

	it('gives every piece one matrix and opacity per key; the never-changing cutouts lose their tabs, the map stands again on the browser page', () => {
		for (const view of art.views) {
			const tracks = [...view.cards.flatMap((c) => [c.face, c.shadow, ...c.tabs.flatMap((t) => [t.leaf, t.vee])]), view.cover, view.bundle];
			for (const t of tracks) {
				const keys = t.keys.split('|');
				expect(keys).toHaveLength(KEYS.length);
				expect(keys.every((k) => k.split(' ').length === 7 && k.split(' ').every((n) => Number.isFinite(Number(n))))).toBe(true);
			}
			const xOf = (k: string) => Number(k.split(' ')[4]);
			for (const c of view.cards) {
				const fades = c.tabs[0]!.leaf.keys.split('|').map((k) => Number(k.split(' ')[6]));
				expect(fades[0]).toBe(0);
				expect(fades.at(-1)).toBe(KEPT.includes(c.key) ? 1 : 0);
				const face = c.face.keys.split('|');
				const at4 = face[KEYS.indexOf(4)]!;
				const at7 = face.at(-1)!;
				if (view.key === 'wide') expect(xOf(at7) > view.width / 2).toBe(KEPT.includes(c.key));
				if (!KEPT.includes(c.key)) expect(at7).toBe(at4);
			}
		}
	});

	it('only taps once the map has shipped, and speaks one plain sentence', () => {
		expect(piece).toContain('if (step !== LAST || usual === \'yes\') return;');
		expect(piece).toContain('aria-label="Mark ready"');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('prefers-reduced-motion');
		expect(piece).not.toMatch(/<(filter|pattern)\b|\bhref=|\bdy=/);
		expect(press(START)).toBe(READY_TEXT);
		expect(flip('rest')).toBe('odd');
		expect(say(READY_TEXT, START)).toBe('The click wrote to status, and only the status line changed: it now shows Ready for pickup ✅.');
		expect(say(READY_TEXT, READY_TEXT)).toBe('The click wrote Ready for pickup ✅ again, so nothing on the page changed.');
	});

	it('is on the intro page, right after the paragraph under "Markless reads your code first"', () => {
		expect(page).toContain("import PopupAnatomy from '../components/figures/popup/popup-anatomy.tsrx';");
		const heading = page.indexOf('## Markless reads your code first');
		const at = page.indexOf('<PopupAnatomy />');
		expect(at).toBeGreaterThan(page.indexOf('nothing has to run to create it.', heading));
		expect(at).toBeLessThan(page.indexOf('\n## ', heading + 4));
	});

	it('inks every part with enough strokes and draws the same book every time', () => {
		for (const view of art.views) {
			expect(view.book.ink.length).toBeGreaterThan(1000);
			expect(view.book.gutter.dashes.length).toBeGreaterThan(200);
			expect(view.pulse.length).toBeGreaterThan(200);
			expect(view.usual.glasses).toHaveLength(3);
		}
		for (const c of art.ink.cards) {
			expect(c.ink.length).toBeGreaterThan(300);
			expect(c.shadow.core.length).toBeGreaterThan(100);
			expect(c.code.length).toBeGreaterThan(0);
		}
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by popup.test.ts from popup.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './popup.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art)};
`;
		await expect(module).toMatchFileSnapshot('./popup.art.ts');
	});
});
