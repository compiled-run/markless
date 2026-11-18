import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { OpenTasks } from './open-tasks.tsrx';

afterEach(cleanup);

const tasks = () => [...document.querySelectorAll('[data-task]')].map((row) => row.textContent);
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function followsBothInputs() {
	expect(tasks()).toEqual(['write', 'review']);
	click('[data-add]');
	await expect.poll(tasks).toEqual(['write', 'review', 'task 3']);
	click('[data-fewer]');
	click('[data-fewer]');
	click('[data-fewer]');
	await expect.poll(tasks).toEqual(['write', 'review']);
	click('[data-finish]');
	await expect.poll(tasks).toEqual([]);
	expect(document.querySelector('[data-none]')?.textContent).toBe('nothing open');
}

test('CSR: a @for over a helper call re-runs the call when either input changes', async () => {
	await render(OpenTasks);
	await followsBothInputs();
});

test('SSR: a @for over a helper call re-runs the call when either input changes after resume', async () => {
	await renderSSR(OpenTasks);
	await followsBothInputs();
});
