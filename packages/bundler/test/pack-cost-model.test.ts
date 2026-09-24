import { expect, test } from 'vitest';
import {
	deferralPays,
	estimatedGzipKb,
	mergeIntoWiderPack,
	PACK_COST_MODEL,
} from '../src/build/pack-cost-model.ts';

test('a serial round costs more than any parallel request', () => {
	expect(PACK_COST_MODEL.roundMs).toBeGreaterThan(PACK_COST_MODEL.parallelRequestMs * 100);
	expect(PACK_COST_MODEL.bootMsPerGzipKb).toBeGreaterThanOrEqual(
		PACK_COST_MODEL.interactionMsPerGzipKb,
	);
});

test('merges a group into a wider pack only when the bytes others pay undercut the file it saves', () => {
	const msPerGzipKb = PACK_COST_MODEL.bootMsPerGzipKb;
	const tiny = PACK_COST_MODEL.fileOverheadGzipKb / 4;
	const large = PACK_COST_MODEL.fileOverheadGzipKb * 4;
	expect(
		mergeIntoWiderPack({ gzipKb: tiny, loadersNeeding: 2, loadersNotNeeding: 1, msPerGzipKb }),
	).toBe(true);
	expect(
		mergeIntoWiderPack({ gzipKb: large, loadersNeeding: 2, loadersNotNeeding: 1, msPerGzipKb }),
	).toBe(false);
	// Needed by every loader: nobody pays extra bytes, so it always merges.
	expect(
		mergeIntoWiderPack({ gzipKb: large, loadersNeeding: 3, loadersNotNeeding: 0, msPerGzipKb }),
	).toBe(true);
});

test('defers code only when it moves more than the deferred-pack floor off the boot path', () => {
	const floor = PACK_COST_MODEL.minDeferredGzipKb;
	expect(deferralPays(floor)).toBe(true);
	expect(deferralPays(floor / 2)).toBe(false);
	const sourceForFloor = (floor * 1024) / PACK_COST_MODEL.sourceGzipRatio;
	expect(estimatedGzipKb(sourceForFloor)).toBeCloseTo(floor);
});
