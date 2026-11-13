import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import Page from './page.tsrx';

// A press waits only for content of its own that is still registering; a press elsewhere starts at once.
afterEach(() => cleanup());

type Registration = { readonly settled: Promise<boolean>; readonly holds: (node: unknown) => boolean };
type RegisteringRoot = { __marklessArmRegistering?: Set<Registration> };

const text = (selector: string) => document.querySelector(selector)?.textContent;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// Both handlers have run once, so their code is loaded and a press costs no task.
async function warmPage() {
	await render(Page);
	await expect.poll(() => text('[data-inside-count]')).toBe('0');
	press('[data-outside]');
	press('[data-inside]');
	await expect.poll(() => [text('[data-outside-count]'), text('[data-inside-count]')]).toEqual(['1', '1']);
	// The page's root element is the container its runtime registers on.
	return document.querySelector('main') as unknown as RegisteringRoot;
}

// Registration of the @try's arm, held open by the test; the arm is the section it rendered.
function holdArm(root: RegisteringRoot) {
	const arm = document.querySelector('[data-arm]')!;
	let settle!: (registered: boolean) => void;
	const entry: Registration = {
		settled: new Promise((resolve) => (settle = resolve)),
		holds: (node) => arm.contains(node as Node),
	};
	(root.__marklessArmRegistering ??= new Set()).add(entry);
	// As a registration does: the entry leaves the set once it has settled.
	void entry.settled.then(() => root.__marklessArmRegistering!.delete(entry));
	return settle;
}

// Microtasks only: a timer queued before the press has not run yet when the handler's write shows.
async function landsInThisTask(selector: string, expected: string) {
	let taskRan = false;
	setTimeout(() => (taskRan = true));
	for (let turn = 0; turn < 2000 && text(selector) !== expected; turn++) await Promise.resolve();
	return { shown: text(selector), taskRan };
}

test('a press outside an arm still registering starts in the same task', async () => {
	const root = await warmPage();
	holdArm(root);
	press('[data-outside]');
	expect(await landsInThisTask('[data-outside-count]', '2')).toEqual({ shown: '2', taskRan: false });
});

test('a registration that never settles holds no press elsewhere, even one queued behind a press inside it', async () => {
	const root = await warmPage();
	holdArm(root);
	press('[data-inside]');
	press('[data-outside]');
	await expect.poll(() => text('[data-outside-count]')).toBe('2');
	press('[data-outside]');
	await expect.poll(() => text('[data-outside-count]')).toBe('3');
	expect(text('[data-inside-count]')).toBe('1');
});

test('a press inside an arm still registering waits for it, then runs', async () => {
	const root = await warmPage();
	const release = holdArm(root);
	press('[data-inside]');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(text('[data-inside-count]')).toBe('1');
	release(true);
	await expect.poll(() => text('[data-inside-count]')).toBe('2');
});

test('a press inside an arm whose registration failed runs nothing', async () => {
	const root = await warmPage();
	const release = holdArm(root);
	press('[data-inside]');
	await new Promise((resolve) => setTimeout(resolve, 50));
	release(false);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(text('[data-inside-count]')).toBe('1');
	press('[data-outside]');
	await expect.poll(() => text('[data-outside-count]')).toBe('2');
});
