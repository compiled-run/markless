import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveAsyncComputedDemand } from '../dist/derive.mjs';
import * as compiled from '../dist/route-b-artifact.mjs';
import { createDestinationPrestart } from '../dist/prefetch.mjs';

const { protocolState, protocolView } = compiled;

test('compiled boundary reads derive a registry-backed transitive async closure', () => {
	const result = deriveAsyncComputedDemand(protocolState, protocolView);
	assert.ok(
		result.asyncComputedIds.length > 0,
		'the compiled destination must demand async data',
	);
	assert.equal(
		result.asyncComputedIds.length,
		Object.keys(protocolView.asyncRunners).length,
		'every compiler-emitted async runner in this destination must be demanded',
	);
	assert.ok(
		protocolState.computed.some(
			(computed) =>
				computed.async === false &&
				computed.dependencies?.some((dependency) =>
					result.asyncComputedIds.includes(dependency.graphNodeId),
				),
		),
		'the fixture must retain its sync-computed dependency hop',
	);
});

test('derivation fails closed when the compiled runner registry loses a demanded entry', () => {
	const first = Object.keys(protocolView.asyncRunners)[0];
	const damagedView = {
		...protocolView,
		asyncRunners: Object.fromEntries(
			Object.entries(protocolView.asyncRunners).filter(
				([graphNodeId]) => graphNodeId !== first,
			),
		),
	};
	assert.throws(
		() => deriveAsyncComputedDemand(protocolState, damagedView),
		/no entry in protocolView\.asyncRunners/,
	);
});

test('the graph shim executes emitted runners across the sync-computed hop', async () => {
	const originalFetch = globalThis.fetch;
	const arrivals = [];
	let releaseSession;
	const sessionGate = new Promise((resolve) => {
		releaseSession = resolve;
	});
	globalThis.__navIntentRun = 'static-proof';
	globalThis.fetch = async (input) => {
		const url = new URL(input, 'http://proof.local');
		arrivals.push(url.pathname);
		if (url.pathname === '/api/session') await sessionGate;
		const value =
			url.pathname === '/api/session'
				? { user: 'ada' }
				: url.pathname === '/api/recommendations'
					? { items: ['Signals', 'Compilers'] }
					: { title: 'Markless Handbook' };
		return { json: async () => value };
	};
	try {
		const controller = createDestinationPrestart(compiled);
		await waitUntil(() => arrivals.length === 2);
		assert.deepEqual(new Set(arrivals), new Set(['/api/session', '/api/catalog']));
		releaseSession();
		await controller.allStarted;
		await controller.settled;
		assert.equal(arrivals.at(-1), '/api/recommendations');
		assert.equal(controller.value('computed:recommendations').items[0], 'Signals');
	} finally {
		globalThis.fetch = originalFetch;
		delete globalThis.__navIntentRun;
	}
});

async function waitUntil(predicate) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error('Timed out waiting for emitted runner execution');
}
