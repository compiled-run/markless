import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased, type SsrRenderResult } from '../src/index.ts';
import { storageCookieName } from '../../serializer/src/storage-slot.ts';
import StorageFixture from './fixtures/storage.tsrx';

const storageSlot = Symbol.for('tsrx.storage/1');

afterEach(async () => {
	await cleanup();
	localStorage.removeItem('theme');
	document.cookie = `${storageCookieName('theme')}=;path=/;max-age=0`;
	document.documentElement.removeAttribute('data-theme');
	delete (globalThis as Record<symbol, unknown>)[storageSlot];
});

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function themeValue(screen: SsrRenderResult): HTMLOutputElement {
	return required(screen.container, 'output[data-theme-value]');
}

async function wake(screen: SsrRenderResult): Promise<void> {
	required<HTMLButtonElement>(screen.container, 'button[data-wake]').click();
	await expect
		.poll(
			() =>
				required<HTMLOutputElement>(screen.container, 'output[data-wake-count]')
					.textContent,
		)
		.toBe('1');
}

function installStorageReadProbe(): { readonly keys: string[]; restore(): void } {
	const original = Storage.prototype.getItem;
	const keys: string[] = [];
	Object.defineProperty(Storage.prototype, 'getItem', {
		configurable: true,
		writable: true,
		value(this: Storage, key: string) {
			keys.push(key);
			return original.call(this, key);
		},
	});
	return {
		keys,
		restore() {
			Object.defineProperty(Storage.prototype, 'getItem', {
				configurable: true,
				writable: true,
				value: original,
			});
		},
	};
}

test('storage cold load seeds the fallback before framework wake', async () => {
	const pending = await renderSSRPhased(StorageFixture);
	const screen = pending.mount();

	expect(document.documentElement.getAttribute('data-theme')).toBe('light');
	expect(themeValue(screen).textContent).toBe('light');
});

test('storage warm load adopts the seed without an extra runtime driver read', async () => {
	localStorage.setItem('theme', 'dark');
	const probe = installStorageReadProbe();
	try {
		const pending = await renderSSRPhased(StorageFixture);
		const screen = pending.mount();

		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(probe.keys).toEqual(['theme']);

		await wake(screen);
		await expect.poll(() => themeValue(screen).textContent).toBe('dark');
		expect(probe.keys).toEqual(['theme']);
	} finally {
		probe.restore();
	}
});

test('storage writes update every plane and survive a fresh SSR mount', async () => {
	const first = (await renderSSRPhased(StorageFixture)).mount();
	required<HTMLButtonElement>(first.container, 'button[data-toggle]').click();

	await expect.poll(() => themeValue(first).textContent).toBe('dark');
	expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	expect(localStorage.getItem('theme')).toBe('dark');

	await cleanup();
	const reloaded = (await renderSSRPhased(StorageFixture)).mount();
	await wake(reloaded);

	await expect.poll(() => themeValue(reloaded).textContent).toBe('dark');
	expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	expect(localStorage.getItem('theme')).toBe('dark');
});

test('module-scope storage renders the request cookie value on the server', async () => {
	const cookie = `${storageCookieName('theme')}=dark`;
	document.cookie = `${cookie};path=/`;
	const screen = (await renderSSRPhased(StorageFixture, { cookie })).mount();

	expect(themeValue(screen).textContent).toBe('dark');
	expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	await wake(screen);
	expect(themeValue(screen).textContent).toBe('dark');
});
