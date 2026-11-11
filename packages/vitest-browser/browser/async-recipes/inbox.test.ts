import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, answerAt, calls, requested, resetCalls } from './gate.ts';
import Inbox from './inbox.tsrx';
import { frames, restoreTab, setTabHidden, settles, watchLoudness } from './support.ts';

afterEach(async () => {
	restoreTab();
	await cleanup();
});

const shown = () => [...document.querySelectorAll('section p')].map((p) => p.textContent?.trim());
const unread = (count: number) => ({ value: { unread: count } });
const reconnect = () => window.dispatchEvent(new Event('online'));

async function switchAwayAndBack() {
	setTabHidden(true);
	await frames();
	setTabHidden(false);
}

async function loaded() {
	await settles(() => requested('inbox')).toBe(1);
	answer('inbox');
	await settles(shown).toEqual(['0 unread']);
}

async function refreshesQuietlyOnReturnAndReconnect() {
	const loudness = watchLoudness();
	setTabHidden(true);
	await frames();
	expect(requested('inbox')).toBe(1);
	setTabHidden(false);
	await settles(() => requested('inbox')).toBe(2);
	expect(shown()).toEqual(['0 unread']);
	answer('inbox', unread(3));
	await settles(shown).toEqual(['3 unread']);

	reconnect();
	await settles(() => requested('inbox')).toBe(3);
	answer('inbox', unread(5));
	await settles(shown).toEqual(['5 unread']);
	await frames();
	expect(requested('inbox')).toBe(3);
	expect(loudness()).toEqual({ busy: 0, said: [] });
}

test('CSR: coming back to the tab or reconnecting loads again, quietly', async () => {
	resetCalls();
	await render(Inbox);
	await loaded();
	await refreshesQuietlyOnReturnAndReconnect();
});

test('SSR: once the resumed page is idle, coming back to the tab or reconnecting loads again, quietly', async () => {
	resetCalls();
	await renderSSR(Inbox);
	expect(shown()).toEqual(['0 unread']);
	expect(requested('inbox')).toBe(0);
	// `onIdle` starts the listeners; reconnecting until one request goes out shows they are in place.
	await settles(() => {
		if (requested('inbox') === 0) reconnect();
		return requested('inbox');
	}).toBe(1);
	answer('inbox');
	await frames();
	await refreshesQuietlyOnReturnAndReconnect();
});

test('CSR: reconnecting after a failed first load recovers from @catch', async () => {
	resetCalls();
	await render(Inbox);
	await settles(() => requested('inbox')).toBe(1);
	answer('inbox', { error: new Error('You are offline.') });
	await settles(shown).toEqual(['You are offline.']);
	reconnect();
	await settles(() => requested('inbox')).toBe(2);
	answer('inbox', unread(2));
	await settles(shown).toEqual(['2 unread']);
});

test('CSR: a return while a refresh is still out aborts it, and a late answer from it never shows', async () => {
	resetCalls({ ignoreAbort: true });
	await render(Inbox);
	await loaded();
	await switchAwayAndBack();
	await settles(() => requested('inbox')).toBe(2);
	reconnect();
	await settles(() => requested('inbox')).toBe(3);
	expect(calls()).toEqual(['inbox:done', 'inbox:aborted', 'inbox:open']);
	answerAt(2, unread(9));
	await settles(shown).toEqual(['9 unread']);
	answerAt(1, unread(4));
	await frames();
	expect(shown()).toEqual(['9 unread']);
});

test('CSR: a late answer from the replaced refresh that lands first is dropped too', async () => {
	resetCalls({ ignoreAbort: true });
	await render(Inbox);
	await loaded();
	await switchAwayAndBack();
	await settles(() => requested('inbox')).toBe(2);
	await switchAwayAndBack();
	await settles(() => requested('inbox')).toBe(3);
	answerAt(1, unread(4));
	await frames();
	expect(shown()).toEqual(['0 unread']);
	answerAt(2, unread(9));
	await settles(shown).toEqual(['9 unread']);
});
