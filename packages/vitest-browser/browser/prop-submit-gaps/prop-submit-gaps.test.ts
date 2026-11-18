import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ArmPage from './arm-page.tsrx';
import MiddlePage from './middle-page.tsrx';
import RowPage from './row-page.tsrx';
import SameFileMiddlePage from './same-file-middle-page.tsrx';

// A parent's cancelling submit handler, passed through a middle component or onto a form in an @if arm or @for row, cancels every submit during the dispatch.
afterEach(() => cleanup());

function submit(container: ParentNode, name: string): boolean {
	const form = container.querySelector<HTMLFormElement>(`form[data-form="${name}"]`);
	if (!form) throw new Error(`Expected the ${name} form on the page.`);
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

const sent = (container: ParentNode) => container.querySelector('[data-sent]')?.textContent;

async function expectCancelled(container: ParentNode, kept: string, native: string) {
	const before = Number(sent(container));
	expect(submit(container, kept)).toBe(true);
	await expect.poll(() => sent(container)).toBe(String(before + 1));
	expect(submit(container, kept)).toBe(true);
	await expect.poll(() => sent(container)).toBe(String(before + 2));
	// A sibling instance handed a handler that does not cancel leaves its submit to the browser.
	expect(submit(container, native)).toBe(false);
	await expect.poll(() => sent(container)).toBe(String(before + 12));
}

async function expectArmCancels(container: ParentNode) {
	await expectCancelled(container, 'kept', 'native');
	for (const name of ['kept', 'native']) {
		container.querySelector<HTMLButtonElement>(`[data-toggle="${name}"]`)!.click();
		await expect.poll(() => container.querySelector(`form[data-form="${name}"]`)).toBeNull();
		container.querySelector<HTMLButtonElement>(`[data-toggle="${name}"]`)!.click();
		await expect
			.poll(() => container.querySelector(`form[data-form="${name}"]`))
			.not.toBeNull();
	}
	await expectCancelled(container, 'kept', 'native');
}

async function expectRowsCancel(container: ParentNode) {
	await expectCancelled(container, 'kept-a', 'native-a');
	await expectCancelled(container, 'kept-b', 'native-b');
	for (const name of ['kept', 'native']) {
		container.querySelector<HTMLButtonElement>(`[data-add="${name}"]`)!.click();
		await expect
			.poll(() => container.querySelector(`form[data-form="${name}-c"]`))
			.not.toBeNull();
	}
	await expectCancelled(container, 'kept-c', 'native-c');
}

test(`SSR: a handler an imported middle component passes on to its child's form cancels every submit`, async () => {
	await expectCancelled((await renderSSR(MiddlePage)).container, 'kept', 'native');
});

test(`CSR: a handler an imported middle component passes on to its child's form cancels every submit`, async () => {
	await expectCancelled((await render(MiddlePage)).container, 'kept', 'native');
});

test(`SSR: a handler a same-file middle component passes on under another name cancels every submit`, async () => {
	await expectCancelled((await renderSSR(SameFileMiddlePage)).container, 'kept', 'native');
});

test(`CSR: a handler a same-file middle component passes on under another name cancels every submit`, async () => {
	await expectCancelled((await render(SameFileMiddlePage)).container, 'kept', 'native');
});

test(`SSR: a passed-through handler on a form inside the child's @if cancels every submit, also after the arm reopens`, async () => {
	await expectArmCancels((await renderSSR(ArmPage)).container);
});

test(`CSR: a passed-through handler on a form inside the child's @if cancels every submit, also after the arm reopens`, async () => {
	await expectArmCancels((await render(ArmPage)).container);
});

test(`SSR: a passed-through handler on forms in the child's @for rows cancels every submit, also on a row added later`, async () => {
	await expectRowsCancel((await renderSSR(RowPage)).container);
});

test(`CSR: a passed-through handler on forms in the child's @for rows cancels every submit, also on a row added later`, async () => {
	await expectRowsCancel((await render(RowPage)).container);
});
