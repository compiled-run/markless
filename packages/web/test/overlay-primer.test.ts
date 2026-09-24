import { expect, test, vi } from 'vitest';
import { PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import {
	createInlineResumerOverlayPrimerSource,
	createPrerenderInlineVisiblePrimerSource,
} from '../src/inline/resumer.ts';

type Gesture = { type: string; key?: string };

function boot(shown: boolean) {
	const listeners = new Map<string, (event: Gesture) => void>();
	const tasks: Array<() => void> = [];
	const root = {
		__marklessOverlayInstalled: false,
		__marklessDelegatedDispatch: false,
		__marklessOverlayPrimedDismissal: undefined as string | undefined,
		querySelector: (selector: string) =>
			selector === '[overlay]:not([hidden])' && shown ? {} : null,
	};
	const resumeContainerEvent = vi.fn();
	const load = vi.fn(async () => ({ resumeContainerEvent }));
	const source = createInlineResumerOverlayPrimerSource('/build/resume.js').replace(
		'(url) => import(/* @vite-ignore */ url)',
		'load',
	);
	new Function('document', 'addEventListener', 'removeEventListener', 'setTimeout', 'load', source)(
		{ currentScript: { closest: () => root } },
		(type: string, listener: (event: Gesture) => void) => listeners.set(type, listener),
		(type: string) => listeners.delete(type),
		(task: () => void) => tasks.push(task),
		load,
	);
	return {
		root,
		load,
		resumeContainerEvent,
		listeners,
		show: () => {
			shown = true;
		},
		fire: (event: Gesture) => listeners.get(event.type)?.(event),
		flush: async () => {
			for (const task of tasks.splice(0)) task();
			await Promise.resolve();
		},
	};
}

test.each([
	{ type: 'pointerdown' },
	{ type: 'keydown', key: 'Escape' },
	{ type: 'keydown', key: 'Enter' },
])('a hidden overlay does not wake or retain $type $key', async (event) => {
	const f = boot(false);
	f.fire(event);
	await f.flush();
	expect(f.load).not.toHaveBeenCalled();
	expect(f.root.__marklessDelegatedDispatch).toBe(false);
	expect(f.root.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test.each([{ type: 'pointerdown' }, { type: 'keydown', key: 'Escape' }])(
	'a shown overlay still wakes once on $type $key',
	async (event) => {
		const f = boot(true);
		f.fire(event);
		f.fire(event);
		await f.flush();
		expect(f.load).toHaveBeenCalledExactlyOnceWith('/build/resume.js');
		expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
		expect(f.root.__marklessOverlayPrimedDismissal).toBe(
			event.key === 'Escape' ? 'escape' : undefined,
		);
	},
);

test('a closed overlay keeps its primer for a later shown surface', async () => {
	const f = boot(false);
	f.fire({ type: 'keydown', key: 'Escape' });
	await f.flush();
	f.show();
	f.fire({ type: 'pointerdown' });
	await f.flush();
	expect(f.load).toHaveBeenCalledTimes(1);
	expect(f.root.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test('Escape during a pending authored wake is retained without a second import', async () => {
	const f = boot(true);
	f.root.__marklessDelegatedDispatch = true;
	f.fire({ type: 'keydown', key: 'Escape' });
	await f.flush();
	expect(f.load).not.toHaveBeenCalled();
	expect(f.root.__marklessOverlayPrimedDismissal).toBe('escape');
});

test('installation releases the primer listeners without retaining another dismissal', async () => {
	const f = boot(true);
	f.root.__marklessOverlayInstalled = true;
	f.fire({ type: 'keydown', key: 'Escape' });
	await f.flush();
	expect(f.listeners.size).toBe(0);
	expect(f.load).not.toHaveBeenCalled();
	expect(f.root.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test('a visible forward does not claim the Escape an open overlay needs', async () => {
	const f = boot(true);
	(f.root as { __marklessDelegatedDispatch: unknown }).__marklessDelegatedDispatch = 'visible';
	f.fire({ type: 'keydown', key: 'Escape' });
	await f.flush();
	expect(f.load).toHaveBeenCalledExactlyOnceWith('/build/resume.js');
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
	expect(f.root.__marklessDelegatedDispatch).toBe(true);
	expect(f.root.__marklessOverlayPrimedDismissal).toBe('escape');
});

test('a wake-channel visible dispatch leaves the overlay primer armed for Escape', async () => {
	const f = boot(true);
	// The boot's delegated listener claims every event that bubbles to the root.
	const host = {
		dispatchEvent: () => {
			f.root.__marklessDelegatedDispatch = true;
			return true;
		},
	};
	let intersect: ((entries: ReadonlyArray<unknown>) => void) | undefined;
	class FakeIntersectionObserver {
		constructor(callback: (entries: ReadonlyArray<unknown>) => void) {
			intersect = callback;
		}
		observe() {}
		unobserve() {}
	}
	const nodes = [host];
	new Function('document', 'IntersectionObserver', createPrerenderInlineVisiblePrimerSource([1]))(
		{
			currentScript: { closest: () => f.root },
			createTreeWalker: () => ({ nextNode: () => nodes.shift() ?? null }),
		},
		FakeIntersectionObserver,
	);
	intersect!([{ isIntersecting: true, target: host }]);
	expect(f.root.__marklessDelegatedDispatch).toBe(PROTOCOL_VISIBLE_EVENT_NAME);

	f.fire({ type: 'keydown', key: 'Escape' });
	await f.flush();
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({ root: f.root, event: 0 });
	expect(f.root.__marklessOverlayPrimedDismissal).toBe('escape');
});
