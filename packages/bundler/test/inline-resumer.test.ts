import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { EVENT_ONLY_RESUMER_TARGET_BYTES } from '../../../poc/fixtures/proofs/resumer-script/src/resumer-source.mjs';
import { compileInlineResumerSource, compileInlineResumerSources } from '../src/inline-resumer.ts';

test('Rolldown OXC deterministically minifies the typed event-only resumer', async () => {
	const options = { debug: false, executionLog: 'never' as const };
	const first = await compileInlineResumerSources(options);
	const second = await compileInlineResumerSources(options);

	expect(first).toEqual(second);
	expect(first.event).not.toContain('runInlineResumer');
	expect(first.event).not.toContain('__MARKLESS_INLINE_');
	expect(first.event).not.toContain('preventDefault');
	expect(first.event).not.toContain('__mxLog');
	expect(first.event).not.toContain('inline-resumer');
	expect(first.event).not.toContain('router-delegation');
	expect(first.event).not.toContain('MARKLESS_DEBUG_');
	expect(gzipSync(first.event, { level: 9 }).length).toBeLessThanOrEqual(
		EVENT_ONLY_RESUMER_TARGET_BYTES,
	);
});

test('Rolldown OXC includes debug registration only in debug variants', async () => {
	const source = await compileInlineResumerSource({
		debug: true,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: false,
	});

	expect(source).toContain('inline-resumer');
	expect(source).toContain('__MARKLESS_DEBUG__');
});

test('Rolldown OXC includes only the requested inline feature blocks', async () => {
	const event = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	const syncPolicy = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: true,
	});
	const graphPolicyOwner = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: true,
		sharedGraphPolicy: true,
		syncPolicy: true,
	});
	const graphPolicyConsumer = await compileInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: true,
		sharedGraphPolicy: false,
		syncPolicy: true,
	});

	expect(event).not.toContain('preventDefault');
	expect(syncPolicy).toContain('preventDefault');
	expect(syncPolicy).not.toContain('__marklessInlineSyncPolicy');
	expect(graphPolicyOwner).toContain('__marklessInlineSyncPolicy');
	expect(graphPolicyOwner.length).toBeGreaterThan(graphPolicyConsumer.length);
});
