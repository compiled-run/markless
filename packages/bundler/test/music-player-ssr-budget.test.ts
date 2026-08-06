import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player-ssr');
const clientBuild = resolve(demo, '.output/public/build');

// Production `executionLog: never` measurement: 62,464 B across 76 distinct
// size-map chunks; 62,500 B is the permanent shipped wall (owner ratification
// 2026-07-12, T006), leaving 36 B / 0.06% headroom. Tighten only.
// 62,500 -> 62,520 (owner receipt 2026-07-12): lost-click window fix, measured 62,514.
// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack. CI (Linux) emits slightly larger bytes than local macOS; wall tracks CI actuals.
// 62,657 -> 62,722 (interim 2026-08-05): +65 for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into T013's mp-ssr obligations.
// 62,722 -> 62,915 (interim 2026-08-06, owner-accepted cost class): +193 CI-measured for mount-time served-arm record registration + the client residue-reader call site (browser-lane correctness fixes); wall tracks CI actuals per the note above; repayment stays with the runtime-stdlib shrink obligation.
const MAX_SHIPPED_JS_GZIP_BYTES = 62_915;

test('music-player-ssr production build stays within its shipped JS budget', async () => {
	await rm(resolve(demo, '.output'), { force: true, recursive: true });
	// Consumer posture: the wall measures the 'never' build even though the
	// demo's default build keeps the lab instrument (owner rulings 2026-07-12).
	await execPnpm(['--dir', demo, 'build'], { MARKLESS_CONSUMER_BUILD: '1' });

	const sizes = JSON.parse(
		await readFile(resolve(clientBuild, 'execution-sizes.json'), 'utf8'),
	) as Record<string, { readonly chunk?: string; readonly instrument?: true }>;
	const chunkNames = [
		...new Set(
			Object.values(sizes)
				.map((entry) => entry.chunk)
				.filter(isString),
		),
	].sort();
	const compressedChunks = await Promise.all(
		chunkNames.map(async (fileName) =>
			gzipSync(await readFile(resolve(clientBuild, fileName)), { level: 9 }),
		),
	);
	const gzipBytes = compressedChunks.reduce((total, chunk) => total + chunk.length, 0);

	expect(chunkNames.length, 'production build must emit client JS chunks').toBeGreaterThan(0);
	expect(
		Object.values(sizes).filter((entry) => entry.instrument),
		'production build must keep execution instrumentation stripped',
	).toEqual([]);
	expect(
		gzipBytes,
		`production shipped JS: ${gzipBytes} gzip bytes across ${chunkNames.length} distinct chunks`,
	).toBeLessThanOrEqual(MAX_SHIPPED_JS_GZIP_BYTES);
}, 120_000);

async function execPnpm(args: string[], env: Record<string, string> = {}): Promise<void> {
	try {
		await exec('pnpm', args, { cwd: root, env: { ...process.env, ...env } });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}

function isString(value: string | undefined): value is string {
	return value !== undefined;
}
