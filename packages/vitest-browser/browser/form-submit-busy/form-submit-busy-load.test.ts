import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { SeveralForms } from '../form-in-place/several-forms.tsrx';
import { NoteForm } from './note-form.tsrx';
import { SyncForm } from './sync-form.tsrx';

// The hold's module is held back here, so a press can land while it is still on its way, as on a slow first load.
const arrival = vi.hoisted(() => {
	let open!: () => void;
	const gate = new Promise<void>((resolve) => (open = resolve));
	return { gate, open, asked: 0 };
});
vi.mock('../../../web/src/submit-hold.ts', async (importOriginal) => {
	arrival.asked++;
	await arrival.gate;
	return importOriginal();
});

installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

// First in the file, before any test asks for the hold: a handler that returns no promise holds nothing, so its press asks for no hold code.
test('a submit whose handler returns no promise never asks for the hold', async () => {
	const container = (await render(SyncForm)).container as HTMLElement;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	submitter.click();
	await expect.poll(() => container.querySelector('[data-sent]')!.textContent, poll).toBe('1');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(arrival.asked).toBe(0);
});

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
	submitter.click();
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Grace', 'POST /mut/items Hopper']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

// The hold has arrived from here on: the gate opens once per file.
// A form sent in place carries the FormData taken at the press (#660), so text typed after the press, while the sender and hold still load, stays out of the first send.
test('text typed after the press stays out of the first send of a form sent in place', async () => {
	const container = (await render(SeveralForms)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-add]')!;
	const field = container.querySelector<HTMLInputElement>('[data-title]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	field.value = 'Jam';
	form.requestSubmit();
	field.value = 'Tea';
	try {
		arrival.open();
		await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items title=Jam']);
		expect(field.value).toBe('Tea');
	} finally {
		answer.resolve();
	}
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

// A handler reads the form when its code runs, as on main, so text typed between the press and that run is sent; the repeat check is read at that same moment.
test('a handler form sends what it holds when its handler runs, and a repeat of that send is not sent', async () => {
	arrival.open();
	const container = (await renderSSR(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	// A first save wakes the page, so the next press reaches the runtime in the press's own task.
	submitter.click();
	await shows(container, '[data-names]', 'Ada, Grace');
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	field.value = 'Hopper';
	try {
		await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Grace', 'POST /mut/items Hopper']);
		await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe('true');
		submitter.click();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(server.posts).toHaveLength(2);
		field.value = 'Grace';
		submitter.click();
		await expect.poll(() => server.posts.at(-1), poll).toBe('POST /mut/items Grace');
		expect(server.posts).toHaveLength(3);
	} finally {
		answer.resolve();
	}
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});
