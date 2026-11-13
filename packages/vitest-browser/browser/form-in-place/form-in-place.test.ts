import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { keptSubmission } from '../../../web/src/event-current-target.ts';
import { IN_PLACE_LOCATION_HEADER } from '../../../web/src/fns/in-place-headers.ts';
import { PlainForm } from './plain-form.tsrx';
import { RowForms } from './row-form.tsrx';

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
	await expect.poll(() => submitter.getAttribute('aria-disabled'), poll).toBe('true');
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

// A real pointer and real keys, then a second save on the same form once the first has landed.
async function sendsByRealInput(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	await userEvent.fill(field, 'Hopper');
	await userEvent.click(submitter);
	await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe('true');
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await shows(container, '[data-names]', 'Ada, name=Hopper&via=button');
	await userEvent.fill(field, 'Turing');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => server.posts, poll).toEqual([
		'POST /mut/items name=Hopper&via=button',
		'POST /mut/items name=Turing&via=button',
	]);
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await shows(container, '[data-names]', 'Ada, name=Hopper&via=button, name=Turing&via=button');
}

test('CSR: a real click and then Enter in the field each send once, held busy until the reload lands', async () => {
	const container = (await render(PlainForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await sendsByRealInput(container);
});

test('SSR: the same with real input on a resumed page', async () => {
	const { container } = await renderSSR(PlainForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await sendsByRealInput(container as HTMLElement);
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

test('CSR: the page’s own listener runs first, sees the submit not cancelled, and when it cancels, nothing is sent', async () => {
	const container = (await render(PlainForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	let heard: SubmitEvent | undefined;
	const seen: boolean[] = [];
	form.addEventListener('submit', (event) => {
		seen.push(event.defaultPrevented);
		heard = event;
		event.preventDefault();
	});
	container.querySelector<HTMLButtonElement>('[data-submit]')!.click();
	expect(seen).toEqual([false]);
	expect(await keptSubmission(heard!)).toBeUndefined();
	expect(server.posts).toEqual([]);
	expect(form.hasAttribute('aria-busy')).toBe(false);
});

test('SSR: an answer pointing at an address that is not a web address is a failed save, and nothing runs', async () => {
	const { container } = await renderSSR(PlainForm);
	server.nextPost = [{ headers: { [IN_PLACE_LOCATION_HEADER]: 'javascript:window.__formXss=1' } }];
	(container as HTMLElement).querySelector<HTMLButtonElement>('[data-submit]')!.click();
	await shows(container as HTMLElement, '[data-failed]', 'The save answered with a redirect that is not a web address.');
	expect((window as unknown as { __formXss?: number }).__formXss).toBeUndefined();
});

async function rowFormSendsInPlace(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-row-form]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	await userEvent.click(container.querySelector<HTMLButtonElement>('[data-row-submit]')!);
	await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe('true');
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(server.posts).toEqual(['POST /mut/items name=Ada']);
	expect(container.querySelector('[data-row-form]')!.isConnected).toBe(true);
}

test('CSR: a form drawn by another component of the file, inside the @try, is sent from the page', async () => {
	const container = (await render(RowForms)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await rowFormSendsInPlace(container);
});

test('SSR: the same on a resumed page, and its failure reaches the @catch around it', async () => {
	const { container } = await renderSSR(RowForms);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await rowFormSendsInPlace(container as HTMLElement);
	server.nextPost = [{ status: 422, body: 'Name taken' }];
	await userEvent.click((container as HTMLElement).querySelector<HTMLButtonElement>('[data-row-submit]')!);
	await shows(container as HTMLElement, '[data-failed]', 'Name taken');
});
