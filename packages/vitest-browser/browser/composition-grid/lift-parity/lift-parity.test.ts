import { afterEach, beforeEach, expect, test } from 'vitest';
import { renderStream } from '../../../src/index.ts';
import { boardRequest, installServer, release, resetServer, waitingRequests } from '../grid-server.ts';
import { playStream } from '../timeline.ts';
import ArmPickMiddle from './arm-pick-middle.tsrx';
import ArmPickPage from './arm-pick-page.tsrx';
import ContentMiddle from './content-middle.tsrx';
import ContentPage from './content-page.tsrx';
import ModeMiddle from './mode-middle.tsrx';
import ModePage from './mode-page.tsrx';
import PickMiddle from './pick-middle.tsrx';
import PickPage from './pick-page.tsrx';
import ArmPickRelayPage from './arm-pick-relay-page.tsrx';
import ModeRelayPage from './mode-relay-page.tsrx';
import PickRelayPage from './pick-relay-page.tsrx';

// A child's @if inside a @try arm, with the @try's component placed one level deeper (as a router page places it):
// the branch's records are lifted once as a branch and once more inside the boundary's arm records.
installServer();
beforeEach(resetServer);
const errors: string[] = [];
const onError = (event: ErrorEvent) => errors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
beforeEach(() => {
	errors.length = 0;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
});

const poll = { timeout: 4_000, interval: 20 };
const lines = (label: string) => [...document.querySelectorAll(`[data-g="${label}"]`)].map((node) => node.textContent?.trim());
async function click(selector: string) {
	await expect.poll(() => document.querySelector(selector), { ...poll, message: `waiting for ${selector}` }).not.toBeNull();
	document.querySelector<HTMLElement>(selector)!.click();
}
async function answer(subject: string, round: number) {
	const request = boardRequest(subject, round);
	await expect.poll(waitingRequests, poll).toContain(request);
	release(request);
}

const levels = [
	['the @try component as the root', ContentMiddle, ModeMiddle, PickMiddle, ArmPickMiddle],
	['the @try component one level deeper', ContentPage, ModePage, PickPage, ArmPickPage],
] as const;

for (const [where, ...mounts] of levels) {
	const [content, mode, pick, armPick] = mounts;

	test(`${where}: a text-only arm reading a prop follows a reload`, async () => {
		await playStream(content === ContentMiddle ? renderStream(ContentMiddle) : renderStream(ContentPage));
		await expect.poll(() => lines('text'), poll).toEqual(['a round 0']);
		await click('[data-grid-reload]');
		await answer('a', 1);
		await expect.poll(() => lines('text'), poll).toEqual(['a round 1']);
		expect(errors).toEqual([]);
	});

	test(`${where}: an arm chosen by a constant prop keeps its live rows`, async () => {
		await playStream(mode === ModeMiddle ? renderStream(ModeMiddle) : renderStream(ModePage));
		await expect.poll(() => lines('row'), poll).toEqual(['a one', 'a two']);
		await click('[data-grid-subject]');
		await answer('b', 0);
		await expect.poll(() => lines('row'), poll).toEqual(['b three']);
		expect(errors).toEqual([]);
	});

	test(`${where}: a row's handler calls the callback prop its composer passed`, async () => {
		await playStream(pick === PickMiddle ? renderStream(PickMiddle) : renderStream(PickPage));
		await expect.poll(() => lines('picked'), poll).toEqual(['none']);
		await click('[data-pick="a-two"]');
		await expect.poll(() => lines('picked'), poll).toEqual(['a-two']);
		expect(errors).toEqual([]);
	});

	test(`${where}: an arm's handler calls the callback prop, served and after reopening`, async () => {
		await playStream(armPick === ArmPickMiddle ? renderStream(ArmPickMiddle) : renderStream(ArmPickPage));
		await expect.poll(() => lines('picks'), poll).toEqual(['0']);
		await click('[data-pick-arm]');
		await expect.poll(() => lines('picks'), poll).toEqual(['1']);
		await click('[data-toggle]');
		await expect.poll(() => lines('closed'), poll).toEqual(['Closed']);
		await click('[data-toggle]');
		await click('[data-pick-arm]');
		await expect.poll(() => lines('picks'), poll).toEqual(['2']);
		expect(errors).toEqual([]);
	});
}

// The constant or the callback comes from above the @try's component, so the boundary's lift is the one that renames it.
test('a constant prop from the page picks the arm, and its rows stay live', async () => {
	await playStream(renderStream(ModeRelayPage));
	await expect.poll(() => lines('row'), poll).toEqual(['a one', 'a two']);
	await click('[data-grid-subject]');
	await answer('b', 0);
	await expect.poll(() => lines('row'), poll).toEqual(['b three']);
	expect(errors).toEqual([]);
});

test("a row's handler reaches the page's callback forwarded through the @try's component", async () => {
	await playStream(renderStream(PickRelayPage));
	await click('[data-pick="a-two"]');
	await expect.poll(() => lines('picked'), poll).toEqual(['a-two']);
	expect(errors).toEqual([]);
});

test("an arm's handler reaches the page's callback forwarded through the @try's component, served and reopened", async () => {
	await playStream(renderStream(ArmPickRelayPage));
	await click('[data-pick-arm]');
	await expect.poll(() => lines('picks'), poll).toEqual(['1']);
	await click('[data-toggle]');
	await expect.poll(() => lines('closed'), poll).toEqual(['Closed']);
	await click('[data-toggle]');
	await click('[data-pick-arm]');
	await expect.poll(() => lines('picks'), poll).toEqual(['2']);
	expect(errors).toEqual([]);
});
