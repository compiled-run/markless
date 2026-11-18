import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { SameAnswerForm } from './same-answer-form.tsrx';

// A @try with a @catch has its own gate over the values it shows; a reload that answers the same data still settles it.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

async function clearsAfterSameAnswer(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const before = server.gets.length;
	container.querySelector<HTMLButtonElement>('[data-submit]')!.click();
	await expect.poll(() => server.gets.length, poll).toBe(before + 1);
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(text(container, '[data-names]')).toBe('Ada');
}

test('CSR: a save whose reload answers the same data clears the busy form', async () => {
	const container = (await render(SameAnswerForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await clearsAfterSameAnswer(container);
});

test('SSR: the same on a resumed page', async () => {
	const { container } = await renderSSR(SameAnswerForm);
	await clearsAfterSameAnswer(container as HTMLElement);
});
