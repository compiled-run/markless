import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Imported from './imported.tsrx';
import SameFile from './same-file.tsrx';

afterEach(() => cleanup());

const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';

async function press(name: string, value: string) {
	const input = document.querySelector('[data-text]') as HTMLInputElement;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => textOf('[data-text-shown]')).toBe(value);
	(document.querySelector(`[data-press="${name}"]`) as HTMLButtonElement).click();
	await expect.poll(() => textOf('[data-text-shown]')).toBe('');
}

async function everyShapeWritesState() {
	const presses = [
		['member-inline', 'ink', 'ink'],
		['member-alias', ' pen ', 'pen'],
		['call-factory', 'nib', 'nib!'],
		['spread-shout', 'cap', 'CAP?'],
		['toolbar-factory', 'dot', 'dot!'],
		['host-alias', ' ash ', 'ash'],
		['host-shout', 'oak', 'OAK?'],
	] as const;
	const drafts: string[] = [];
	for (const [name, typed, expected] of presses) {
		await press(name, typed);
		drafts.push(expected);
		await expect.poll(() => textOf('[data-drafts]')).toBe(drafts.join(','));
	}
}

test('CSR: alias and factory handlers reach children that read props.onClick, call it, spread it or forward it', async () => {
	await render(SameFile);
	await everyShapeWritesState();
});

test('SSR: alias and factory handlers reach children that read props.onClick, call it, spread it or forward it after resume', async () => {
	await renderSSR(SameFile);
	await everyShapeWritesState();
});

test('CSR: the same handlers reach imported children', async () => {
	await render(Imported);
	await everyShapeWritesState();
});

test('SSR: the same handlers reach imported children after resume', async () => {
	await renderSSR(Imported);
	await everyShapeWritesState();
});
