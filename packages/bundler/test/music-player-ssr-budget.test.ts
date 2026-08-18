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
// 62,722 -> 62,925 (interim 2026-08-06, owner-accepted cost class): +203 for mount-time served-arm record registration + the client residue-reader call site (browser-lane correctness fixes); covers both environments (CI 62,915, local macOS 62,923) plus ~2-byte gzip run variance; repayment stays with the runtime-stdlib shrink obligation. Was: +193 CI-measured for mount-time served-arm record registration + the client residue-reader call site (browser-lane correctness fixes); wall tracks CI actuals per the note above; repayment stays with the runtime-stdlib shrink obligation.
// 62,925 -> 62,940 (interim 2026-08-11): +13 local (62,938 measured post strict-everywhere landing 6b2134e9 + style-object lowering working tree), de-minimis auto-interim per proportionality order 2026-08-04; attribution not isolated between the two change sets - prime suspect is the composite functionSource extraction in collect-elements (touches all composite template expressions); T999 style-object audit owns confirming or repaying.
// 62,940 -> 64,390 (interim 2026-08-17, owner-accepted cost class, PR #23): +1,450 for derived-result reconciliation in the runtime graph (graph-reconcile.ts plus the write / read / async-publish hooks; path-granular computed invalidation). CI 64,369, local macOS 64,363-64,382; wall covers both environments plus gzip run variance. Repayment owed by the runtime-stdlib shrink obligation; the reconcile helper (~1.2 kB gzip on its own) is the first shrink candidate.
// 64,390 -> 63,090 (re-anchor 2026-08-18, per-app reconcile wiring): derived reconciliation is now installed per app, and this demo has no computed nodes, so its build carries neither the reconcile helper nor the installer. Measured 63,074 local macOS across 78 chunks; the wall keeps 16 B for gzip run variance (CI Linux has measured at or below local on every prior entry). This repays 1,300 of the 1,450 B PR #23 charged; the ~150 B left is the call-site residue inside the graph itself.
// 63,090 -> 63,109 (2026-08-18): CI (Linux) actual for the per-app reconcile plane; local macOS measured 63,074. Wall tracks CI actuals.
// 63,109 -> 63,112 (interim 2026-08-18, de-minimis gzip variance): local macOS measured 63,110 on main da8ce0a0 with no member-tag code in this demo's build; +3 B run variance, no cost class.
const MAX_SHIPPED_JS_GZIP_BYTES = 63_112;

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
