import { expect, test } from 'vitest';
import {
	deferralPays,
	estimatedGzipKb,
	frameworkSplitPays,
	lazySiblingPays,
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

test('cuts a lazy sibling only when the pages it speeds up outweigh the file every loader pays for', () => {
	const file = PACK_COST_MODEL.lazySiblingOverheadGzipKb;
	const floor = PACK_COST_MODEL.minDeferredGzipKb;
	const large = Math.max(file, floor) * 8;
	expect(lazySiblingPays({ gzipKb: large, loadersSpedUp: 1, loaders: 4 })).toBe(true);
	expect(lazySiblingPays({ gzipKb: large, loadersSpedUp: 0, loaders: 4 })).toBe(false);
	// Too small for a file of its own, or paid by more pages than it helps.
	expect(lazySiblingPays({ gzipKb: floor / 2, loadersSpedUp: 4, loaders: 4 })).toBe(false);
	expect(lazySiblingPays({ gzipKb: file * 1.5, loadersSpedUp: 1, loaders: 4 })).toBe(false);
});

test('splits app code from framework code only when each half is worth a file of its own', () => {
	const floor = PACK_COST_MODEL.minDeferredGzipKb;
	expect(frameworkSplitPays({ appGzipKb: floor, frameworkGzipKb: floor * 20 })).toBe(true);
	expect(frameworkSplitPays({ appGzipKb: floor / 2, frameworkGzipKb: floor * 20 })).toBe(false);
	expect(frameworkSplitPays({ appGzipKb: floor * 20, frameworkGzipKb: floor / 2 })).toBe(false);
});
