import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { PlainForm } from './plain-form.tsrx';

// A form with no handler that posts to this origin is sent from its dispatch: busy until the reload lands, failures in @catch.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

const reads = () => server.gets.filter((get) => get === '/mut/items').length;

async function sendsInPlace(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	const readsBefore = reads();
	field.value = 'Hopper';
	submitter.focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	expect(document.activeElement).toBe(submitter);
	submitter.click();
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(server.posts).toEqual(['POST /mut/items name=Hopper&via=button']);
	expect(reads()).toBe(readsBefore + 1);
	expect(field.value).toBe('Grace');
	expect(form.isConnected).toBe(true);
}

test('CSR: the form is sent from the page, held busy until the reload lands, and shows fresh', async () => {
	const container = (await render(PlainForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await sendsInPlace(container);
});

test('SSR: the same, on the first submit of a resumed page', async () => {
	const { container } = await renderSSR(PlainForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await sendsInPlace(container as HTMLElement);
});

test('SSR: a failed answer reaches @catch with its text, and the typed value stays', async () => {
	const { container } = await renderSSR(PlainForm);
	const field = (container as HTMLElement).querySelector<HTMLInputElement>('[data-field]')!;
	field.value = 'Taken';
	server.nextPost = [{ status: 422, body: 'Name taken' }];
	(container as HTMLElement).querySelector<HTMLButtonElement>('[data-submit]')!.click();
	await shows(container as HTMLElement, '[data-failed]', 'Name taken');
	expect(field.value).toBe('Taken');
	expect(field.isConnected).toBe(true);
});
