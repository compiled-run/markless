import { cleanup, render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { storageAttributeName, storageCookieName } from '../../../serializer/src/storage-slot.ts';
import ModuleScopeTheme from '../fixtures/storage-derived.tsrx';
import MoodPage from './mood-page.tsrx';

// A client render of a component whose storage() value was saved earlier, as a playground re-run is.
afterEach(async () => {
	await cleanup();
	localStorage.removeItem('csr-mood');
	document.cookie = `${storageCookieName('csr-mood')}=;path=/;max-age=0`;
	document.documentElement.removeAttribute(storageAttributeName('csr-mood'));
	localStorage.removeItem('markless:theme');
	document.documentElement.removeAttribute(storageAttributeName('markless:theme'));
});

const spots = (container: ParentNode) => ({
	direct: container.querySelector('[data-direct]')?.textContent,
	fn: container.querySelector('[data-fn]')?.textContent,
	computed: container.querySelector('[data-computed]')?.textContent,
	attribute: container.querySelector('main')?.getAttribute('data-cheerful'),
	branch: [...container.querySelectorAll('main em, main strong')].map((node) => node.textContent),
	list: [...container.querySelectorAll('li')].map((node) => node.textContent),
	prop: container.querySelector('[data-badge]')?.textContent,
});

test('a client render shows a value saved in localStorage in every spot derived from it, with no interaction', async () => {
	localStorage.setItem('csr-mood', 'happy-sunny');
	const { container } = await render(MoodPage);

	expect(spots(container)).toEqual({
		direct: 'happy-sunny',
		fn: 'Feeling happy after 0 taps',
		computed: 'HAPPY-SUNNY',
		attribute: 'true',
		branch: ['Not calm'],
		list: ['happy', 'sunny'],
		prop: 'happy-sunny',
	});
	expect(document.documentElement.getAttribute(storageAttributeName('csr-mood'))).toBe('happy-sunny');

	container.querySelector('button')!.click();
	await expect.poll(() => spots(container).fn).toBe('Feeling happy after 1 taps');
	expect(spots(container).direct).toBe('happy-sunny');
});

test('a client render reads the storage cookie before localStorage, as the page head script does', async () => {
	localStorage.setItem('csr-mood', 'calm');
	document.cookie = `${storageCookieName('csr-mood')}=${encodeURIComponent('happy-cookie')};path=/`;
	const { container } = await render(MoodPage);

	expect(spots(container).direct).toBe('happy-cookie');
	expect(spots(container).fn).toBe('Feeling happy after 0 taps');

	container.querySelector('button')!.click();
	await expect.poll(() => spots(container).fn).toBe('Feeling happy after 1 taps');
	expect(spots(container).direct).toBe('happy-cookie');
});

test('a client render with nothing saved shows the starting value and still responds', async () => {
	const { container } = await render(MoodPage);

	expect(spots(container)).toMatchObject({ direct: 'calm', fn: 'Feeling calm after 0 taps', branch: ['Calm'] });
	container.querySelector('button')!.click();
	await expect.poll(() => spots(container).fn).toBe('Feeling calm after 1 taps');
});

test('a client render shows the saved value of a storage() declared at module scope', async () => {
	localStorage.setItem('markless:theme', 'dark');
	const { container } = await render(ModuleScopeTheme);

	expect(container.querySelector('[data-theme-value]')?.textContent).toBe('dark');
});

test('a client render of a module-scope storage() saves a write', async () => {
	const { container } = await render(ModuleScopeTheme);

	container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
	await expect.poll(() => container.querySelector('[data-theme-value]')?.textContent).toBe('dark');
	await expect.poll(() => localStorage.getItem('markless:theme')).toBe('dark');
	expect(document.documentElement.getAttribute(storageAttributeName('markless:theme'))).toBe('dark');
});
