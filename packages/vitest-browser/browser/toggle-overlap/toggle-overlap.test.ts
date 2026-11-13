import { afterEach, beforeEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import { settled, text, watch } from '../hold-after-save/support.ts';
import { installServer, resetServer, server } from './server.ts';
import StarList from './star-list.tsrx';

// Quick presses on one optimistic toggle: each press sends its save, and the first save's own `finally` lands while the others are still out.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

// One stable locator: the element's own locator names it by its text, which each press changes.
const star = () => page.getByRole('button');
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function oneSave() {
	await expect.poll(() => text('[data-star]'), poll).toBe('☆');
	const seen = watch(() => text('[data-star]'));
	await userEvent.click(star());
	await expect.poll(() => server.saves.length, poll).toBe(1);
	const reads = server.reads;
	server.saves[0]!.answer();
	await expect.poll(() => server.reads, poll).toBe(reads + 1);
	await settled();
	const { painted } = await seen();
	expect(painted).toEqual(['☆', '★']);
}

async function threeSaves() {
	await expect.poll(() => text('[data-star]'), poll).toBe('☆');
	const seen = watch(() => text('[data-star]'));
	// Presses 80 ms apart, as a person makes them; each save stays out until answered.
	for (let press = 0; press < 3; press++) {
		await userEvent.click(star());
		await pause(80);
	}
	await expect.poll(() => server.saves.map((save) => save.body), poll).toEqual(['true', 'false', 'true']);
	expect(text('[data-star]')).toBe('★');
	const reads = server.reads;
	// The first save answers while the second and third are still out, and nothing loads again yet.
	server.saves[0]!.answer();
	await pause(100);
	expect(server.reads).toBe(reads);
	server.saves[1]!.answer();
	server.saves[2]!.answer();
	await expect.poll(() => server.favorite, poll).toBe(true);
	await expect.poll(() => text('[data-star]'), poll).toBe('★');
	await settled();
	const { painted } = await seen();
	expect(painted).toEqual(['☆', '★', '☆', '★']);
}

test('CSR: one press holds its look until the reload brings the saved value', async () => {
	await render(StarList);
	await oneSave();
});

test('SSR: one press holds its look until the reload brings the saved value', async () => {
	await renderSSR(StarList);
	await oneSave();
});

// Not yet: a write in a save's `finally` paints at once while another press's save is still being sent, so the old value shows until the reload.
test.fails('CSR: three quick presses never show the old look again after the last one', async () => {
	await render(StarList);
	await threeSaves();
});

test.fails('SSR: three quick presses never show the old look again after the last one', async () => {
	await renderSSR(StarList);
	await threeSaves();
});
