import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { dropOn, fileOf } from '../../test-support/drag.ts';
import Form from './scenarios/form.tsrx';

// Its own file: a compiled page installs its row-minting loader into a single
// unqualified global, so two scenarios with a repeat cannot share one suite.

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

// The whole point of keeping the real input's own list in step: a file that only
// ever arrived by drop is not in it otherwise, and the form would send nothing.
// The form's own FormData is read rather than submitted, because a real submit
// navigates the test page away.
test('CSR: the form would send the dropped files', async () => {
	await render(Form);
	dropOn(el('droparea'), fileOf('one.txt'), fileOf('two.txt'));
	await expect
		.poll(() => [...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name))
		.toEqual(['one.txt', 'two.txt']);
	const data = new FormData(el<HTMLFormElement>('form'));
	expect(data.getAll('attachment').map((one) => (one instanceof File ? one.name : one))).toEqual([
		'one.txt',
		'two.txt',
	]);
});

test('CSR: an upload with nothing chosen sends no file', async () => {
	await render(Form);
	const data = new FormData(el<HTMLFormElement>('form'));
	const sent = data.getAll('attachment').filter((one) => one instanceof File && one.size > 0);
	expect(sent).toEqual([]);
});

test('CSR: the field submits under the name the root was given', async () => {
	await render(Form);
	expect(el<HTMLInputElement>('field').name).toBe('attachment');
});
