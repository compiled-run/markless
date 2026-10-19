import { ASYNC_PROTOCOL_VERSION, PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import { afterEach, expect, test, vi } from 'vitest';
import { createInlineDeferTriggerSource, INLINE_DEFER_LOADER_SOURCE } from '../src/inline/defer.ts';
import { renderToString } from '../src/render-to-string.ts';

type Host = { readonly name: string };

// The page's elements in DOM order, the way a tree walker over the container yields them.
const elementWalker = (root: { getElementsByTagName?: (name: string) => ArrayLike<unknown> }) => {
	const all = root.getElementsByTagName?.('*') ?? [];
	let next = 0;
	return { nextNode: () => all[next++] ?? null };
};
type Entry = { readonly target: Host; readonly isIntersecting: boolean };

afterEach(() => {
	delete (globalThis as { __mDefer?: unknown }).__mDefer;
});

// The visible lane of the shared deferred-trigger helper, booted with the host indexes a page with
// visible hosts at DOM-order indexes 1 and 3 ships.
function boot(options: { readonly startsRuntime?: boolean } = {}) {
	const [top, press, bottom] = [{ name: 'top' }, { name: 'press' }, { name: 'bottom' }];
	const root: Record<string, unknown> & { name: string } = {
		name: 'root',
		getElementsByTagName: () => [top, press, bottom],
	};
	let callback: ((entries: Entry[]) => void) | undefined;
	const observed = new Set<Host>();
	class FakeObserver {
		constructor(next: (entries: Entry[]) => void) {
			callback = next;
		}
		observe(target: Host) {
			observed.add(target);
		}
		unobserve(target: Host) {
			observed.delete(target);
		}
	}
	const resumeContainerEvent = vi.fn(async (input: { root: typeof root }) => {
		if (options.startsRuntime) input.root.__asyncResumeRuntimeStarted = true;
	});
	const load = vi.fn(async () => ({ resumeContainerEvent }));
	const source = createInlineDeferTriggerSource('visible', [1, 3])
		.replace(INLINE_DEFER_LOADER_SOURCE, 'load')
		.slice(1);
	new Function('document', 'IntersectionObserver', 'load', source)(
		{
			currentScript: {
				closest: () => root,
				getAttribute: (name: string) =>
					name === 'data-markless-resume-module' ? '/build/resume.js' : null,
			},
			createTreeWalker: elementWalker,
		},
		FakeObserver,
		load,
	);
	const settle = () => new Promise((resolve) => setTimeout(resolve));
	return {
		root,
		top,
		bottom,
		observed,
		load,
		resumeContainerEvent,
		settle,
		intersect: (target: Host, isIntersecting = true) =>
			callback?.([{ target, isIntersecting }]),
	};
}

test('boot observes only visible hosts and fetches nothing before an intersection', () => {
	const f = boot();
	expect([...f.observed]).toEqual([f.top, f.bottom]);
	f.intersect(f.bottom, false);
	expect(f.load).not.toHaveBeenCalled();
	expect(f.root.__marklessDelegatedDispatch).toBeUndefined();
	expect(f.root.__marklessCensus).toBeUndefined();
});

test('the first intersection forwards the visible host once, with no gesture', async () => {
	const f = boot();
	f.intersect(f.top);
	f.intersect(f.top);
	await f.settle();
	expect(f.load).toHaveBeenCalledExactlyOnceWith('/build/resume.js');
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({
		root: f.root,
		event: { type: PROTOCOL_VISIBLE_EVENT_NAME, target: f.top, bubbles: false },
		element: f.top,
	});
	expect(f.root.__marklessDelegatedDispatch).toBeUndefined();
	expect([...f.observed]).toEqual([f.bottom]);
	expect((f.root.__mFired as WeakSet<Host>).has(f.top)).toBe(true);
});

// A wake-channel page starts one trigger group's runtime per host, so later hosts still forward; a full runtime ignores them and fires its own.
test('a runtime started by the forward keeps ownership of marking hosts fired', async () => {
	const f = boot({ startsRuntime: true });
	f.intersect(f.top);
	await f.settle();
	expect((f.root.__mFired as WeakSet<Host>).has(f.top)).toBe(false);
	expect(f.root.__marklessDelegatedDispatch).toBe(PROTOCOL_VISIBLE_EVENT_NAME);
	f.intersect(f.bottom);
	await f.settle();
	expect(f.resumeContainerEvent).toHaveBeenCalledTimes(2);
	expect((f.root.__mFired as WeakSet<Host>).has(f.bottom)).toBe(false);
	expect(f.observed.size).toBe(0);
});

test('a host the runtime already fired is not forwarded again', async () => {
	const f = boot();
	(f.root.__mFired as WeakSet<Host>).add(f.bottom);
	f.intersect(f.bottom);
	await f.settle();
	expect(f.load).not.toHaveBeenCalled();
});

function page(eventName: string) {
	return renderToString(
		{
			resumeModuleUrl: '/resume.js',
			renderSsr: () => ({
				html: '<p>reveal</p>',
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'p' }],
					events: [{ hostNodeId: 'h0', eventName, symbolIds: ['s'] }],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					branches: [],
					repeats: [],
					asyncBoundaries: [],
				},
			}),
		},
		{ executionLog: 'never' },
	);
}

test('only a page with a visible event ships the helper and its lane', async () => {
	// The served container shifts every locator by one: the page's index 1 is the container's 2.
	const lane = createInlineDeferTriggerSource('visible', [2]);
	const withVisible = await page(PROTOCOL_VISIBLE_EVENT_NAME);
	const clickOnly = await page('click');
	const resumer = (html: string) =>
		/<script data-async-resumer[^>]*>[\s\S]*?<\/script>/.exec(html)?.[0];
	expect(resumer(withVisible)).toContain(lane);
	expect(resumer(withVisible)?.replace(lane, '')).toBe(resumer(clickOnly));
	expect(clickOnly).not.toContain('IntersectionObserver');
	expect(clickOnly).not.toContain('__mDefer');
});
