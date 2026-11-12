import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderServerHTML, renderStream } from '../../src/index.ts';
import FailingPage from './failing-page.tsrx';
import InstantPage from './instant-page.tsrx';
import Page from './page.tsrx';
import ProfilePage from './profile-page.tsrx';
import RowPage from './row-page.tsrx';
import { answerSaves } from './save.ts';

// A component rendered inside an @try arm opens its own @if from its own state:
// a "saving" row its submit handler writes before awaiting the save, an @if/@else on a status an
// async click handler flips, and a toggle in a component the @catch arm holds.
// Served inline, and streamed after the server's first flush, where the arm's records ride the stream.
afterEach(async () => {
	answerSaves();
	await cleanup();
});

const WAIT = { timeout: 3_000, interval: 10 };
const shown = () => document.querySelector('[data-saving]')?.textContent ?? null;

async function savingRowShowsWhileTheSaveRuns() {
	await expect.poll(() => document.querySelectorAll('li').length, WAIT).toBe(1);
	const input = document.querySelector('input')!;
	input.value = 'Walk dog';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	document.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
	await expect.poll(shown, WAIT).toBe('Walk dog (saving)');
	expect(input.value).toBe('');
	answerSaves();
	await expect.poll(shown, WAIT).toBe(null);
}

async function renameShowsWhileTheSaveRuns() {
	await expect.poll(() => document.querySelector('h2')?.textContent ?? null, WAIT).toBe('Ada');
	document.querySelector<HTMLButtonElement>('[data-rename]')!.click();
	await expect.poll(shown, WAIT).toBe('Renaming Ada');
	expect(document.querySelector('h2')).toBeNull();
	answerSaves();
	await expect.poll(() => document.querySelector('h2')?.textContent ?? null, WAIT).toBe('Ada');
	expect(shown()).toBe(null);
}

async function caughtNoteOpensAndCloses() {
	await expect.poll(() => document.querySelector('[data-error]')?.textContent ?? null, WAIT).toBe('Profile down');
	document.querySelector<HTMLButtonElement>('[data-help]')!.click();
	await expect.poll(shown, WAIT).toBe('The service did not answer.');
	document.querySelector<HTMLButtonElement>('[data-help]')!.click();
	await expect.poll(shown, WAIT).toBe(null);
}

function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

async function mountStreamed(stream: { readonly shell: string; readonly appends: ReadonlyArray<string> }) {
	expect(stream.appends).toHaveLength(1);
	const { container } = renderServerHTML(stream.shell);
	for (const chunk of stream.appends) appendStreamed(container, chunk);
}

test('CSR: the saving row shows while the save runs', async () => {
	await render(Page);
	await savingRowShowsWhileTheSaveRuns();
});

test('SSR: the saving row shows while the save runs, list served inline', async () => {
	await renderSSR(InstantPage);
	await savingRowShowsWhileTheSaveRuns();
});

test('SSR: the saving row shows while the save runs, list streamed after the first flush', async () => {
	await mountStreamed(await renderStream(Page));
	await savingRowShowsWhileTheSaveRuns();
});

test('CSR: an @if/@else on a status an async handler flips', async () => {
	await render(ProfilePage);
	await renameShowsWhileTheSaveRuns();
});

test('SSR: an @if/@else on a status an async handler flips, streamed after the first flush', async () => {
	await mountStreamed(await renderStream(ProfilePage));
	await renameShowsWhileTheSaveRuns();
});

test('CSR: a component in the @catch arm opens its own @if', async () => {
	await render(FailingPage);
	await caughtNoteOpensAndCloses();
});

test('SSR: a component in the @catch arm opens its own @if, streamed after the first flush', async () => {
	await mountStreamed(await renderStream(FailingPage));
	await caughtNoteOpensAndCloses();
});

test('SSR: a row component in a keyed @for opens its own @if, streamed after the first flush', async () => {
	await mountStreamed(await renderStream(RowPage));
	await expect.poll(() => document.querySelector('[data-more]')?.textContent ?? null, WAIT).toBe('Buy milk');
	document.querySelector<HTMLButtonElement>('[data-more]')!.click();
	await expect.poll(shown, WAIT).toBe('Notes for Buy milk');
	document.querySelector<HTMLButtonElement>('[data-more]')!.click();
	await expect.poll(shown, WAIT).toBe(null);
});
