import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { deferred, poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { NoteForm } from './note-form.tsrx';

// The hold's module is held back here, so a press can land while it is still on its way, as on a slow first load.
const arrival = vi.hoisted(() => {
	let open!: () => void;
	const gate = new Promise<void>((resolve) => (open = resolve));
	return { gate, open };
});
vi.mock('../../../web/src/submit-hold.ts', async (importOriginal) => {
	await arrival.gate;
	return importOriginal();
});

installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

// A press loads the hold beside its handler, so the form is busy before its save is sent, however slow the hold's code is.
test('nothing is sent until the hold has arrived, and the form is busy while its save is out', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	try {
		submitter.click();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.posts).toEqual([]);
		expect(form.hasAttribute('aria-busy')).toBe(false);
		arrival.open();
		await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Grace']);
		expect(form.getAttribute('aria-busy')).toBe('true');
		expect(submitter.getAttribute('aria-disabled')).toBe('true');
	} finally {
		answer.resolve();
	}
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await shows(container, '[data-names]', 'Ada, Grace');
});

// Known gap: both presses reach the page before the hold exists, so the repeat is sent too.
test.fails('a repeat pressed while the hold is still loading is not sent (known gap: the guard starts with the hold)', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	submitter.click();
	try {
		arrival.open();
		await expect.poll(() => server.posts.length, poll).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(server.posts).toHaveLength(1);
	} finally {
		answer.resolve();
	}
});
