import { afterEach, expect, test } from 'vitest';
import { STORAGE_SLOT_SYMBOL_KEY, storageCookieName } from '../../serializer/src/storage-slot.ts';
import { cleanup, renderSSRPhased, type SsrRenderResult } from '../src/index.ts';
import StorageBindings from './fixtures/storage-bindings.tsrx';

const cookieName = storageCookieName('manager');

type ResumeRoot = HTMLElement & {
	__asyncResumeRuntimeStarted?: boolean;
	__marklessDelegatedDispatch?: boolean | string;
};

afterEach(async () => {
	await cleanup();
	localStorage.removeItem('manager');
	document.cookie = `${cookieName}=;path=/;max-age=0`;
	document.documentElement.removeAttribute('data-manager');
	delete (globalThis as Record<symbol, unknown>)[Symbol.for(STORAGE_SLOT_SYMBOL_KEY)];
	delete (globalThis as Record<string, unknown>).__storagePwned;
});

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function resumeRoot(screen: SsrRenderResult): ResumeRoot {
	return required<ResumeRoot>(screen.container, '[data-async-container]');
}

function expectBindings(root: ParentNode, selected: string, others: ReadonlyArray<string>): void {
	expect(required(root, 'output[data-manager-text]').textContent).toBe(selected);
	expect(required(root, '[data-manager-attr]').getAttribute('data-manager-attr')).toBe(selected);
	expect(required(root, `[data-trigger="${selected}"]`).getAttribute('aria-selected')).toBe(
		'true',
	);
	expect(required(root, `[data-trigger="${selected}"]`).hasAttribute('ui-selected')).toBe(true);
	expect(required<HTMLElement>(root, `[data-panel="${selected}"]`).hidden).toBe(false);
	for (const other of others) {
		expect(required(root, `[data-trigger="${other}"]`).getAttribute('aria-selected')).toBe(
			'false',
		);
		expect(required(root, `[data-trigger="${other}"]`).hasAttribute('ui-selected')).toBe(
			false,
		);
		expect(required<HTMLElement>(root, `[data-panel="${other}"]`).hidden).toBe(true);
	}
}

// Two frames and an idle period: the self-wake schedules its start after the next frame.
async function settleLoad(): Promise<void> {
	for (let frame = 0; frame < 2; frame++)
		await new Promise((resolve) => requestAnimationFrame(resolve));
	await new Promise((resolve) => setTimeout(resolve, 150));
}

function savedCookie(): string | undefined {
	const entry = document.cookie.split('; ').find((part) => part.startsWith(`${cookieName}=`));
	return entry === undefined ? undefined : decodeURIComponent(entry.slice(cookieName.length + 1));
}

test('a saved storage value reaches every dependent binding after load without interaction', async () => {
	localStorage.setItem('manager', 'bun');
	const screen = (await renderSSRPhased(StorageBindings)).mount();
	const root = screen.container;

	expect(document.documentElement.getAttribute('data-manager')).toBe('bun');
	await expect.poll(() => required(root, 'output[data-manager-text]').textContent).toBe('bun');
	expectBindings(root, 'bun', ['npm', 'pnpm']);
	expect(resumeRoot(screen).__asyncResumeRuntimeStarted).toBe(true);
	await expect.poll(savedCookie).toBe('bun');
});

test('a request cookie renders the saved value into the served html with no runtime start', async () => {
	const cookie = `${cookieName}=bun`;
	document.cookie = `${cookie};path=/`;
	const phased = await renderSSRPhased(StorageBindings, { cookie });
	const screen = phased.mount();
	const root = screen.container;

	expect(document.documentElement.getAttribute('data-manager')).toBe('bun');
	expectBindings(root, 'bun', ['npm', 'pnpm']);
	await settleLoad();
	expect(resumeRoot(screen).__asyncResumeRuntimeStarted).toBeUndefined();
	expect(resumeRoot(screen).__marklessDelegatedDispatch).toBeUndefined();
	expectBindings(root, 'bun', ['npm', 'pnpm']);
});

test('a page rendered without a request and no saved value starts nothing at load', async () => {
	const screen = (await renderSSRPhased(StorageBindings)).mount();

	expectBindings(screen.container, 'npm', ['pnpm', 'bun']);
	await settleLoad();
	expect(resumeRoot(screen).__asyncResumeRuntimeStarted).toBeUndefined();
	expect(resumeRoot(screen).__marklessDelegatedDispatch).toBeUndefined();
	expect(savedCookie()).toBeUndefined();
});

test('a saved value equal to the fallback starts nothing at load', async () => {
	localStorage.setItem('manager', 'npm');
	const screen = (await renderSSRPhased(StorageBindings)).mount();

	await settleLoad();
	expect(resumeRoot(screen).__asyncResumeRuntimeStarted).toBeUndefined();
	expectBindings(screen.container, 'npm', ['pnpm', 'bun']);
});

test('a write saves the value to both the cookie and localStorage', async () => {
	const screen = (await renderSSRPhased(StorageBindings)).mount();

	required<HTMLElement>(screen.container, '[data-trigger="pnpm"]').click();

	await expect
		.poll(() => required(screen.container, 'output[data-manager-text]').textContent)
		.toBe('pnpm');
	expect(localStorage.getItem('manager')).toBe('pnpm');
	expect(savedCookie()).toBe('pnpm');
	expect(document.documentElement.getAttribute('data-manager')).toBe('pnpm');
});

test('a hostile cookie value renders as inert text and attribute content', async () => {
	const hostile = `"></output><img src=x onerror="globalThis.__storagePwned=1"></script><script>globalThis.__storagePwned=1</script><!--`;
	const cookie = `other=1; ${cookieName}=${encodeURIComponent(hostile)}`;
	document.cookie = `${cookieName}=${encodeURIComponent(hostile)};path=/`;
	const phased = await renderSSRPhased(StorageBindings, { cookie });
	const screen = phased.mount();
	const root = screen.container;

	expect(phased.html).not.toContain(hostile);
	expect(required(root, 'output[data-manager-text]').textContent).toBe(hostile);
	expect(required(root, '[data-manager-attr]').getAttribute('data-manager-attr')).toBe(hostile);
	expect(root.querySelector('img')).toBeNull();
	expect(document.documentElement.getAttribute('data-manager')).toBe(hostile);
	await settleLoad();
	expect((globalThis as Record<string, unknown>).__storagePwned).toBeUndefined();
	expect(resumeRoot(screen).__asyncResumeRuntimeStarted).toBeUndefined();
});

test('a cookie value that does not decode is ignored and the fallback renders', async () => {
	const cookie = `${cookieName}=%E0%A4%A`;
	const screen = (await renderSSRPhased(StorageBindings, { cookie })).mount();

	expectBindings(screen.container, 'npm', ['pnpm', 'bun']);
});
