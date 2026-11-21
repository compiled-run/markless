#!/usr/bin/env node
// One chunk on one phone, started by the runner through the machine queue: build (or reuse) the shell around the job's
// host, run the host's own tests (remembered per source set), then install and run each rung's flow.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildAndroidShell, installProofApk } from '../harness/android.ts';
import { iosHostTests, androidHostTests, describeHostTests } from '../harness/host-tests.ts';
import { exec } from '../harness/exec.ts';
import { buildIosShell, installProofApp } from '../harness/ios.ts';
import { runFlow } from '../harness/maestro.ts';
import type { ProofPlatform } from '../harness/proof-app.ts';
import { androidTools, cacheRoot } from '../harness/tools.ts';
import { ECHO_SERVER_PORT } from '../../proofs/ladder.ts';
import { dragonDir } from '../style-export.ts';
import { type BundledRung, readAssets } from './bundle.ts';
import {
	bundleMobile,
	bundleRung,
	chunkFile,
	chunkResultFile,
	type Chunk,
	type JobSpec,
	readJson,
	type RungResult,
	screenshotsDir,
	writeJson,
} from './store.ts';

const [job, chunkName, device, reinstall] = process.argv.slice(2);
if (!job || !chunkName || !device)
	throw new Error('usage: run-chunk.ts <job dir> <chunk> <device> [reinstall-driver]');
const spec = readJson<JobSpec>(join(job, 'job.json'))!;
// The shells take Dragon's engine from the checkout the job's styles were compiled with, as long as it has not moved since.
if (spec.dragon) {
	const head = execFileSync('git', ['-C', spec.dragon.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	if (head !== spec.dragon.commit)
		throw new Error(`the job's Dragon checkout ${spec.dragon.dir} moved from ${spec.dragon.commit} to ${head} after the submit; submit again`);
	process.env.MARKLESS_DRAGON_DIR = spec.dragon.dir;
	if (spec.dragon.zig) process.env.MARKLESS_ZIG = spec.dragon.zig;
}
const chunk = readJson<Chunk>(chunkFile(job, chunkName))!;
const platform: ProofPlatform = chunk.platform;
const mobile = bundleMobile(job);
const hostRoot =
	spec.host === 'stub'
		? join(mobile, 'src', 'harness', 'stub-host')
		: join(mobile, 'src', 'adapters');
const shells = join(mobile, 'src', 'harness', 'shells');
const seconds = (since: number) => (performance.now() - since) / 1000;

const results: RungResult[] = [];
const fail = (name: string, action: string, message: string): RungResult => ({
	name,
	failure: { step: -1, action, role: 'unknown', message },
	installSeconds: 0,
	flowSeconds: 0,
});

mkdirSync(join(cacheRoot(), 'runs'), { recursive: true });
const work = mkdtempSync(join(cacheRoot(), 'runs', 'chunk-'));
try {
	const started = performance.now();
	const tools = platform === 'android' ? await androidTools() : undefined;
	let install: (rung: BundledRung, dir: string) => Promise<void>;
	let hostFailure: string | undefined;
	if (platform === 'ios') {
		const app = await buildIosShell(join(hostRoot, 'ios'), join(shells, 'ios'));
		if (spec.host === 'adapters') {
			const dragon = dragonDir();
			const outcome = await iosHostTests(
				join(hostRoot, 'ios'),
				device,
				existsSync(join(dragon, 'package.json')) ? dragon : undefined,
			);
			console.log(describeHostTests(outcome));
			if (!outcome.passed) hostFailure = describeHostTests(outcome);
		}
		const simulator = { udid: device, name: device, bootedHere: false };
		install = (rung, dir) =>
			installProofApp(
				simulator,
				app,
				readAssets(join(dir, 'assets', 'ios')),
				rung.manifest,
				join(work, rung.name, 'ios-app'),
			);
	} else {
		const shell = await buildAndroidShell(
			tools!,
			join(hostRoot, 'android', 'src'),
			join(shells, 'android'),
		);
		if (spec.host === 'adapters') {
			const outcome = await androidHostTests(join(hostRoot, 'android', 'src'));
			console.log(describeHostTests(outcome));
			if (!outcome.passed) hostFailure = describeHostTests(outcome);
		}
		const emulator = { serial: device, avd: device, bootedHere: false };
		install = (rung, dir) =>
			installProofApk(
				tools!,
				emulator,
				shell,
				readAssets(join(dir, 'assets', 'android')),
				rung.manifest,
				join(work, rung.name, 'android-app'),
			);
	}
	console.log(`shell and host tests ready in ${seconds(started).toFixed(1)} s`);

	let reinstallDriver = reinstall === 'reinstall-driver';
	for (const name of chunk.rungs) {
		const dir = bundleRung(job, name);
		const rung = readJson<BundledRung>(join(dir, 'rung.json'))!;
		if (rung.buildError) {
			results.push(fail(name, 'build', rung.buildError));
		} else if (hostFailure) {
			results.push(
				fail(
					name,
					'host-tests',
					`no rung runs on a host whose own tests fail\n${hostFailure}`,
				),
			);
		} else {
			const installStarted = performance.now();
			let installError: string | undefined;
			try {
				// A rung that switched to dark leaves the phone dark for the next job's rungs: each starts light.
				if (platform === 'ios')
					await exec('xcrun', ['simctl', 'ui', device, 'appearance', 'light']);
				else
					await exec(tools!.adb, ['-s', device, 'shell', 'cmd', 'uimode', 'night', 'no']);
				await install(rung, dir);
				// The emulator's 127.0.0.1 is its own: the runner's echo server port is forwarded to it.
				if (rung.server === 'echo' && platform === 'android')
					await exec(tools!.adb, [
						'-s',
						device,
						'reverse',
						`tcp:${ECHO_SERVER_PORT}`,
						`tcp:${ECHO_SERVER_PORT}`,
					]);
			} catch (error) {
				installError = error instanceof Error ? error.message : String(error);
			}
			const installSeconds = seconds(installStarted);
			if (installError)
				results.push({ ...fail(name, 'install', installError), installSeconds });
			else {
				const flow = await runFlow({
					platform,
					device,
					flow: rung.flow,
					flowName: name,
					workDir: join(work, name, `${platform}-flow`),
					screenshotDir: screenshotsDir(job, name, platform),
					reinstallDriver,
				});
				reinstallDriver = false;
				results.push({
					name,
					failure: flow.failure,
					installSeconds,
					flowSeconds: flow.seconds,
				});
			}
		}
		const last = results.at(-1)!;
		console.log(
			`${last.failure ? 'FAIL' : 'PASS'} ${name} ${platform} (install ${last.installSeconds.toFixed(1)} s, flow ${last.flowSeconds.toFixed(1)} s)${last.failure ? `\n  ${last.failure.action}: ${last.failure.message.split('\n').join('\n  ')}` : ''}`,
		);
		writeJson(chunkResultFile(job, chunkName), results);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.log(`the chunk stopped: ${message}`);
	for (const name of chunk.rungs)
		if (!results.some((result) => result.name === name))
			results.push(fail(name, 'setup', message));
} finally {
	rmSync(work, { recursive: true, force: true });
}
writeJson(chunkResultFile(job, chunkName), results);
