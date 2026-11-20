import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { readSlots } from './unit-budget.mjs';

const dir = mkdtempSync(join(tmpdir(), 'build-slots-dir-'));
const before = process.env.MARKLESS_BUILD_SLOTS_DIR;

afterEach(() => {
	if (before === undefined) delete process.env.MARKLESS_BUILD_SLOTS_DIR;
	else process.env.MARKLESS_BUILD_SLOTS_DIR = before;
	vi.resetModules();
	rmSync(dir, { recursive: true, force: true });
});

test('build slots live in MARKLESS_BUILD_SLOTS_DIR when it is set, recording the holder', async () => {
	process.env.MARKLESS_BUILD_SLOTS_DIR = join(dir, 'slots');
	vi.resetModules();
	const { holdBuildSlot } = await import('../../packages/router/test/support/build-slots.ts');
	const release = await holdBuildSlot();
	const reading = readSlots(join(dir, 'slots'), new Map([[process.pid, 'this.test.ts']]));
	expect(reading).toEqual({ holding: new Set(['this.test.ts']), wholeFile: true });
	await release();
	expect(readSlots(join(dir, 'slots'), new Map()).wholeFile).toBe(false);
});
