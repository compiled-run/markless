import { beforeEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import { boardRequest, installServer, release, resetServer, saveRequest, waitingRequests } from './grid-server.ts';
import ArmTryPage from './k-arm-try-page.tsrx';
import SavingArmPage from './k-saving-arm-page.tsrx';
import SavingNestedPage from './k-saving-nested-page.tsrx';
import { lines } from './timeline.ts';

// A save's handler opens an @if holding a component from another file, inside the @try whose value the save reloads,
// and @try blocks drawn by an arm the browser renders while their value is held or loading.
installServer();
beforeEach(resetServer);

const poll = { timeout: 4_000, interval: 10 };
const loaded = ['title.even: a round 0', 'row: a one', 'row: a two'];

async function answer(request: string) {
	await expect.poll(waitingRequests, poll).toContain(request);
	release(request);
}

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// Every page error during `run`, so a throw outside the assertions still fails the test.
async function noErrors(run: () => Promise<void>) {
	const errors: string[] = [];
	const onError = (event: ErrorEvent) => errors.push(String(event.error ?? event.message));
	const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	try {
		await run();
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	}
}

// Every distinct set of lines the page showed while `run` ran.
async function shown(run: () => Promise<void>) {
	const seen = new Set<string>();
	const look = () => void seen.add(lines().join(' | '));
	const observer = new MutationObserver(look);
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	try {
		await run();
	} finally {
		observer.disconnect();
	}
	return [...seen];
}

async function firstLoad(mode: 'CSR' | 'SSR', round = 0) {
	if (mode === 'CSR') await answer(boardRequest('a', round));
}

for (const [mode, mount] of [
	['CSR', () => render(SavingArmPage)],
	['SSR', () => renderSSR(SavingArmPage)],
] as const)
	test(`${mode}: the component arm shows while the save and its reload are held, then gives way to the saved row`, () =>
		noErrors(async () => {
			await mount();
			await firstLoad(mode);
			await expect.poll(() => lines(), poll).toEqual(loaded);
			document.querySelector<HTMLElement>('[data-grid-save]')!.click();
			await expect.poll(waitingRequests, poll).toContain(saveRequest('a'));
			await expect.poll(() => lines(), poll).toEqual([...loaded, 'saving: a']);
			await answer(saveRequest('a'));
			await expect.poll(waitingRequests, poll).toContain(boardRequest('a', 0));
			expect(lines()).toEqual([...loaded, 'saving: a']);
			release(boardRequest('a', 0));
			await expect.poll(() => lines(), poll).toEqual([...loaded, 'row: a saved 1']);
		}),
	);

const nestedLoaded = ['title.even: a round 0', 'row: a one', 'row: a two'];
for (const [mode, mount] of [
	['CSR', () => render(SavingNestedPage)],
	['SSR', () => renderSSR(SavingNestedPage)],
] as const) {
	test(`${mode}: inside a nested @try, the component arm and a keyed row the handler adds show while the save is held`, () =>
		noErrors(async () => {
			await mount();
			await firstLoad(mode);
			await expect.poll(() => lines(), poll).toEqual(nestedLoaded);
			click('[data-grid-save]');
			await expect.poll(() => lines(), poll).toEqual([...nestedLoaded, 'saving: a', 'note: note 1']);
			await answer(saveRequest('a'));
			await expect.poll(waitingRequests, poll).toContain(boardRequest('a', 0));
			expect(lines()).toEqual([...nestedLoaded, 'saving: a', 'note: note 1']);
			release(boardRequest('a', 0));
			await expect.poll(() => lines(), poll).toEqual([...nestedLoaded, 'row: a saved 1', 'note: note 1']);
		}));

	test(`${mode}: after a handler failed into @catch, a save still opens its component arm in the kept content`, () =>
		noErrors(async () => {
			await mount();
			await firstLoad(mode);
			await expect.poll(() => lines(), poll).toEqual(nestedLoaded);
			click('[data-grid-fail]');
			const failed = [...nestedLoaded, 'failed: The save was refused'];
			await expect.poll(() => lines(), poll).toEqual(failed);
			click('[data-grid-save]');
			await expect.poll(() => lines(), poll).toContain('saving: a');
			await answer(saveRequest('a'));
			await answer(boardRequest('a', 0));
			await expect.poll(() => lines(), poll).toContain('row: a saved 1');
			expect(lines()).not.toContain('saving: a');
		}));
}

for (const [mode, mount] of [
	['CSR', () => render(ArmTryPage)],
	['SSR', () => renderSSR(ArmTryPage)],
] as const) {
	test(`${mode}: a @try an arm brings in while a save holds its value shows the kept answer, never @pending`, () =>
		noErrors(async () => {
			await mount();
			await firstLoad(mode);
			await expect.poll(() => lines(), poll).toEqual(['title: a round 0']);
			click('[data-grid-save]');
			await expect.poll(waitingRequests, poll).toContain(saveRequest('a'));
			click('[data-grid-close]');
			await expect.poll(() => lines(), poll).toEqual([]);
			const seen = await shown(async () => {
				click('[data-grid-open]');
				await expect.poll(() => lines(), poll).toEqual(['title: a round 0']);
			});
			expect(seen.filter((each) => each.includes('pending'))).toEqual([]);
			await answer(saveRequest('a'));
			await answer(boardRequest('a', 0));
			await expect.poll(waitingRequests, poll).toEqual([]);
			expect(lines()).toEqual(['title: a round 0']);
		}));

	test(`${mode}: an @if in the @pending arm of a @try on the page opens while the old answer is kept`, () =>
		noErrors(async () => {
			await mount();
			await firstLoad(mode);
			await expect.poll(() => lines(), poll).toEqual(['title: a round 0']);
			click('[data-grid-close]');
			click('[data-grid-reload]');
			click('[data-grid-open]');
			await expect.poll(() => lines(), poll).toEqual(['pending: Loading']);
			click('[data-more]');
			await expect.poll(() => lines(), poll).toEqual(['pending: Loading', 'saving: more']);
			await answer(boardRequest('a', 1));
			await expect.poll(() => lines(), poll).toEqual(['title: a round 1']);
		}));
}
