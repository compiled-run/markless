import { afterEach, expect, test, vi } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { holdSubmit } from '../src/submit-hold.ts';

// The busy marks wait for the pass that paints the handler's first writes; with nothing pending they go on at once.
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const log: string[] = [];

function element() {
	const attributes = new Map<string, string>();
	return {
		attributes,
		setAttribute: (name: string, value: string) => void (attributes.set(name, value), log.push(`+${name}`)),
		removeAttribute: (name: string) => void (attributes.delete(name), log.push(`-${name}`)),
	};
}

afterEach(() => vi.unstubAllGlobals());

function parts() {
	vi.stubGlobal('addEventListener', () => {});
	log.length = 0;
	const form = element();
	const submitter = element();
	const hold = (painted?: Promise<void>) =>
		holdSubmit(form as unknown as HTMLFormElement, submitter as unknown as HTMLElement, 'sent', undefined, painted);
	const marks = () => [form.attributes.get('aria-busy'), submitter.attributes.get('aria-disabled')];
	return { hold, marks };
}

test('an idle graph with nothing pending: the marks go on before the task ends', async () => {
	const graph = createRuntimeGraph({ cells: [] });
	const { hold, marks } = parts();

	expect(graph.pendingFlush!()).toBeUndefined();
	hold(graph.pendingFlush!());
	await Promise.resolve();
	await Promise.resolve();

	expect(marks()).toEqual(['true', 'true']);
});

test('a held pass: the marks wait for it, and an end before it lands clears after them', async () => {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:sending', value: false }] });
	const { hold, marks } = parts();

	graph.write({ graphNodeId: 'state:sending', value: true });
	const release = graph.holdFlush!();
	const end = hold(graph.pendingFlush!());
	await macrotask();
	expect(log).toEqual([]);
	end();
	release();
	await macrotask();

	expect(log).toEqual(['+aria-busy', '+aria-disabled', '-aria-busy', '-aria-disabled']);
	expect(marks()).toEqual([undefined, undefined]);
});
