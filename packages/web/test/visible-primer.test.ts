import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
	PROTOCOL_VISIBLE_EVENT_NAME,
} from '@markless/serializer';
import { afterEach, expect, test, vi } from 'vitest';
import { createInlineDeferTriggerSource, INLINE_DEFER_LOADER_SOURCE } from '../src/inline/defer.ts';
import { renderToString } from '../src/render-to-string.ts';

type Host = { readonly name: string; readonly getAttribute: (name: string) => string | null };

const host = (name: string, entries: string | null): Host => ({
	name,
	getAttribute: (attribute) => (attribute === PROTOCOL_EVENT_HOST_ATTRIBUTE ? entries : null),
});

// The attribute selectors the helper queries, matched against fake hosts in DOM order.
const queryHosts = (hosts: readonly Host[], selector: string) =>
	hosts.filter((candidate) =>
		selector.split(',').some((part) => {
			const [, attribute, operator, value] = /^\[(.+?)(\^=|\*=|=)?(?:"(.*)")?\]$/.exec(part)!;
			const actual = candidate.getAttribute(attribute!.replaceAll('\\', ''));
			if (actual === null) return false;
			if (operator === '^=') return actual.startsWith(value!);
			if (operator === '*=') return actual.includes(value!);
			return operator ? actual === value : true;
		}),
	);

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

// The visible lane of the shared deferred-trigger helper over a page whose first and last elements
// host a visible record, the last one after another entry.
function boot(options: { readonly startsRuntime?: boolean; readonly servedCount?: number } = {}) {
	const top = host('top', `${PROTOCOL_VISIBLE_EVENT_NAME}:0`);
	const press = host('press', 'click:1');
	const bottom = host('bottom', `click:2;${PROTOCOL_VISIBLE_EVENT_NAME}:3`);
	const root: Record<string, unknown> & { name: string } = {
		name: 'root',
		getElementsByTagName: () => [top, press, bottom],
		querySelectorAll: (selector: string) => queryHosts([top, press, bottom], selector),
		getAttribute: (name: string) =>
			name === PROTOCOL_LOCATOR_PATHS_ATTRIBUTE && options.servedCount !== undefined
				? String(options.servedCount)
				: null,
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
	const source = createInlineDeferTriggerSource('visible', false)
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
		press,
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
	expect(f.root.__marklessCensus).toEqual([f.root, f.top, f.press, f.bottom]);
	expect(f.root.__marklessShifted).toBeUndefined();
});

test('the first claim marks the census shifted when it no longer matches the served count', async () => {
	const f = boot({ servedCount: 3 });
	f.intersect(f.top);
	await f.settle();
	expect(f.root.__marklessCensus).toHaveLength(4);
	expect(f.root.__marklessShifted).toBe(1);
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
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'p' }],
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
	const lane = createInlineDeferTriggerSource('visible', false);
	const withVisible = await page(PROTOCOL_VISIBLE_EVENT_NAME);
	const clickOnly = await page('click');
	const resumer = (html: string) =>
		/<script data-async-resumer[^>]*>[\s\S]*?<\/script>/.exec(html)?.[0];
	const listened = (eventNames: string[]) => JSON.stringify([eventNames, [], 0]);
	expect(withVisible).toContain(
		`<p ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="${PROTOCOL_VISIBLE_EVENT_NAME}:0">`,
	);
	expect(clickOnly).toContain(`<p ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="click:0">`);
	expect(resumer(withVisible)).toContain(lane);
	// The visible record is the lane's alone: the boot listens for no event on its behalf.
	expect(resumer(withVisible)?.replace(lane, '')).toBe(
		resumer(clickOnly)?.replace(listened(['click']), listened([])),
	);
	expect(clickOnly).not.toContain('IntersectionObserver');
	expect(clickOnly).not.toContain('__mDefer');
});
