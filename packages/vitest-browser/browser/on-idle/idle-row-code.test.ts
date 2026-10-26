import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import { App as BranchRows } from './idle-branch-rows.tsrx';
import { App } from './idle-wakes-list.tsrx';

type MintLoad = (...args: unknown[]) => Promise<unknown>;
type Root = HTMLElement & { __asyncResumeRuntimeStarted?: boolean };

function holdIdle() {
	const queued: Array<() => void> = [];
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({
			frame: (run: () => void) => run(),
			idle: (run: () => void) => queued.push(run),
		}),
	});
	return {
		release: () => {
			for (const run of queued.splice(0)) run();
		},
		restore: () => delete (Element.prototype as { __mClock?: unknown }).__mClock,
	};
}

// Counts every call of the row-code loader the page's resume module installs.
function countRowCodeLoads() {
	let installed = (globalThis as { __marklessRowMint?: MintLoad }).__marklessRowMint;
	const counter = { loads: 0 };
	Object.defineProperty(globalThis, '__marklessRowMint', {
		configurable: true,
		get: () =>
			installed &&
			((...args: unknown[]) => {
				counter.loads++;
				return installed!(...args);
			}),
		set: (load: MintLoad) => (installed = load),
	});
	return Object.assign(counter, {
		restore() {
			delete (globalThis as { __marklessRowMint?: MintLoad }).__marklessRowMint;
			if (installed)
				(globalThis as { __marklessRowMint?: MintLoad }).__marklessRowMint = installed;
		},
	});
}

let idle: ReturnType<typeof holdIdle> | undefined;
let rowCode: ReturnType<typeof countRowCodeLoads> | undefined;
afterEach(() => {
	idle?.restore();
	rowCode?.restore();
	idle = rowCode = undefined;
	cleanup();
});

const items = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('[data-list] li'), (row) => row.textContent);

async function wokenByIdle(
	render: () => ReturnType<typeof renderSSR> = () => renderSSR(App),
): Promise<HTMLElement> {
	idle = holdIdle();
	rowCode = countRowCodeLoads();
	const container = (await render()).container as HTMLElement;
	await expect
		.poll(() => {
			idle!.release();
			return container.querySelector('[data-ready]');
		})
		.not.toBeNull();
	expect(
		container.querySelector<Root>('[data-async-container]')!.__asyncResumeRuntimeStarted,
	).toBe(true);
	await new Promise((done) => setTimeout(done, 150));
	return container;
}

// An onIdle handler runs at load as far as the reader is concerned: the runtime it starts must not run the page's row-building code.
test('a runtime an idle handler starts leaves the row code until the reader reaches for the page', async () => {
	const container = await wokenByIdle();
	expect(rowCode!.loads).toBe(0);

	container
		.querySelector('[data-append]')!
		.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
	await expect.poll(() => rowCode!.loads).toBeGreaterThan(0);

	container.querySelector<HTMLButtonElement>('[data-append]')!.click();
	await expect.poll(() => items(container)).toEqual(['a', 'b', 'n2']);
});

test('a click with no hover before it still builds the row after an idle start', async () => {
	const container = await wokenByIdle();
	expect(rowCode!.loads).toBe(0);

	container.querySelector<HTMLButtonElement>('[data-append]')!.click();
	await expect.poll(() => items(container)).toEqual(['a', 'b', 'n2']);
	container.querySelector<HTMLButtonElement>('[data-append]')!.click();
	await expect.poll(() => items(container)).toEqual(['a', 'b', 'n2', 'n3']);
});

const shown = (container: HTMLElement, list: string) =>
	Array.from(container.querySelectorAll(`[${list}] > *`), (row) => row.textContent?.trim());

// Rows holding an @if with no handler inside an arm have nothing to wire before the reader acts.
test('rows holding an @if leave their row code until the reader acts after an idle start', async () => {
	const container = await wokenByIdle(() => renderSSR(BranchRows));
	expect(rowCode!.loads).toBe(0);
	const first = container.querySelector('[data-task="x"] [data-badge]');

	container.querySelector<HTMLButtonElement>('[data-push]')!.click();
	await expect.poll(() => shown(container, 'data-tasks')).toEqual(['hotT', 'newX', 'Y']);
	expect(container.querySelector('[data-task="x"] [data-badge]')).toBe(first);
	expect(shown(container, 'data-group')).toEqual(['βGuide', 'Other']);
	expect(rowCode!.loads).toBeGreaterThan(0);
});
