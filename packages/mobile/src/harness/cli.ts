#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
	androidHostTests,
	describeHostTests,
	iosHostTests,
	type HostTestOutcome,
} from './host-tests.ts';
import {
	bootSimulator,
	buildIosShell,
	installProofApp,
	shutdownSimulator,
	type BootedSimulator,
} from './ios.ts';
import { runFlow, type FlowFailure } from './maestro.ts';
import { PROOF_PLATFORMS, type ProofPlatform } from './proof-app.ts';
import { PROOF_REPORT_VERSION, proofVerdict, type ProofReport } from './report.ts';
import { loadRung, type ProofRung } from './rung.ts';
import { verdictCommand } from './verdict.ts';
import { androidTools, cacheRoot } from './tools.ts';
import { dragonDir } from '../style-export.ts';

const USAGE = `usage: markless-proof [options] <rung folder>...
       markless-proof verdict <dir>/ios.json <dir>/android.json
       markless-proof host-tests --platform ios|android [--simulator <name>]

Builds each rung (packages/mobile/proofs/<nn>-<name>/) for iOS and Android, installs it on a simulator and an emulator
this command boots (and shuts down afterwards), runs the rung's flow.yaml with Maestro on both, saves a screenshot after
each step and before each action under <rung>/screenshots/{ios,android}/ and checks expected.json. Exits 1 unless both platforms pass
every rung. Before any rung, the hosts' own tests run (the iOS package on the simulator, the Kotlin host's JVM test); a
failure there stops the run. \`host-tests\` runs only those.

  --host adapters|stub   the platform hosts in src/adapters (default) or the harness's hand-made stand-ins
  --simulator <name>     iOS simulator to use or create (default $MARKLESS_PROOF_SIMULATOR or markless-proof)
  --avd <name>           Android AVD to use or create (default $MARKLESS_PROOF_AVD or markless_proof)
  --port <n>             emulator console port (default $MARKLESS_PROOF_EMULATOR_PORT or 5584)
  --ios-host <dir>       a Swift package to use as the iOS host instead (a host branch not merged yet)
  --android-host <dir>   a Kotlin source folder to use as the Android host instead
  --platform ios|android run one platform only (CI runs iOS on macOS and Android on Linux); not a proof by itself
  --report <dir>         write <dir>/<platform>.json for each platform run
  --keep-devices         leave the devices this run booted running`;

const harnessDir = import.meta.dirname;
const mobileDir = resolve(harnessDir, '..', '..');

type HostSources = { readonly iosPackage: string; readonly androidSources: string };

function hostSources(
	host: string,
	platforms: ReadonlyArray<ProofPlatform>,
	iosHost?: string,
	androidHost?: string,
): HostSources {
	const root =
		host === 'stub'
			? join(harnessDir, 'stub-host')
			: host === 'adapters'
				? join(mobileDir, 'src', 'adapters')
				: null;
	if (!root) throw new Error(`--host is adapters or stub, not ${host}`);
	const sources = {
		iosPackage: iosHost ? resolve(iosHost) : join(root, 'ios'),
		androidSources: androidHost ? resolve(androidHost) : join(root, 'android', 'src'),
	};
	if (platforms.includes('ios') && !existsSync(join(sources.iosPackage, 'Package.swift'))) {
		throw new Error(`the iOS host is not here: no Swift package at ${sources.iosPackage}`);
	}
	if (platforms.includes('android') && !existsSync(sources.androidSources))
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

/** The Dragon checkout when there is one: the iOS UIKit tests that paint with its faces read their files from it. */
const dragonCheckout = (): string | undefined => {
	const dir = dragonDir();
	return existsSync(join(dir, 'package.json')) ? dir : undefined;
};

async function hostTestsCommand(argv: string[]): Promise<number> {
	const { values } = parseArgs({
		args: argv,
		options: {
			platform: { type: 'string' },
			simulator: {
				type: 'string',
				default: process.env.MARKLESS_PROOF_SIMULATOR ?? 'markless-proof',
			},
		},
	});
	const hosts = join(mobileDir, 'src', 'adapters');
	let outcome: HostTestOutcome;
	if (values.platform === 'ios') {
		const simulator = await bootSimulator(values.simulator);
		try {
			outcome = await iosHostTests(join(hosts, 'ios'), simulator.udid, dragonCheckout());
		} finally {
			await shutdownSimulator(simulator);
		}
	} else if (values.platform === 'android') {
		outcome = await androidHostTests(join(hosts, 'android', 'src'));
	} else throw new Error(`host-tests needs --platform ios or android, not ${values.platform}`);
	console.log(describeHostTests(outcome));
	return outcome.passed ? 0 : 1;
}

async function main(argv: string[]): Promise<number> {
	if (argv[0] === 'verdict') return verdictCommand(argv.slice(1));
	if (argv[0] === 'host-tests') return hostTestsCommand(argv.slice(1));
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
			'ios-host': { type: 'string' },
			'android-host': { type: 'string' },
			platform: { type: 'string' },
			report: { type: 'string' },
			'keep-devices': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	});
	if (values.help || positionals.length === 0) {
		console.log(USAGE);
		return values.help ? 0 : 2;
	}
	const platforms = values.platform
		? PROOF_PLATFORMS.filter((platform) => platform === values.platform)
		: PROOF_PLATFORMS;
	if (platforms.length === 0)
		throw new Error(`--platform is ios or android, not ${values.platform}`);
	const runs = (platform: ProofPlatform) => platforms.includes(platform);
	const hosts = hostSources(values.host, platforms, values['ios-host'], values['android-host']);
	const rungs: ProofRung[] = [];
	for (const dir of positionals) rungs.push(await loadRung(resolve(dir)));
	const flows = rungs.map((rung) => instrumentFlow(rung.flow, rung.expected, rung.flowPath));
	const tools = runs('android') ? await androidTools() : undefined;
	const shells = join(harnessDir, 'shells');

	const setupStarted = performance.now();
	let simulator: BootedSimulator | undefined;
	let emulator: BootedEmulator | undefined;
	const results = new Map<ProofPlatform, ProofReport['rungs'][number][]>(
		platforms.map((platform) => [platform, []]),
	);
	try {
		const [booted, avd, iosApp, androidShell] = await Promise.all([
			runs('ios') ? bootSimulator(values.simulator) : undefined,
			tools ? bootEmulator(tools, values.avd, Number(values.port)) : undefined,
			runs('ios') ? buildIosShell(hosts.iosPackage, join(shells, 'ios')) : undefined,
			tools
				? buildAndroidShell(tools, hosts.androidSources, join(shells, 'android'))
				: undefined,
		]);
		simulator = booted;
		emulator = avd;
		const devices = [
			simulator &&
				`simulator ${simulator.name} ${simulator.bootedHere ? 'booted' : 'reused'}`,
			emulator && `emulator ${emulator.serial} ${emulator.bootedHere ? 'booted' : 'reused'}`,
		].filter(Boolean);
		console.log(
			`devices and shells ready in ${fixed(seconds(setupStarted))} s (${devices.join(', ')})`,
		);
		// The stand-in host has no tests of its own.
		if (values.host === 'adapters') {
			const outcomes = await Promise.all([
				simulator
					? iosHostTests(hosts.iosPackage, simulator.udid, dragonCheckout())
					: undefined,
				runs('android') ? androidHostTests(hosts.androidSources) : undefined,
			]);
			for (const outcome of outcomes) if (outcome) console.log(describeHostTests(outcome));
			if (outcomes.some((outcome) => outcome && !outcome.passed)) {
				console.log('host tests failed: no rung runs on a host whose own tests fail');
				return 1;
			}
		}

		for (const [index, rung] of rungs.entries()) {
			const flow = flows[index]!;
			const rungStarted = performance.now();
			const work = join(cacheRoot(), 'runs', rung.name);
			const install = async (platform: ProofPlatform) => {
				const started = performance.now();
				try {
					if (platform === 'ios') {
						await installProofApp(
							simulator!,
							iosApp!,
							rung.assets.ios,
							rung.manifest,
							join(work, 'ios-app'),
						);
					} else {
						await installProofApk(
							tools!,
							emulator!,
							androidShell!,
							rung.assets.android,
							rung.manifest,
							join(work, 'android-app'),
						);
					}
					return { error: null, seconds: seconds(started) };
				} catch (error) {
					return {
						error: error instanceof Error ? error.message : String(error),
						seconds: seconds(started),
					};
				}
			};
			const installs = await Promise.all(platforms.map(install));
			// One Maestro run at a time: beside a second Maestro run, Android's run lost its device connection.
			for (const [at, platform] of platforms.entries()) {
				const installed = installs[at]!;
				let outcome: PlatformOutcome;
				if (installed.error) {
					outcome = {
						failure: {
							step: -1,
							action: 'install',
							role: 'unknown',
							message: installed.error,
						},
						installSeconds: installed.seconds,
						flowSeconds: 0,
					};
				} else {
					const result = await runFlow({
						platform,
						device: platform === 'ios' ? simulator!.udid : emulator!.serial,
						flow,
						flowName: rung.name,
						workDir: join(work, `${platform}-flow`),
						screenshotDir: join(rung.dir, 'screenshots', platform),
					});
					outcome = {
						failure: result.failure,
						installSeconds: installed.seconds,
						flowSeconds: result.seconds,
					};
				}
				results.get(platform)!.push({ name: rung.name, ...outcome });
				const timing = `install ${fixed(outcome.installSeconds)} s, flow ${fixed(outcome.flowSeconds)} s`;
				if (!outcome.failure) console.log(`PASS ${rung.name} ${platform} (${timing})`);
				else {
					const { step, action, role, command, message } = outcome.failure;
					const what =
						role === 'flow' ? `${command ?? 'a command'} failed` : 'maestro failed';
					console.log(
						`FAIL ${rung.name} ${platform} at step ${step} (${action}): ${what} (${timing})\n  ${message.split('\n').join('\n  ')}`,
					);
				}
			}
			console.log(
				`  ${rung.name}: ${fixed(seconds(rungStarted))} s; screenshots in ${join(rung.dir, 'screenshots')}`,
			);
		}
	} finally {
		if (!values['keep-devices']) {
			await Promise.all([
				simulator && shutdownSimulator(simulator),
				emulator && tools && stopEmulator(tools, emulator),
			]);
		}
	}

	const reports: ProofReport[] = platforms.map((platform) => ({
		version: PROOF_REPORT_VERSION,
		platform,
		rungs: results.get(platform)!,
	}));
	if (values.report) {
		mkdirSync(values.report, { recursive: true });
		for (const report of reports) {
			writeFileSync(
				join(values.report, `${report.platform}.json`),
				`${JSON.stringify(report, null, '\t')}\n`,
			);
		}
	}
	if (platforms.length < PROOF_PLATFORMS.length) {
		const own = reports.every(
			(report) =>
				report.rungs.length === rungs.length && report.rungs.every((rung) => !rung.failure),
		);
		console.log(
			`${own ? 'passed' : 'failed'} on ${platforms.join(', ')} only: not a proof until \`verdict\` reads a passing report from every platform`,
		);
		return own ? 0 : 1;
	}
	const { passed, problems } = proofVerdict(reports);
	for (const problem of problems) console.log(`FAIL ${problem}`);
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
