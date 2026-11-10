import type { MarklessDefer } from './defer.ts';
import type { InlineResumeModule, InlineRoot, InlineWakeSources } from './resumer.ts';

// Only ever imported on demand, and only types from elsewhere: a static edge would ship these bodies in the docs playground's bundler.
export function authoredLateWakeSources(): Pick<InlineWakeSources, 'returnWake' | 'storageWake'> {
	return {
		returnWake: runInlineResumerReturnWake.toString(),
		storageWake: runInlineResumerStorageWake.toString(),
	};
}

function runInlineResumerStorageWake(
	slotSymbolKey: string,
	rendered: ReadonlyArray<readonly [slotKey: string, value: string]>,
	wake: () => void,
): void {
	const slot = (globalThis as Record<symbol, Record<string, unknown> | undefined>)[
		Symbol.for(slotSymbolKey)
	];
	if (slot && rendered.some(([key, value]) => Object.hasOwn(slot, key) && slot[key] !== value))
		wake();
}

// Shown again as it was left: the router marks the page before this runs; a back-forward cache restore or an HTTP cache replay arrives as `pageshow`.
function runInlineResumerReturnWake(
	reaskProperty: string,
	resumeModuleUrl: string | undefined,
	loadModule: (url: string) => Promise<InlineResumeModule>,
): void {
	const root = (document.currentScript as HTMLScriptElement | null)?.closest<
		InlineRoot & Record<string, unknown>
	>('[data-async-container]');
	if (!root || !resumeModuleUrl) return;
	const life = (root.__mL ||= {});
	// A streamed page installed the deferred-trigger helper, which also waits for its arms to land.
	const idle =
		(globalThis as { __mDefer?: MarklessDefer }).__mDefer?.idle ??
		((_: Element, run: () => void) => (globalThis.requestIdleCallback ?? setTimeout)(run));
	const wake = () =>
		idle(root, async () => {
			// A runtime that wired since re-asked as it did; the router leaves the started mark of the page it replaced.
			if (typeof root[reaskProperty] === 'function' || root.__mL !== life) return;
			root.__marklessDelegatedDispatch = true;
			const module = await (root.__mResume ||= loadModule(resumeModuleUrl).catch((error) => {
				throw ((root.__mResume = undefined), error);
			}));
			if (root.__mL === life) await module.resumeContainerEvent({ root, event: 0 });
		});
	if (root[reaskProperty] === true) wake();
	const shown = (event: PageTransitionEvent) => {
		if (root.__mL !== life || !root.isConnected) return removeEventListener('pageshow', shown);
		const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
		const replayed = !event.persisted && entry?.type === 'back_forward' && entry.transferSize === 0;
		const reask = root[reaskProperty];
		// A wired runtime re-asks a restore on its own listener.
		if (typeof reask === 'function') {
			if (replayed) reask();
		} else if (event.persisted || replayed) {
			root[reaskProperty] = true;
			wake();
		}
	};
	addEventListener('pageshow', shown);
}
