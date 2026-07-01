import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { extractSyncEventPolicies } from '../src/index.ts';

function normalizeSource(source: string): string {
	return source.replace(/\s+/g, ' ').trim();
}

function expectPolicy(
	policies: Awaited<ReturnType<typeof extractSyncEventPolicies>>['syncPolicies'],
	expected: {
		readonly eventName: string;
		readonly guardIncludes: string;
		readonly methods: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
		readonly graphReads: ReadonlyArray<string>;
		readonly eventReads: ReadonlyArray<string>;
		readonly lazyWriteTargets: ReadonlyArray<string>;
	},
): void {
	const policy = policies.find(
		(candidate) =>
			candidate.eventName === expected.eventName &&
			normalizeSource(candidate.guardSource).includes(expected.guardIncludes),
	);

	expect(policy, `sync policy should include guard ${expected.guardIncludes}`).toBeDefined();
	expect(policy?.methods).toEqual(expected.methods);
	expect(policy?.graphReads).toEqual(expect.arrayContaining(expected.graphReads));
	expect(policy?.eventReads).toEqual(expect.arrayContaining(expected.eventReads));
	expect(policy?.lazyWriteTargets).toEqual(expect.arrayContaining(expected.lazyWriteTargets));
	expect(policy?.span?.start).toEqual(expect.any(Number));
	expect(policy?.span?.end).toEqual(expect.any(Number));
}

test('sync-event-policy extraction proves sync browser policy split', async () => {
	const fixturePath = 'fixtures/proofs/sync-event-policy/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const artifact = await extractSyncEventPolicies({
		filename: fixturePath,
		source,
	});

	expect(artifact.passId).toBe('sync-event-policy');
	expect(artifact.filename).toBe(fixturePath);

	expectPolicy(artifact.syncPolicies, {
		eventName: 'keydown',
		guardIncludes: 'menu.open && event.key === "Escape"',
		methods: ['preventDefault', 'stopPropagation'],
		graphReads: ['menu.open'],
		eventReads: ['event.key'],
		lazyWriteTargets: ['menu.open', 'menu.lastAction'],
	});

	expectPolicy(artifact.syncPolicies, {
		eventName: 'keydown',
		guardIncludes:
			'shortcuts.trapArrows && (event.key === "ArrowDown" || event.key === "ArrowUp")',
		methods: ['preventDefault'],
		graphReads: ['shortcuts.trapArrows'],
		eventReads: ['event.key'],
		lazyWriteTargets: ['menu.activeIndex', 'menu.lastAction'],
	});

	const keydownHandler = artifact.eventHandlers.find(
		(handler) => handler.eventName === 'keydown',
	);
	expect(keydownHandler?.lazyWrites.map((write) => write.target)).toEqual(
		expect.arrayContaining(['menu.open', 'menu.activeIndex', 'menu.lastAction']),
	);

	const diagnostic = artifact.diagnostics.find(
		(candidate) =>
			candidate.code === 'MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD' &&
			candidate.eventName === 'submit',
	);

	expect(diagnostic).toMatchObject({
		code: 'MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD',
		severity: 'error',
		phase: 'sync-event-policy',
		passId: 'sync-event-policy',
		method: 'preventDefault',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNPROVABLE_GUARD',
	});
	expect(normalizeSource(diagnostic?.guardSource ?? '')).toContain(
		'!shortcuts.allowSubmit && values.get("confirm") !== "yes"',
	);
	expect(diagnostic?.unsupportedReads).toEqual(
		expect.arrayContaining(['values.get', 'FormData', 'event.currentTarget']),
	);
	expect(diagnostic?.primarySpan?.start).toEqual(expect.any(Number));
	expect(diagnostic?.suggestions.length).toBeGreaterThan(0);
});
