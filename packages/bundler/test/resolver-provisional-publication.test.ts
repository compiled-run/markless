import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callResolveId, callTransform } from './helpers.ts';

// The first pass publishes every generated artifact of a page, and several of
// them (resume, wake, boundary symbols) import the page's resolver. Rolldown
// resolves those imports the moment it loads one, which can be while the page
// is still linking its children.
test('a resolver id resolves while its owner is still linking, and its load serves the final publication', async () => {
	const plugin = marklessClient();
	const pageFilename = '/workspace/app/pages/live-feed.tsrx';
	const childFilename = '/workspace/app/components/UpdateSummary.tsrx';
	const childSource = `import { computed } from '@markless/core';
export function UpdateSummary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);
	<p data-weighted-count>Weighted count {weightedCount}</p>
}`;
	const pageSource = `import { state } from '@markless/core';
import { UpdateSummary } from '../components/UpdateSummary.tsrx';
export default function LiveFeed() @{
	let weight = state(2);
	let updates = state([{ id: 'atlas' }, { id: 'beacon' }, { id: 'cedar' }]);
	<main><UpdateSummary updates={updates} weight={weight} /></main>
}`;
	const resolverId = `virtual:markless:resolver:${encodeURIComponent(pageFilename)}`;
	const resumeId = `virtual:markless:resume:${encodeURIComponent(pageFilename)}`;
	const resolveImport = vi.fn(async (specifier: string) =>
		specifier === '../components/UpdateSummary.tsrx' ? { id: childFilename } : null,
	);
	let resolvedWhileLinking: unknown;
	let loadedWhileLinking: Promise<unknown> | undefined;
	const load = vi.fn(async ({ id }: { id: string }) => {
		if (resolvedWhileLinking === undefined) {
			resolvedWhileLinking = await callResolveId(plugin, resolverId, `\0${resumeId}`);
			loadedWhileLinking = callLoad(plugin, `\0${resolverId}`);
		}
		await callTransform(plugin, childSource, id, { resolve: resolveImport, load });
		return { id };
	});

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, pageSource, pageFilename, { resolve: resolveImport, load });

	expect(load).toHaveBeenCalled();
	expect(resolvedWhileLinking).toEqual(expect.objectContaining({ id: `\0${resolverId}` }));
	const finalSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
	expect(finalSource).toContain('bound:');
	expect(finalSource).toContain(encodeURIComponent(childFilename));
	expect(await loadedWhileLinking).toBe(finalSource);
});

test('a resolver whose owner never published a final compile is refused, not served provisionally', async () => {
	const plugin = marklessClient();
	const pageFilename = '/workspace/app/pages/broken-feed.tsrx';
	const childFilename = '/workspace/app/components/Missing.tsrx';
	const pageSource = `import { Missing } from '../components/Missing.tsrx';
export default function BrokenFeed() @{ <main><Missing /></main> }`;
	const resolverId = `virtual:markless:resolver:${encodeURIComponent(pageFilename)}`;
	const resolveImport = vi.fn(async (specifier: string) =>
		specifier === '../components/Missing.tsrx' ? { id: childFilename } : null,
	);
	const load = vi.fn(async () => {
		throw new Error('CHILD_LOAD_FAILED');
	});

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await expect(
		callTransform(plugin, pageSource, pageFilename, { resolve: resolveImport, load }),
	).rejects.toThrow('CHILD_LOAD_FAILED');

	expect(await callResolveId(plugin, resolverId)).toEqual(
		expect.objectContaining({ id: `\0${resolverId}` }),
	);
	await expect(callLoad(plugin, `\0${resolverId}`)).rejects.toThrow(
		'MARKLESS_RESOLVER_UNPUBLISHED',
	);
});
