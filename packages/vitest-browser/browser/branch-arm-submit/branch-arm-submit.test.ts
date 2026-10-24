import { cleanup, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import StateBranchPage from './state-branch-page.tsrx';

// A form inside an @if arm cancels its native submit at once, before any code loads.
afterEach(() => cleanup());

function submitPrevented(container: ParentNode): boolean {
	const form = container.querySelector<HTMLFormElement>('form[data-form]');
	if (!form) throw new Error('Expected the form on the page.');
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

test('SSR: a form in an @if on state cancels its submit', async () => {
	expect(submitPrevented((await renderSSR(StateBranchPage)).container)).toBe(true);
});
