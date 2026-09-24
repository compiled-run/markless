import { ASYNC_PROTOCOL_VERSION, PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import { expect, test, vi } from 'vitest';
import { createInlineResumerVisiblePrimerSource } from '../src/inline/resumer.ts';
import { renderToString } from '../src/render-to-string.ts';

type Host = { readonly name: string };
type Entry = { readonly target: Host; readonly isIntersecting: boolean };

const view = {
	locators: [
		{ hostNodeId: 'top', index: 1 },
		{ hostNodeId: 'press', index: 2 },
		{ hostNodeId: 'bottom', index: 3 },
	],
	events: [
		{ hostNodeId: 'top', eventName: PROTOCOL_VISIBLE_EVENT_NAME, symbolIds: ['a'] },
		{ hostNodeId: 'press', eventName: 'click', symbolIds: ['b'] },
		{ hostNodeId: 'bottom', eventName: PROTOCOL_VISIBLE_EVENT_NAME, symbolIds: ['c'] },
	],
};

function boot(options: { readonly startsRuntime?: boolean } = {}) {
	const [top, press, bottom] = [{ name: 'top' }, { name: 'press' }, { name: 'bottom' }];
	const root: Record<string, unknown> & { name: string } = {
		name: 'root',
		querySelector: (selector: string) =>
			selector === 'script[type="markless/view"]'
				? { textContent: JSON.stringify(view) }
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
	const walked = [top, press, bottom];
	const source = createInlineResumerVisiblePrimerSource('/build/resume.js')
		.replace('(url) => import(/* @vite-ignore */ url)', 'load')
		.slice(1);
	new Function('document', 'IntersectionObserver', 'load', source)(
		{
			currentScript: { closest: () => root, getAttribute: () => null },
			createTreeWalker: () => ({ nextNode: () => walked.shift() ?? null }),
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
});

test('the first intersection forwards the visible record once, with no gesture', async () => {
	const f = boot();
	f.intersect(f.top);
	f.intersect(f.top);
	await f.settle();
	expect(f.load).toHaveBeenCalledExactlyOnceWith('/build/resume.js');
	expect(f.resumeContainerEvent).toHaveBeenCalledExactlyOnceWith({
		root: f.root,
		event: { type: PROTOCOL_VISIBLE_EVENT_NAME, target: f.top },
		element: f.top,
		eventRecord: view.events[0],
	});
	expect(f.root.__marklessDelegatedDispatch).toBeUndefined();
	expect([...f.observed]).toEqual([f.bottom]);
	expect((f.root.__marklessVisibleFired as WeakSet<Host>).has(f.top)).toBe(true);
});

test('a runtime started by the forward keeps ownership of firing', async () => {
	const f = boot({ startsRuntime: true });
	f.intersect(f.top);
	await f.settle();
	expect((f.root.__marklessVisibleFired as WeakSet<Host>).has(f.top)).toBe(false);
	expect(f.root.__marklessDelegatedDispatch).toBe(PROTOCOL_VISIBLE_EVENT_NAME);
	f.intersect(f.bottom);
	await f.settle();
	expect(f.resumeContainerEvent).toHaveBeenCalledTimes(1);
	expect(f.observed.size).toBe(0);
});

test('a host the runtime already fired is not forwarded again', async () => {
	const f = boot();
	(f.root.__marklessVisibleFired as WeakSet<Host>).add(f.bottom);
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

test('only a page with a visible event ships the observer', async () => {
	const primer = createInlineResumerVisiblePrimerSource('/resume.js');
	const withVisible = await page(PROTOCOL_VISIBLE_EVENT_NAME);
	const clickOnly = await page('click');
	const resumer = (html: string) =>
		/<script data-async-resumer[^>]*>[\s\S]*?<\/script>/.exec(html)?.[0];
	expect(resumer(withVisible)).toContain(primer);
	expect(resumer(withVisible)?.replace(primer, '')).toBe(resumer(clickOnly));
	expect(clickOnly).not.toContain('IntersectionObserver');
});
