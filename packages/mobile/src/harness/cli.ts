#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
	bootEmulator,
	buildAndroidShell,
	installProofApk,
	stopEmulator,
	type BootedEmulator,
} from './android.ts';
import { instrumentFlow } from './flow.ts';
import {
	bootSimulator,
	buildIosShell,
	installProofApp,
	shutdownSimulator,
	type BootedSimulator,
} from './ios.ts';
import { runFlow, type FlowFailure } from './maestro.ts';
import { PROOF_PLATFORMS, type ProofPlatform } from './proof-app.ts';
import { loadRung, type ProofRung } from './rung.ts';
import { androidTools, cacheRoot } from './tools.ts';

const USAGE = `usage: markless-proof [options] <rung folder>...

Builds each rung (packages/mobile/proofs/<nn>-<name>/) for iOS and Android, installs it on a simulator and an emulator
this command boots (and shuts down afterwards), runs the rung's flow.yaml with Maestro on both, saves screenshots before
and after each step under <rung>/screenshots/{ios,android}/ and checks expected.json. Exits 1 unless both platforms pass
every rung.

  --host adapters|stub   the platform hosts in src/adapters (default) or the harness's hand-made stand-ins
  --simulator <name>     iOS simulator to use or create (default $MARKLESS_PROOF_SIMULATOR or markless-proof)
  --avd <name>           Android AVD to use or create (default $MARKLESS_PROOF_AVD or markless_proof)
  --port <n>             emulator console port (default $MARKLESS_PROOF_EMULATOR_PORT or 5584)
  --keep-devices         leave the devices this run booted running`;

const harnessDir = import.meta.dirname;
const mobileDir = resolve(harnessDir, '..', '..');

type HostSources = { readonly iosPackage: string; readonly androidSources: string };

function hostSources(host: string): HostSources {
	const root =
		host === 'stub'
			? join(harnessDir, 'stub-host')
			: host === 'adapters'
				? join(mobileDir, 'src', 'adapters')
				: null;
	if (!root) throw new Error(`--host is adapters or stub, not ${host}`);
	const sources = { iosPackage: join(root, 'ios'), androidSources: join(root, 'android', 'src') };
	if (!existsSync(join(sources.iosPackage, 'Package.swift'))) {
		throw new Error(`the iOS host is not here: no Swift package at ${sources.iosPackage}`);
	}
	if (!existsSync(sources.androidSources))
		throw new Error(`the Android host is not here: no ${sources.androidSources}`);
	return sources;
}

type PlatformOutcome = {
	readonly failure: FlowFailure | null;
	readonly installSeconds: number;
	readonly flowSeconds: number;
};

const seconds = (since: number) => (performance.now() - since) / 1000;
const fixed = (value: number) => value.toFixed(1);

async function main(argv: string[]): Promise<number> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			host: { type: 'string', default: 'adapters' },
			simulator: {
				type: 'string',
				default: process.env.MARKLESS_PROOF_SIMULATOR ?? 'markless-proof',
			},
			avd: { type: 'string', default: process.env.MARKLESS_PROOF_AVD ?? 'markless_proof' },
			port: { type: 'string', default: process.env.MARKLESS_PROOF_EMULATOR_PORT ?? '5584' },
			'keep-devices': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	});
	if (values.help || positionals.length === 0) {
		console.log(USAGE);
		return values.help ? 0 : 2;
	}
	const hosts = hostSources(values.host);
	const rungs: ProofRung[] = [];
	for (const dir of positionals) rungs.push(await loadRung(resolve(dir)));
	const flows = rungs.map((rung) => instrumentFlow(rung.flow, rung.expected, rung.flowPath));
	const tools = await androidTools();
	const shells = join(harnessDir, 'shells');

	const setupStarted = performance.now();
	let simulator: BootedSimulator | undefined;
	let emulator: BootedEmulator | undefined;
	const results = new Map<string, Record<ProofPlatform, PlatformOutcome>>();
	try {
		const [booted, avd, iosApp, androidDex] = await Promise.all([
			bootSimulator(values.simulator),
			bootEmulator(tools, values.avd, Number(values.port)),
			buildIosShell(hosts.iosPackage, join(shells, 'ios')),
			buildAndroidShell(tools, hosts.androidSources, join(shells, 'android')),
		]);
		simulator = booted;
		emulator = avd;
		console.log(
			`devices and shells ready in ${fixed(seconds(setupStarted))} s (simulator ${simulator.name}${simulator.bootedHere ? ' booted' : ' reused'}, emulator ${emulator.serial}${emulator.bootedHere ? ' booted' : ' reused'})`,
		);

		for (const [index, rung] of rungs.entries()) {
			const flow = flows[index]!;
			const rungStarted = performance.now();
			const work = join(cacheRoot(), 'runs', rung.name);
			const install = async (platform: ProofPlatform) => {
				const started = performance.now();
				try {
					if (platform === 'ios')
						await installProofApp(
							simulator!,
							iosApp,
							rung.assets,
							join(work, 'ios-app'),
						);
					else
						await installProofApk(
							tools,
							emulator!,
							androidDex,
							rung.assets,
							join(work, 'android-app'),
						);
					return { error: null, seconds: seconds(started) };
				} catch (error) {
					return {
						error: error instanceof Error ? error.message : String(error),
						seconds: seconds(started),
					};
				}
			};
			const installs = await Promise.all(PROOF_PLATFORMS.map(install));
			const outcomes: PlatformOutcome[] = [];
			// One Maestro run at a time: a second Maestro process on the machine kills the Android run's device server.
			for (const [at, platform] of PROOF_PLATFORMS.entries()) {
				const installed = installs[at]!;
				if (installed.error) {
					outcomes.push({
						failure: {
							step: -1,
							action: 'install',
							role: 'unknown',
							message: installed.error,
						},
						installSeconds: installed.seconds,
						flowSeconds: 0,
					});
					continue;
				}
				const result = await runFlow({
					platform,
					device: platform === 'ios' ? simulator!.udid : emulator!.serial,
					flow,
					flowName: rung.name,
					workDir: join(work, `${platform}-flow`),
					screenshotDir: join(rung.dir, 'screenshots', platform),
				});
				outcomes.push({
					failure: result.failure,
					installSeconds: installed.seconds,
					flowSeconds: result.seconds,
				});
			}
			const [ios, android] = outcomes as [PlatformOutcome, PlatformOutcome];
			results.set(rung.name, { ios, android });
			for (const platform of PROOF_PLATFORMS) {
				const outcome = platform === 'ios' ? ios : android;
				const timing = `install ${fixed(outcome.installSeconds)} s, flow ${fixed(outcome.flowSeconds)} s`;
				if (!outcome.failure) console.log(`PASS ${rung.name} ${platform} (${timing})`);
				else {
					const { step, action, role, message } = outcome.failure;
					const what =
						role === 'expected'
							? 'expected.json does not hold'
							: role === 'flow'
								? 'a flow command failed'
								: 'maestro failed';
					console.log(
						`FAIL ${rung.name} ${platform} at step ${step} (${action}): ${what} (${timing})\n  ${message.split('\n').join('\n  ')}`,
					);
				}
			}
			console.log(
				`  ${rung.name}: ${fixed(seconds(rungStarted))} s for both platforms; screenshots in ${join(rung.dir, 'screenshots')}`,
			);
		}
	} finally {
		if (!values['keep-devices']) {
			await Promise.all([
				simulator && shutdownSimulator(simulator),
				emulator && stopEmulator(tools, emulator),
			]);
		}
	}

	const failed = [...results].flatMap(([name, outcome]) =>
		PROOF_PLATFORMS.flatMap((platform) =>
			outcome[platform].failure ? [`${name} on ${platform}`] : [],
		),
	);
	const missing = rungs.filter((rung) => !results.has(rung.name)).map((rung) => rung.name);
	if (missing.length > 0) console.log(`NOT RUN: ${missing.join(', ')}`);
	if (failed.length > 0) console.log(`FAILED: ${failed.join(', ')}`);
	const passed = failed.length === 0 && missing.length === 0;
	console.log(passed ? `all ${rungs.length} rung(s) passed on iOS and Android` : 'proof failed');
	return passed ? 0 : 1;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(`markless-proof: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	},
);
