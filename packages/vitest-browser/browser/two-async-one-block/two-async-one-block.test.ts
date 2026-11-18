import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HarborPage from './harbor-page.tsrx';
import LedgerPage from './ledger-page.tsrx';
import ProfilePage from './profile-page.tsrx';

afterEach(async () => {
	await cleanup();
	delete (globalThis as { __harborShoutRuns?: unknown }).__harborShoutRuns;
});

const text = (selector: string) => document.querySelector(selector)?.textContent?.trim();
const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((element) => element.textContent?.trim());
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinProfile() {
	await expect
		.poll(() => [text('[data-user]'), text('[data-posts]'), text('[data-failure]')])
		.toEqual(['Ada', '2 posts', undefined]);
	click('[data-next-user]');
	await expect
		.poll(() => [text('[data-user]'), text('[data-posts]'), text('[data-failure]')])
		.toEqual(['Grace', '2 posts', undefined]);
}

test('CSR: one @try reading two async values directly shows both', async () => {
	await render(ProfilePage);
	await pinProfile();
});

test('SSR: one @try reading two async values directly serves both and resumes', async () => {
	await renderSSR(ProfilePage);
	await pinProfile();
});

async function pinHarbor() {
	const shown = () => [
		text('[data-sky]'),
		texts('[data-berth]'),
		text('[data-tide]'),
		text('[data-failure]'),
	];
	await expect.poll(shown).toEqual(['CLEAR', ['n1', 's2'], '3 m', undefined]);
	click('[data-next-port]');
	await expect.poll(shown).toEqual(['GREY', ['n1', 's2'], '3 m', undefined]);
}

test('CSR: three async values, one through a sync computed, gate one @try', async () => {
	await render(HarborPage);
	await pinHarbor();
	// The sync computed never runs before the async value it reads exists.
	expect((globalThis as { __harborShoutRuns?: unknown }).__harborShoutRuns).not.toContain(
		undefined,
	);
});

test('SSR: three async values, one through a sync computed, are all served and resume', async () => {
	await renderSSR(HarborPage);
	await pinHarbor();
});

test('CSR: a rejection among two async values shows the @catch arm', async () => {
	await render(LedgerPage);
	await expect
		.poll(() => [text('[data-failure]'), text('[data-owner]')])
		.toEqual(['ledger offline', undefined]);
});

test('SSR: a rejection among two async values serves the @catch arm', async () => {
	await renderSSR(LedgerPage);
	await expect
		.poll(() => [text('[data-failure]'), text('[data-owner]')])
		.toEqual(['ledger offline', undefined]);
});
