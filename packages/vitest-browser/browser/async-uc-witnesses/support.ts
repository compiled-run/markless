import { test } from 'vitest';

export const poll = { timeout: 5_000, interval: 5 };

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };
type Mount = () => Promise<Screen>;

// Painted is not yet settled: a click before the first settle is a first load, which marks nothing.
export async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

export function each(
	name: string,
	mounts: { readonly csr: Mount; readonly ssr: Mount },
	check: (container: HTMLElement) => Promise<void>,
	run: typeof test | typeof test.fails = test,
): void {
	for (const [mode, mount] of [
		['client-rendered', mounts.csr],
		['server-rendered', mounts.ssr],
	] as const)
		run(`${name} (${mode})`, async () => {
			await check(await mounted(await mount()));
		});
}

export const text = (container: ParentNode, selector: string): string | null =>
	container.querySelector(selector)?.textContent ?? null;

export const busy = (container: ParentNode, selector: string): boolean =>
	container.querySelector(selector)?.getAttribute('aria-busy') === 'true';

// True when the element or an ancestor inside the container carries the busy mark.
export function underBusy(container: HTMLElement, selector: string): boolean {
	const busyHost = container.querySelector(selector)?.closest('[aria-busy="true"]');
	return !!busyHost && container.contains(busyHost);
}

export function click(container: ParentNode, selector: string): void {
	const target = container.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
}

// Every value each reader returned while the watch ran, in order and without repeats.
export function watch<T>(container: HTMLElement, read: Record<string, () => T>) {
	const seen = Object.fromEntries(Object.keys(read).map((name) => [name, [] as T[]]));
	const record = () => {
		for (const [name, value] of Object.entries(read)) {
			const current = value();
			const list = seen[name]!;
			if (list.length === 0 || JSON.stringify(list.at(-1)) !== JSON.stringify(current)) list.push(current);
		}
	};
	const observer = new MutationObserver(record);
	observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true });
	record();
	return () => {
		for (const _ of observer.takeRecords()) record();
		observer.disconnect();
		record();
		return seen;
	};
}
