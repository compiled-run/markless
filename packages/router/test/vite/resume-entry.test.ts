import { readFileSync } from 'node:fs';
import { transformSync } from 'rolldown/experimental';
import { afterEach, expect, test, vi } from 'vitest';

type Input = { root: ParentNode; value?: unknown; event?: unknown };
type RouteModule = { resumeContainerEvent(input: Input): unknown };
type Loader = () => Promise<RouteModule>;

function entry(mdx: Record<string, Loader>, tsrx: Record<string, Loader> = {}) {
	const source = readFileSync(
		new URL('../../src/vite/entries/resume-entry.ts', import.meta.url),
		'utf8',
	);
	const code = transformSync('resume-entry.ts', source)
		.code.replaceAll('import.meta.glob', 'glob')
		.replaceAll('import.meta.env.DEV', 'false')
		.replace('export async function', 'async function');
	return new Function('glob', `${code}; return resumeContainerEvent;`)((pattern: string) =>
		pattern.endsWith('.mdx') ? mdx : tsrx,
	) as (input: Input) => Promise<void>;
}

function root(file: string) {
	const route = { file };
	return {
		route,
		element: {
			querySelector: () => ({ textContent: JSON.stringify(route) }),
		} as unknown as ParentNode,
	};
}

test.each(['mdx', 'tsrx'])(
	'reuses the %s module for concurrent and repeat events',
	async (extension) => {
		let resolve!: (module: RouteModule) => void;
		const load = vi.fn(
			() =>
				new Promise<RouteModule>((ready) => {
					resolve = ready;
				}),
		);
		const modules = { [`/pages/example.${extension}`]: load };
		const resume = extension === 'mdx' ? entry(modules) : entry({}, modules);
		const first = root(`pages/example.${extension}`);
		const second = root(`/pages/example.${extension}`);
		const handler = vi.fn();
		expect(load).not.toHaveBeenCalled();
		const pending = [
			resume({ root: first.element, value: 1 }),
			resume({ root: second.element, value: 2 }),
		];
		expect(load).toHaveBeenCalledTimes(1);
		resolve({ resumeContainerEvent: handler });
		await Promise.all(pending);
		await resume({ root: first.element, value: 3 });
		expect(load).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls.map(([input]) => input.value)).toEqual([1, 2, 3]);
		expect(handler.mock.calls.map(([input]) => input.root)).toEqual([
			first.element,
			second.element,
			first.element,
		]);
	},
);

test('retries a rejected route import and retains successful module loading after a handler error', async () => {
	const unavailable = new Error('route unavailable');
	const handlerError = new Error('handler failed');
	const handler = vi.fn().mockRejectedValueOnce(handlerError).mockResolvedValue(undefined);
	const load = vi
		.fn<Loader>()
		.mockRejectedValueOnce(unavailable)
		.mockResolvedValue({ resumeContainerEvent: handler });
	const resume = entry({ '/pages/retry.mdx': load });
	const input = { root: root('pages/retry.mdx').element };
	const failures = await Promise.allSettled([resume(input), resume(input)]);
	expect(failures).toEqual([
		{ status: 'rejected', reason: unavailable },
		{ status: 'rejected', reason: unavailable },
	]);
	expect(load).toHaveBeenCalledTimes(1);
	await expect(resume(input)).rejects.toBe(handlerError);
	await resume(input);
	expect(load).toHaveBeenCalledTimes(2);
	expect(handler).toHaveBeenCalledTimes(2);
});

test('reads the current route on navigation without retaining an old route handler', async () => {
	const firstHandler = vi.fn();
	const secondHandler = vi.fn();
	const firstLoad = vi.fn<Loader>().mockResolvedValue({ resumeContainerEvent: firstHandler });
	const secondLoad = vi.fn<Loader>().mockResolvedValue({ resumeContainerEvent: secondHandler });
	const resume = entry({ '/pages/first.mdx': firstLoad }, { '/pages/second.tsrx': secondLoad });
	const current = root('pages/first.mdx');
	await resume({ root: current.element, value: 1 });
	current.route.file = 'pages/second.tsrx';
	await resume({ root: current.element, value: 2 });
	current.route.file = 'pages/first.mdx';
	await resume({ root: current.element, value: 3 });
	expect(firstLoad).toHaveBeenCalledTimes(1);
	expect(secondLoad).toHaveBeenCalledTimes(1);
	expect(firstHandler.mock.calls.map(([input]) => input.value)).toEqual([1, 3]);
	expect(secondHandler.mock.calls.map(([input]) => input.value)).toEqual([2]);
});

afterEach(() => vi.unstubAllGlobals());

function stubPage() {
	const reload = vi.fn();
	vi.stubGlobal('location', { reload });
	vi.stubGlobal('sessionStorage', {});
	return reload;
}

test('a click whose route chunk a deploy removed loads the page again once per failing chunk', async () => {
	const reload = stubPage();
	const gone = new TypeError('Failed to fetch dynamically imported module: /build/chunk-a.js');
	const load = vi.fn<Loader>().mockRejectedValue(gone);
	const resume = entry({ '/pages/gone.mdx': load });
	const page = root('pages/gone.mdx').element;

	// A wake or hover prime without a gesture never reloads.
	await expect(resume({ root: page, event: 0 })).rejects.toBe(gone);
	expect(reload).not.toHaveBeenCalled();
	await expect(resume({ root: page, event: { type: 'click' } })).resolves.toBeUndefined();
	expect(reload).toHaveBeenCalledTimes(1);
	// The same chunk failing again after that reload surfaces instead of looping.
	await expect(resume({ root: page, event: { type: 'click' } })).rejects.toBe(gone);
	expect(reload).toHaveBeenCalledTimes(1);

	const webkitGone = new TypeError('Importing a module script failed.');
	load.mockRejectedValue(webkitGone);
	await expect(resume({ root: page, event: { type: 'click' } })).resolves.toBeUndefined();
	expect(reload).toHaveBeenCalledTimes(2);
});

test('a handler error or a handler chunk failure is judged the same way as the route chunk', async () => {
	const reload = stubPage();
	const handlerError = new Error('handler failed');
	const gone = new TypeError('Failed to fetch dynamically imported module: /build/chunk-b.js');
	const handler = vi.fn().mockRejectedValueOnce(handlerError).mockRejectedValueOnce(gone);
	const resume = entry({ '/pages/ok.mdx': async () => ({ resumeContainerEvent: handler }) });
	const page = root('pages/ok.mdx').element;
	await expect(resume({ root: page, event: { type: 'click' } })).rejects.toBe(handlerError);
	expect(reload).not.toHaveBeenCalled();
	await resume({ root: page, event: { type: 'click' } });
	expect(reload).toHaveBeenCalledTimes(1);
});
