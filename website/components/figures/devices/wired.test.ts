import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_TAG, DEVICES, describe as say, FINDINGS, spoken, toggle, VALUE, WROTE } from './model.ts';
import { drawing } from './wired.ts';

const art = drawing();

const page = readFileSync(new URL('../../../pages/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./devices-anatomy.tsrx', import.meta.url), 'utf8');

describe('one API, every device', () => {
	it('draws the same pipeline twice: wide for the prose column, tall for phones', () => {
		expect(art.views.map((v) => v.key)).toEqual(['wide', 'tall']);
		const [wide, tall] = art.views;
		expect(wide!.width / wide!.height).toBeGreaterThan(1.2);
		expect(tall!.height / tall!.width).toBeGreaterThan(1.2);
	});

	for (const view of art.views) {
		const part = (key: string) => view.parts.find((p) => p.key === key)!;

		it(`${view.key}: lets the ink say what is real, the adapter slot is pink pencil only`, () => {
			expect(view.parts.map((p) => p.key)).toEqual(['plan', 'mac', 'browser', 'iphone', 'slot']);
			const slot = part('slot');
			expect(slot.ink + slot.paper + slot.face + slot.tone + slot.deep + slot.yellow + slot.pink).toBe('');
			expect(slot.pencil.length).toBeGreaterThan(400);
			for (const key of ['mac', 'browser', 'iphone']) {
				expect(part(key).ink.length).toBeGreaterThan(1500);
				expect(part(key).yellow.length).toBeGreaterThan(50);
				expect(part(key).pink.length).toBeGreaterThan(50);
			}
		});

		it(`${view.key}: labels each arrow with onClick and that device's own word for it`, () => {
			expect(view.arrows.map((a) => [a.key, a.word, a.status])).toEqual(DEVICES.map((d) => [d.key, d.press, d.status]));
			expect(view.arrows.map((a) => a.word)).toEqual(['click', 'touchUpInside', 'action', '?']);
			expect(view.arrows.every((a) => a.length > 20 && a.d.length > 100)).toBe(true);
			for (const a of view.arrows) expect(a.stack ? a.y - a.top : a.top - a.y).toBe(a.stack ? view.fonts.press + 1 : 0);
		});

		it(`${view.key}: shows the screens simplified, the plan with its status tag, and the three findings`, () => {
			for (const key of ['mac', 'browser', 'iphone']) expect(part(key).screens.map((t) => t.key)).toEqual(['status']);
			expect(part('slot').texts).toHaveLength(0);
			expect(part('slot').screens).toHaveLength(0);
			expect(view.planTag.texts.map((t) => t.text)).toEqual([VALUE]);
			expect(part('plan').screens).toHaveLength(1);
			expect(view.findings.map((f) => f.text)).toEqual([...FINDINGS]);
			expect(view.labels.map((l) => l.name)).toEqual(['BROWSER', 'IPHONE', 'MAC']);
			expect(view.glass.ink.length).toBeGreaterThan(500);
		});
	}

	it('keeps the full order text on the card only, with the status as the live value', () => {
		expect(piece.match(/\{ORDER_FOR\}/g)).toHaveLength(1);
		expect(piece).toContain('class="status now" data-s="brewing"');
		expect(FINDINGS).toEqual(['<button>', 'shows the status', 'onClick → mark ready']);
		expect(CODE_TAG).toBe('<button onClick>');
		expect(piece.match(/\{CODE_TAG\}/g)).toHaveLength(1);
		expect(piece).not.toMatch(/early proof|works today|WIRED BEFORE/);
	});

	it('describes each step and device in plain words, claiming only what the repo shows', () => {
		const text = say();
		for (const d of DEVICES) expect(text).toContain(d.said);
		expect(text).toContain('real native button');
		expect(text).toContain(CODE_TAG);
		expect(text).not.toMatch(/[;—]/);
		expect([...FINDINGS, CODE_TAG, ...DEVICES.map((d) => d.said)].join(' ')).not.toMatch(/[;—]/);
	});

	it('writes onClick once on every arrow, in ink, with the device word after it', () => {
		expect(piece.match(/<tspan class="wrote">\{WROTE/g)).toHaveLength(2);
		expect(piece.match(/<tspan class="said">\{'→ ' \+ arrow\.word\}/g)).toHaveLength(2);
		expect(WROTE).toBe('onClick');
	});

	it('presses the card button: one press, one tour, one live sentence', () => {
		expect(piece).toContain('aria-label="Mark ready"');
		expect(piece.match(/onClick=/g)).toHaveLength(1);
		expect(piece).toContain('aria-live="polite"');
		expect(spoken('ready', true)).toBe('Marked ready. The browser, iPhone and Mac now say Ready for pickup.');
		expect(toggle('brewing')).toBe('ready');
		expect(toggle('ready')).toBe('brewing');
	});

	it('pulses every arrow, the pencil one stopping short at its question mark', () => {
		for (const view of art.views) {
			expect(view.arrows.every((a) => a.path.length > 20)).toBe(true);
			const slot = view.arrows.find((a) => a.key === 'slot')!;
			expect(slot.path.length).toBeLessThan(slot.d.length);
			expect(view.planWire.length).toBeGreaterThan(10);
			expect(view.planTag.ink.length).toBeGreaterThan(100);
		}
		expect(piece.match(/class="strike"/g)).toHaveLength(2);
	});

	it('sits on the intro page under the three outcome lines and before the counter', () => {
		expect(page).toContain("import DevicesAnatomy from '../components/figures/devices/devices-anatomy.tsrx';");
		const at = page.indexOf('<DevicesAnatomy />');
		expect(at).toBeGreaterThan(page.indexOf('title="One API, every device."'));
		expect(page.indexOf('title="Code your agent picks up in one read."')).toBeGreaterThan(page.indexOf('<IntroAnatomy />'));
		expect(at).toBeLessThan(page.indexOf('Here is an order like the one in the drawing, as code.'));
	});

	it('draws the same scene every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by wired.test.ts from wired.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './wired.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./wired.art.ts');
	});
});
