import { expect, test, vi } from 'vitest';
import { marklessServer } from '../src/rolldown.ts';
import { callBuildStart, callTransform } from './helpers.ts';

// A server build externalizes `@markless/router`, so the resolver answers with
// the bare specifier and no module for it exists in this build. Loading that id
// is a build failure (`UNLOADABLE_DEPENDENCY`), and the link driver must never
// ask: the pass types the child as an external delegate and names no load.
test(
	'an externalized dependency is never loaded by the link driver',
	{ timeout: 120_000 },
	async () => {
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const load = vi.fn(async () => undefined);
		const resolve = vi.fn(async (specifier: string) =>
			specifier === '@markless/router'
				? { id: '@markless/router', external: true }
				: null,
		);
		const plugin = marklessServer();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			`import { Html } from '@markless/router';
export default function App() @{ <main><Html /></main> }`,
			parentFilename,
			{ resolve, load, getModuleInfo: vi.fn(() => undefined) },
		);

		// The child must actually have been linked, or the assertion below is vacuous.
		expect(resolve.mock.calls.map(([specifier]) => specifier)).toContain('@markless/router');
		expect(load.mock.calls).toEqual([]);
	},
);
