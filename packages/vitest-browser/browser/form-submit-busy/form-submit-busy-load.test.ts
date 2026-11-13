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

// Known gap: a press is held only once its handler has returned a promise and the hold has loaded, so a repeat before that is sent.
test.fails('a repeat pressed while the hold is still loading is not sent (known gap: the hold starts after its module arrives)', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	await expect.poll(() => server.posts.length, poll).toBe(1);
	submitter.click();
	try {
		await expect.poll(() => server.posts.length, { timeout: 300, interval: 10 }).toBe(2);
		expect(server.posts).toHaveLength(1);
	} finally {
		answer.resolve();
	}
});

// The handler reads the form when it runs, which waits for nothing the page has not loaded, so a later edit misses the first send.
test('text typed after the press while the hold is still loading is not in the first send', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	submitter.click();
	try {
		await expect.poll(() => server.posts.length, poll).toBe(1);
		field.value = 'Hopper';
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.posts).toEqual(['POST /mut/items Grace']);
		expect(form.hasAttribute('aria-busy')).toBe(false);
	} finally {
		answer.resolve();
	}
});

test('an edit made while the hold is still loading is sent when submitted after it arrives', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	await expect.poll(() => server.posts.length, poll).toBe(1);
	field.value = 'Hopper';
	expect(form.hasAttribute('aria-busy')).toBe(false);
	arrival.open();
	await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe('true');
	// The repeat check compares with what the first press carried, not with what the field held when the hold arrived.
	field.value = 'Grace';
	submitter.click();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(server.posts).toEqual(['POST /mut/items Grace']);
	field.value = 'Hopper';
	submitter.click();
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Grace', 'POST /mut/items Hopper']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});
