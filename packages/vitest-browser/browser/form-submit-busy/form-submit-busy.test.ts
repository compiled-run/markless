import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { ChoiceForm } from './choice-form.tsrx';
import { NoteForm } from './note-form.tsrx';
import { SyncForm } from './sync-form.tsrx';

// While a form's submit handler's promise runs, the form is busy and a repeat of the same submission is not sent, with no author code.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const busy = (form: Element) => form.getAttribute('aria-busy');

function parts(container: ParentNode) {
	return {
		form: container.querySelector<HTMLFormElement>('[data-form]')!,
		field: container.querySelector<HTMLInputElement>('[data-field]')!,
		submitter: container.querySelector<HTMLButtonElement>('[data-submit]')!,
	};
}

// A person presses the focused button: a click, then Enter on the button, then Enter in the field.
async function pressAgain(field: HTMLInputElement, submitter: HTMLButtonElement) {
	submitter.click();
	await userEvent.keyboard('{Enter}');
	submitter.form!.requestSubmit(submitter);
	field.focus();
	await userEvent.keyboard('{Enter}');
	submitter.focus();
}

async function holdsUntilSettled(container: HTMLElement, fail: boolean) {
	const { form, field, submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise, ...(fail && { status: 422, body: 'Name taken' }) }];
	submitter.focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	expect(submitter.hasAttribute('disabled')).toBe(false);
	expect(document.activeElement).toBe(submitter);
	expect(getComputedStyle(form).opacity).toBe('0.5');
	await pressAgain(field, submitter);
	await settle();
	expect(server.posts).toEqual(['POST /mut/items Grace']);
	expect(busy(form)).toBe('true');
	expect(document.activeElement).toBe(submitter);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
	return { form, submitter };
}

test('CSR: the form is busy and its submit control marked from the submit until the handler resolves', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, submitter } = await holdsUntilSettled(container, false);
	expect(document.activeElement).toBe(submitter);
	expect(getComputedStyle(form).opacity).toBe('1');
	await shows(container, '[data-names]', 'Ada, Grace');
	submitter.click();
	await expect.poll(() => server.posts.length, poll).toBe(2);
});

test('SSR resume: the served form is busy while its handler runs and a repeat is not sent', async () => {
	const { container } = await renderSSR(NoteForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await holdsUntilSettled(container as HTMLElement, false);
	await shows(container as HTMLElement, '[data-names]', 'Ada, Grace');
});

test('CSR: a rejected handler clears the marks and its error reaches the nearest @catch', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, submitter } = await holdsUntilSettled(container, true);
	await shows(container, '[data-failed]', 'Name taken');
	expect(form.hasAttribute('aria-busy')).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
	expect(server.posts).toEqual(['POST /mut/items Grace']);
});

test('SSR resume: a rejected handler clears the marks and its error reaches the nearest @catch', async () => {
	const { container } = await renderSSR(NoteForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await holdsUntilSettled(container as HTMLElement, true);
	await shows(container as HTMLElement, '[data-failed]', 'Name taken');
});

// The rule: a submit whose values differ from every submission still running starts at once, so the edit is sent exactly once.
test('a second submit with changed values runs at once and is sent once; the form stays busy until both settle', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, field, submitter } = parts(container);
	const first = deferred<void>();
	const second = deferred<void>();
	server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	field.focus();
	await userEvent.fill(field, 'Hopper');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => server.posts.length, poll).toBe(2);
	expect(server.posts).toEqual(['POST /mut/items Grace', 'POST /mut/items Hopper']);
	await pressAgain(field, submitter);
	await userEvent.fill(field, 'Grace');
	submitter.click();
	await settle();
	expect(server.posts).toHaveLength(2);
	first.resolve();
	await settle();
	expect(busy(form)).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	second.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
	await shows(container, '[data-names]', 'Ada, Grace, Hopper');
});

test('several submit controls: only the one that submitted is marked, and another one is a new submission', async () => {
	const container = (await render(ChoiceForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const keep = container.querySelector<HTMLButtonElement>('[data-keep]')!;
	const archive = container.querySelector<HTMLButtonElement>('[data-archive]')!;
	const other = container.querySelector<HTMLButtonElement>('[data-other]')!;
	const first = deferred<void>();
	const second = deferred<void>();
	server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
	keep.focus();
	keep.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(keep.getAttribute('aria-disabled')).toBe('true');
	expect(archive.hasAttribute('aria-disabled')).toBe(false);
	expect(other.hasAttribute('aria-disabled')).toBe(false);
	expect(document.activeElement).toBe(keep);
	keep.click();
	await settle();
	expect(server.posts).toEqual(['POST /mut/items keep:Mug']);
	archive.click();
	await expect.poll(() => archive.getAttribute('aria-disabled'), poll).toBe('true');
	expect(server.posts).toEqual(['POST /mut/items keep:Mug', 'POST /mut/items archive:Mug']);
	first.resolve();
	await expect.poll(() => keep.hasAttribute('aria-disabled'), poll).toBe(false);
	expect(busy(form)).toBe('true');
	expect(archive.getAttribute('aria-disabled')).toBe('true');
	second.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(archive.hasAttribute('aria-disabled')).toBe(false);
});

test('a synchronous submit handler marks nothing', async () => {
	const container = (await render(SyncForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const marks: string[] = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) marks.push(`${(record.target as Element).tagName} ${record.attributeName}`);
	});
	observer.observe(form, { subtree: true, attributeFilter: ['aria-busy', 'aria-disabled'] });
	submitter.click();
	submitter.click();
	await shows(container, '[data-sent]', '2');
	await settle();
	observer.disconnect();
	expect(marks).toEqual([]);
});

// Known gap: the hold starts only once the handler has returned its promise, after the handler's code and the hold's module load, so a second press before then is sent too.
test.fails('a repeat pressed before the hold exists is not sent (known gap: the hold arrives after the first press has loaded its code)', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	submitter.click();
	await settle();
	try {
		expect(server.posts).toEqual(['POST /mut/items Grace']);
	} finally {
		answer.resolve();
	}
});

// Measured, not Markless behaviour: which way of blocking a button keeps keyboard focus on it.
test('disabling a focused button drops its focus; aria-disabled keeps it', async () => {
	const form = document.createElement('form');
	const button = document.createElement('button');
	form.append(button);
	document.body.append(form);
	button.focus();
	button.setAttribute('aria-disabled', 'true');
	await settle(20);
	const ariaKeeps = document.activeElement === button;
	button.removeAttribute('aria-disabled');
	button.disabled = true;
	await settle(20);
	const disabledKeeps = document.activeElement === button;
	button.disabled = false;
	const back = document.activeElement === button;
	form.remove();
	expect({ ariaKeeps, disabledKeeps, back }).toEqual({ ariaKeeps: true, disabledKeeps: false, back: false });
});
