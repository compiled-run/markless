import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderServerHTML, renderStream } from '../../src/index.ts';
import { deferred, poll } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import StreamedPlainForm from './streamed-plain-form.tsrx';

// A plain POST form in a @try whose value streams in later, pressed with a real pointer or a real key, never a scripted click.
installServer();
// A built page preloads the code a submit runs; the dev server serves it on demand, which would hide the race.
beforeAll(async () => {
	await Promise.all([
		import('../../../web/src/resume-runtime-shared.ts'),
		import('../../../web/src/submit-hold.ts'),
		import('../../../web/src/form-send.ts'),
	]);
});
let pageErrors: string[] = [];
let nativeSubmits = 0;
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
// Joins the window's listeners after the page's own, so it sees a submit no one kept from the browser and stops the tester page leaving.
const lastWord = (event: Event) => {
	if (!event.defaultPrevented) nativeSubmits++;
	event.preventDefault();
};
const queueLastWord = () => window.addEventListener('submit', lastWord, { once: true });
let lateGate = deferred<void>();
beforeEach(() => {
	resetServer();
	lateGate = deferred<void>();
	server.lateGate = lateGate.promise;
	pageErrors = [];
	nativeSubmits = 0;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	document.addEventListener('submit', queueLastWord);
});
afterEach(() => {
	lateGate.resolve();
	// Each test is a fresh document's stream, as a navigation retires the arm executor.
	delete (globalThis as { __mArm?: unknown }).__mArm;
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	document.removeEventListener('submit', queueLastWord);
	cleanup();
});

const find = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const names = () => find('[data-names]')?.textContent ?? null;

function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes)) script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

// The shell, then the form's arm; the rest of the stream is left to the caller.
async function streamForm() {
	const { shell, appends } = await renderStream(StreamedPlainForm);
	expect(appends.length).toBe(2);
	const { container } = renderServerHTML(shell);
	expect(find('[data-form]')).toBeNull();
	appendStreamed(container, appends[0]!);
	await expect.poll(names, poll).toBe('Ada');
	expect(find('[data-later-pending]')).not.toBeNull();
	return () => {
		appendStreamed(container, appends[1]!);
		lateGate.resolve();
	};
}

// One POST, the form busy until the reload it caused lands, then the list shows the save.
async function sendsOnce(form: string, sent: string, press: () => Promise<unknown>) {
	const reload = deferred<void>();
	server.holdReads = reload.promise;
	await press();
	await expect.poll(() => server.posts, poll).toEqual([`POST /mut/items ${sent}`]);
	await expect.poll(() => find(form)!.getAttribute('aria-busy'), poll).toBe('true');
	expect(names()).toBe('Ada');
	reload.resolve();
	await expect.poll(names, poll).toBe(`Ada, ${sent}`);
	await expect.poll(() => find(form)!.hasAttribute('aria-busy'), poll).toBe(false);
	expect(server.posts).toHaveLength(1);
	expect(nativeSubmits).toBe(0);
	expect(pageErrors).toEqual([]);
}

const typeAndClick = (field: string, submit: string) => async () => {
	await userEvent.fill(find(field)!, 'Hopper');
	await userEvent.click(find(submit)!);
};
const typeAndEnter = (field: string) => async () => {
	await userEvent.click(find(field)!);
	await userEvent.keyboard('Hopper{Enter}');
};

test('CSR: a real click sends the plain form in a @try', async () => {
	lateGate.resolve();
	await render(StreamedPlainForm);
	await expect.poll(names, poll).toBe('Ada');
	await sendsOnce('[data-form]', 'name=Hopper', typeAndClick('[data-field]', '[data-submit]'));
});

test('CSR: Enter in the field sends the plain form in a @try', async () => {
	lateGate.resolve();
	await render(StreamedPlainForm);
	await expect.poll(names, poll).toBe('Ada');
	await sendsOnce('[data-form]', 'name=Hopper', typeAndEnter('[data-field]'));
});

test('SSR stream: a real click as the first gesture on the page, while the rest of the stream is still out', async () => {
	const rest = await streamForm();
	find<HTMLInputElement>('[data-field]')!.value = 'Hopper';
	await sendsOnce('[data-form]', 'name=Hopper', async () => {
		await userEvent.click(find('[data-submit]')!);
		await expect.poll(() => server.posts.length, poll).toBe(1);
		expect(find('[data-later-pending]')).not.toBeNull();
		rest();
	});
});

test('SSR stream: a real click while the rest of the stream lands', async () => {
	const rest = await streamForm();
	await sendsOnce('[data-form]', 'name=Hopper', async () => {
		await userEvent.fill(find('[data-field]')!, 'Hopper');
		const pressed = userEvent.click(find('[data-submit]')!);
		rest();
		await pressed;
	});
	expect(find('[data-later]')!.textContent).toBe('ready');
});

test('SSR stream: a real click after the stream is done and the page is awake', async () => {
	const rest = await streamForm();
	rest();
	await userEvent.click(find('[data-field]')!);
	await expect.poll(() => find('[data-later]')?.textContent ?? null, poll).toBe('ready');
	await sendsOnce('[data-form]', 'name=Hopper', typeAndClick('[data-field]', '[data-submit]'));
});

test('SSR stream: Enter in the field', async () => {
	const rest = await streamForm();
	rest();
	await sendsOnce('[data-form]', 'name=Hopper', typeAndEnter('[data-field]'));
});

test('SSR stream: a second form in the same streamed @try, after the first', async () => {
	const rest = await streamForm();
	rest();
	await sendsOnce('[data-form]', 'name=Hopper', typeAndClick('[data-field]', '[data-submit]'));
	server.posts = [];
	const reload = deferred<void>();
	server.holdReads = reload.promise;
	await userEvent.fill(find('[data-second-field]')!, 'Lovelace');
	await userEvent.click(find('[data-second-submit]')!);
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items second=Lovelace']);
	await expect.poll(() => find('[data-second-form]')!.getAttribute('aria-busy'), poll).toBe('true');
	reload.resolve();
	await expect.poll(names, poll).toBe('Ada, name=Hopper, second=Lovelace');
	await expect.poll(() => find('[data-second-form]')!.hasAttribute('aria-busy'), poll).toBe(false);
	expect(nativeSubmits).toBe(0);
	expect(pageErrors).toEqual([]);
});

test('SSR stream: a form outside any @try is left to the browser, as a control', async () => {
	const rest = await streamForm();
	rest();
	await typeAndClick('[data-outside-field]', '[data-outside-submit]')();
	expect(nativeSubmits).toBe(1);
	expect(server.posts).toEqual([]);
	expect(find('[data-outside-form]')!.hasAttribute('aria-busy')).toBe(false);
	expect(pageErrors).toEqual([]);
});

test('SSR stream: a second save from the same form, once the first has landed', async () => {
	const rest = await streamForm();
	rest();
	await sendsOnce('[data-form]', 'name=Hopper', typeAndClick('[data-field]', '[data-submit]'));
	server.posts = [];
	const reload = deferred<void>();
	server.holdReads = reload.promise;
	await userEvent.fill(find('[data-field]')!, 'Turing');
	await userEvent.click(find('[data-submit]')!);
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items name=Turing']);
	await expect.poll(() => find('[data-form]')!.getAttribute('aria-busy'), poll).toBe('true');
	reload.resolve();
	await expect.poll(names, poll).toBe('Ada, name=Hopper, name=Turing');
	await expect.poll(() => find('[data-form]')!.hasAttribute('aria-busy'), poll).toBe(false);
	expect(nativeSubmits).toBe(0);
	expect(pageErrors).toEqual([]);
});
