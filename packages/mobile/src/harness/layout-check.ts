// `--layout-check`: after a styled rung's flow, every styled page is opened again with the host's layout dump on, and every box
// the phone drew is compared with the box the phone's own browser lays the same page out at (Dragon's markless:native-check),
// in each orientation asked for. A box more than 1 device px off fails the rung.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { dragonDir } from '../style-export.ts';
import { exec } from './exec.ts';
import { ANDROID_SHELL_ACTIVITY, PROOF_APP_ID } from './proof-app.ts';

export const LAYOUT_ORIENTATIONS = ['portrait', 'landscape'] as const;
export type LayoutOrientation = (typeof LAYOUT_ORIENTATIONS)[number];

export type LayoutCheckPage = {
	readonly page: string;
	readonly orientation: string;
	readonly line: string;
	readonly passed: boolean;
};

/** A rung's styled pages: its one style input, or one per page of an app, each with the route that opens it. */
export function styledPages(rungDir: string): ReadonlyArray<{ readonly input: string; readonly route: string | null; readonly page: string }> {
	const single = join(rungDir, 'native-style-input.json');
	if (existsSync(single)) return [{ input: single, route: null, page: 'App' }];
	const dir = join(rungDir, 'native-style-input');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.endsWith('.json') && !file.includes('.sheet'))
		.sort()
		.map((file) => {
			const page = basename(file, '.json');
			return { input: join(dir, file), route: page === 'index' ? '/' : `/${page}`, page };
		});
}

async function setOrientation(device: string, orientation: LayoutOrientation, work: string) {
	const flow = join(work, `orientation-${orientation}.yaml`);
	writeFileSync(
		flow,
		`appId: ${PROOF_APP_ID}\n---\n- setOrientation: ${orientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE_LEFT'}\n`,
	);
	await exec('maestro', ['--device', device, 'test', flow], { timeoutMs: 180_000 });
	await sleep(2_000);
}

/** Waits for a dump of the page that stops changing, and that differs from `before` when one is given (after a rotation). */
async function settledDump(
	read: () => Promise<string | null>,
	component: string,
	to: string,
	before: string | null,
): Promise<string> {
	let last = '';
	for (let tries = 0; tries < 60; tries++) {
		await sleep(500);
		const text = await read();
		if (text === null) continue;
		const dump = JSON.parse(text) as { component: string; viewport: unknown };
		const moved = before === null || JSON.stringify(dump.viewport) !== JSON.stringify((JSON.parse(before) as { viewport: unknown }).viewport);
		if (text === last && dump.component === component && moved) {
			writeFileSync(to, text);
			return text;
		}
		last = text;
	}
	throw new Error(`${component}: the app wrote no settled layout dump of this page within 30 s`);
}

/**
 * iOS: each styled page of the rung against Safari on the same simulator: opened in the first orientation, then the running app
 * is rotated to each next one (so the page lays out again live, as after a user's rotation) and compared again.
 */
export async function iosLayoutCheck(
	udid: string,
	rungDir: string,
	orientations: ReadonlyArray<LayoutOrientation>,
	work: string,
): Promise<LayoutCheckPage[]> {
	const out: LayoutCheckPage[] = [];
	const reports = join(rungDir, 'native-layout-check');
	mkdirSync(reports, { recursive: true });
	mkdirSync(work, { recursive: true });
	for (const { input, route, page } of styledPages(rungDir)) {
		const component = (JSON.parse(readFileSync(input, 'utf8')) as { component: string }).component;
		await setOrientation(udid, orientations[0]!, work);
		await exec('xcrun', ['simctl', 'terminate', udid, PROOF_APP_ID], { allowFailure: true });
		const container = (await exec('xcrun', ['simctl', 'get_app_container', udid, PROOF_APP_ID, 'data'])).stdout.trim();
		const file = join(container, 'Documents', 'markless-layout.json');
		rmSync(file, { force: true });
		const pidOf = (launched: string) => launched.trim().split(': ').pop();
		const pid = pidOf((await exec('xcrun', ['simctl', 'launch', udid, PROOF_APP_ID, '-markless-layout-dump', ...(route ? ['-route', route] : [])])).stdout);
		let before: string | null = null;
		for (const [step, orientation] of orientations.entries()) {
			if (step > 0) {
				// The check before opened Safari over the app: the app comes back to the front (the same process), then rotates.
				const again = pidOf((await exec('xcrun', ['simctl', 'launch', udid, PROOF_APP_ID])).stdout);
				if (again !== pid) throw new Error(`${page}: the app restarted (process ${pid}, now ${again}) instead of coming back to the front`);
				await sleep(1_000);
				await setOrientation(udid, orientation, work);
			}
			const dump = join(work, `${page}.${step}-${orientation}.dump.json`);
			const report = join(reports, `${page}.ios.${step}-${orientation}.json`);
			const read = async () => (existsSync(file) ? readFileSync(file, 'utf8') : null);
			const checked = await nativeCheck(input, dump, report, ['--ios', udid], async () => {
				before = await settledDump(read, component, dump, before);
			});
			out.push({ page, orientation: `${step > 0 ? 'rotated to ' : ''}${orientation}`, ...checked });
		}
	}
	await setOrientation(udid, 'portrait', work);
	return out;
}

/** Dragon's markless:native-check of one dump, once `settle` has written it: its summary line, or the end of its error. */
async function nativeCheck(
	input: string,
	dump: string,
	report: string,
	device: ReadonlyArray<string>,
	settle: () => Promise<void>,
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ line: string; passed: boolean }> {
	try {
		await settle();
		const line = execFileSync('pnpm', ['--silent', '--dir', dragonDir(), 'run', 'markless:native-check', '--', input, dump, report, ...device], {
			encoding: 'utf8',
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
		return { line, passed: true };
	} catch (error) {
		const failed = error as { stdout?: string; stderr?: string; message: string };
		const line = [failed.stdout, failed.stderr].filter(Boolean).join('\n').trim().split('\n').filter((l) => !l.startsWith('    at ')).slice(-3).join(' ') || failed.message;
		return { line, passed: false };
	}
}

/**
 * Android: each styled page of the rung against Chrome on the same emulator, as [iosLayoutCheck] does: opened in the first
 * orientation, then the running app is brought back over Chrome (the same process and activity) and rotated to each next one.
 */
export async function androidLayoutCheck(
	adb: string,
	serial: string,
	rungDir: string,
	orientations: ReadonlyArray<LayoutOrientation>,
	work: string,
): Promise<LayoutCheckPage[]> {
	const shell = (...args: string[]) => exec(adb, ['-s', serial, 'shell', ...args], { allowFailure: true, timeoutMs: 60_000 });
	// A tablet whose natural orientation is landscape is portrait at a quarter turn.
	const size = /(\d+)x(\d+)/.exec((await shell('wm', 'size')).stdout);
	const naturalLandscape = size !== null && Number(size[1]) > Number(size[2]);
	const rotate = async (orientation: LayoutOrientation) => {
		await shell('settings', 'put', 'system', 'accelerometer_rotation', '0');
		await shell('settings', 'put', 'system', 'user_rotation', (orientation === 'portrait') === naturalLandscape ? '1' : '0');
		await sleep(2_000);
	};
	const pidOf = async () => (await shell('pidof', PROOF_APP_ID)).stdout.trim();
	const activity = `${PROOF_APP_ID}/${ANDROID_SHELL_ACTIVITY}`;
	const file = `/sdcard/Android/data/${PROOF_APP_ID}/files/markless-layout.json`;
	const read = async () => {
		const result = await shell('cat', file);
		return result.code === 0 && result.stdout.trim() !== '' ? result.stdout : null;
	};
	const out: LayoutCheckPage[] = [];
	const reports = join(rungDir, 'native-layout-check');
	mkdirSync(reports, { recursive: true });
	mkdirSync(work, { recursive: true });
	for (const { input, route, page } of styledPages(rungDir)) {
		const component = (JSON.parse(readFileSync(input, 'utf8')) as { component: string }).component;
		await rotate(orientations[0]!);
		await shell('am', 'force-stop', PROOF_APP_ID);
		await shell('rm', '-f', file);
		await exec(adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n', activity, '--ez', 'markless-layout-dump', 'true', ...(route ? ['--es', 'route', route] : [])]);
		await sleep(1_000);
		const pid = await pidOf();
		if (pid === '') throw new Error(`${page}: the app is not running after its launch`);
		let before: string | null = null;
		for (const [step, orientation] of orientations.entries()) {
			if (step > 0) {
				// The check before opened Chrome over the app: the app's task comes back to the front, its top activity kept, then rotates.
				await exec(adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n', activity, '-f', '0x30000000']);
				const again = await pidOf();
				if (again !== pid) throw new Error(`${page}: the app restarted (process ${pid}, now ${again}) instead of coming back to the front`);
				await sleep(1_000);
				await rotate(orientation);
			}
			const dump = join(work, `${page}.${step}-${orientation}.dump.json`);
			const report = join(reports, `${page}.android.${step}-${orientation}.json`);
			const checked = await nativeCheck(input, dump, report, ['--android', serial], async () => {
				before = await settledDump(read, component, dump, before);
			}, { ...process.env, PATH: `${dirname(adb)}${delimiter}${process.env.PATH ?? ''}` });
			out.push({ page, orientation: `${step > 0 ? 'rotated to ' : ''}${orientation}`, ...checked });
		}
	}
	await rotate('portrait');
	return out;
}
