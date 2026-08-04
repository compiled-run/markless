import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callTransform } from './helpers.ts';

const childFilename = '/workspace/app/components/UpdateSummary.tsrx';
const parentFilename = '/workspace/app/pages/live-feed.tsrx';

const childSource = `
import { computed } from '@markless/core';

export function UpdateSummary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);
	<p data-weighted-count>Weighted count {weightedCount}</p>
}
`;

const parentSource = `
import { state } from '@markless/core';
import { UpdateSummary } from '../components/UpdateSummary.tsrx';

export default function LiveFeed() @{
	let weight = state(2);
	let updates = state([{ id: 'atlas' }, { id: 'beacon' }, { id: 'cedar' }]);
	<main>
		<button onClick={() => weight++}>Increase weight</button>
		<UpdateSummary updates={updates} weight={weight} />
	</main>
}
`;

test('dispatch linking reads source symbols without assigning claims to a non-emitting facade', async () => {
	const plugin = marklessClient({
		prerenderWakeChannel: true,
	} as Parameters<typeof marklessClient>[0]);
	const resolveImport = vi.fn(async (specifier: string) => {
		if (!specifier.startsWith('../components/UpdateSummary.tsrx')) return null;
		return { id: childFilename };
	});

	callBuildStart(plugin, { cwd: '/workspace/app' });
	// The resume transform owns this child's symbol claims. Once the wake entry
	// is known, the symbols-only sibling deliberately emits no claims.
	await callTransform(plugin, childSource, `${childFilename}?markless-resume`, {
		resolve: resolveImport,
	});
	await callTransform(plugin, childSource, `${childFilename}?markless-prerender-wake`, {
		resolve: resolveImport,
	});
	await callTransform(plugin, childSource, `${childFilename}?markless-symbols`, {
		resolve: resolveImport,
	});
	await callTransform(plugin, parentSource, `${parentFilename}?markless-prerender-wake`, {
		resolve: resolveImport,
	});
	const resolverId = `virtual:markless:resolver:${encodeURIComponent(parentFilename)}`;
	// The generated wake resolver owns the bound-child claims and routes. Read
	// that emitter before the ordinary resume facade refreshes the shared local
	// resolver view for its own direct claims.
	const wakeResolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
	expect(wakeResolverSource).toContain('bound:');
	expect(wakeResolverSource).toContain(encodeURIComponent(childFilename));
	const parent = (await callTransform(
		plugin,
		parentSource,
		`${parentFilename}?markless-resume`,
		{
		resolve: resolveImport,
		},
	)) as { readonly code: string };

	// The ordinary facade keeps direct routes for its local symbols and retains
	// the generated-resolver fallback established by the wake owner.
	expect(parent.code).toContain('if (symbolId === "symbol:0")');
	expect(parent.code).toContain('marklessSymbolResolverModule');
});

test('a data-only child facade cannot hide the symbol-emitting sibling from parent linking', async () => {
	const plugin = marklessClient({
		prerenderWakeChannel: true,
	} as Parameters<typeof marklessClient>[0]);
	const resolveImport = vi.fn(async (specifier: string) => {
		if (!specifier.startsWith('../components/UpdateSummary.tsrx')) return null;
		return { id: childFilename };
	});
	const loaded: string[] = [];

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, childSource, `${childFilename}?markless-render-data`, {
		resolve: resolveImport,
	});
	const first = (await callTransform(
		plugin,
		parentSource,
		`${parentFilename}?markless-resume`,
		{
			resolve: resolveImport,
			load: vi.fn(async ({ id }: { readonly id: string }) => {
				loaded.push(id);
			}),
		},
	)) as { readonly code: string };
	expect(first.code).not.toContain('marklessSymbolResolverModule');
	loaded.length = 0;
	const parent = (await callTransform(
		plugin,
		parentSource,
		`${parentFilename}?markless-resume`,
		{
			resolve: resolveImport,
			load: vi.fn(async ({ id }: { readonly id: string }) => {
				loaded.push(id);
				if (id === `${childFilename}?markless-symbols`) {
					await callTransform(plugin, childSource, id, { resolve: resolveImport });
				}
			}),
		},
	)) as { readonly code: string };

	expect(loaded).toContain(`${childFilename}?markless-symbols`);
	expect(parent.code).toContain('marklessSymbolResolverModule');
	const resolverId = `virtual:markless:resolver:${encodeURIComponent(parentFilename)}`;
	const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
	expect(resolverSource).toContain('bound:');
});
