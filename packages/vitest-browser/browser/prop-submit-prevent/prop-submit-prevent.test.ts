import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ImportedPage from './imported-page.tsrx';
import SameFilePage from './same-file-page.tsrx';

// A parent's submit handler passed straight to a child's form cancels the native submit during the dispatch, before any code loads.
afterEach(() => cleanup());

function submit(container: ParentNode, name: string): boolean {
	const form = container.querySelector<HTMLFormElement>(`form[data-form="${name}"]`);
	if (!form) throw new Error(`Expected the ${name} form on the page.`);
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

const sent = (container: ParentNode) => container.querySelector('[data-sent]')?.textContent;

async function expectCancelledAndHandled(container: ParentNode) {
	expect(submit(container, 'kept')).toBe(true);
	await expect.poll(() => sent(container)).toBe('1');
	expect(submit(container, 'kept')).toBe(true);
	await expect.poll(() => sent(container)).toBe('2');
	// A sibling instance handed a handler that does not cancel leaves its submit to the browser.
	expect(submit(container, 'native')).toBe(false);
	await expect.poll(() => sent(container)).toBe('12');
}

test('SSR: an imported child form running the parent handler from props.onSave cancels every submit, not only the one that starts the code', async () => {
	await expectCancelledAndHandled((await renderSSR(ImportedPage)).container);
});

test('CSR: an imported child form running the parent handler from props.onSave cancels every submit', async () => {
	await expectCancelledAndHandled((await render(ImportedPage)).container);
});

test('SSR: a same-file child form running a destructured onSubmit prop cancels every submit, not only the one that starts the code', async () => {
	await expectCancelledAndHandled((await renderSSR(SameFilePage)).container);
});

test('CSR: a same-file child form running a destructured onSubmit prop cancels every submit', async () => {
	await expectCancelledAndHandled((await render(SameFilePage)).container);
});
