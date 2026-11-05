import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { angleOf, BIG, clamp, describePlay, describeScrub, describeVolume, MINI, tick, TRACK, VOLUME } from './model.ts';
import { drawing } from './player.ts';

const playerArt = drawing();

const page = readFileSync(new URL('../../../pages/build/shared.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./player-anatomy.tsrx', import.meta.url), 'utf8');

describe('two players, one shared track', () => {
	it('moves one progress for both, and keeps each volume its own', () => {
		expect(TRACK).toBe('Harbour Lights');
		expect(describePlay('mini', true)).toContain('Both players are playing Harbour Lights');
		expect(describePlay('big', false)).toBe(`Paused on ${BIG}. ${MINI} paused too.`);
		expect(describeScrub('big', 0.5)).toBe(`Scrubbed ${BIG} to 50%. ${MINI} jumped to the same spot.`);
		expect(describeVolume('mini', 0.6, 0.7)).toContain('each player is its own widget');
		expect(VOLUME.mini).not.toBe(VOLUME.big);
		expect(angleOf(0)).toBe(-135);
		expect(angleOf(1)).toBe(135);
		expect(clamp(1.4)).toBe(1);
		expect(tick(0.999)).toBe(0);
	});

	it('shows two players, one progress, two volumes, the track as the only words, and names in a caption below', () => {
		expect(piece.match(/class="player (mini|big)"/g)).toHaveLength(2);
		expect(piece.match(/aria-valuenow=\{percent\}/g)).toHaveLength(2);
		expect(piece).toContain('aria-valuenow={miniVol}');
		expect(piece).toContain('aria-valuenow={bigVol}');
		const words = [...piece.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
		expect(words).toEqual(['{TRACK}', '{TRACK}']);
		expect(piece).toContain('<p class="caption" aria-hidden="true">{hovered}</p>');
		expect(piece).not.toMatch(/cord|wire|parcel|pulse|crocodile|@for|@if|bags|count/i);
	});

	it('plays: press, scrub by drag or keys, knobs that turn alone, hover names', () => {
		expect(piece.match(/setPointerCapture/g)).toHaveLength(4);
		expect(piece).toContain('onPointerenter={() => (hovered = MINI)}');
		expect(piece.match(/tabindex="0"/g)).toHaveLength(6);
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(playerArt.big.cover.ink.length).toBeGreaterThan(300);
		expect(playerArt.big.knob.ink.length).toBeGreaterThan(300);
		expect(playerArt.mini.bar.width).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(playerArt));
	});

	it('is on the Shared page under its own heading', () => {
		expect(page).toContain("import PlayerAnatomy from '../../components/figures/player/player-anatomy.tsrx';");
		expect(page.indexOf('## Two components read one copy')).toBeLessThan(page.indexOf('<PlayerAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by player.test.ts from player.ts. Refresh with the figure test's -u flag.
import type { drawing } from './player.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(playerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./player.art.ts');
	});
});
