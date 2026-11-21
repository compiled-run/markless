// The hosts' own tests, run before any rung (the harness pre-flight) and by CI (`cli.ts host-tests`): the iOS package's
// tests, its UIKit ones included, on the simulator the rungs use; the Kotlin host's JVM conformance test.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dragonDir } from '../style-export.ts';
import { exec } from './exec.ts';
import { cacheRoot, contentKey, filesUnder } from './tools.ts';

/** The UIKit tests that paint with Dragon's pinned faces: they need a Dragon checkout for the font files. */
export const DRAGON_FONT_TESTS = [
	'MarklessMobileTests/paintsDragonsExport()',
	'MarklessMobileTests/refusesMissingOrWrongFonts()',
] as const;

export type HostTestOutcome = {
	readonly platform: 'ios' | 'android';
	readonly passed: boolean;
	/** Remembered from an earlier pass over the same sources. */
	readonly cached: boolean;
	readonly skipped: ReadonlyArray<string>;
	readonly seconds: number;
	/** The runner's lines that name a failure, for the log. */
	readonly failures: ReadonlyArray<string>;
};

const conformance = (hostDir: string) => join(hostDir, '..', '..', '..', 'conformance');

const passMarker = (platform: string, key: string) =>
	join(cacheRoot(), 'host-tests', `${platform}-${key}.passed`);

async function remembered(
	platform: 'ios' | 'android',
	key: string,
	run: () => Promise<Omit<HostTestOutcome, 'cached' | 'seconds'>>,
): Promise<HostTestOutcome> {
	const marker = passMarker(platform, key);
	if (existsSync(marker))
		return { platform, passed: true, cached: true, skipped: [], seconds: 0, failures: [] };
	const started = performance.now();
	const outcome = await run();
	if (outcome.passed) {
		mkdirSync(dirname(marker), { recursive: true });
		writeFileSync(marker, '');
	}
	return { ...outcome, cached: false, seconds: (performance.now() - started) / 1000 };
}

const failureLines = (output: string, pattern: RegExp) =>
	output
		.split('\n')
		.filter((line) => pattern.test(line))
		.slice(0, 40);

/** The Dragon checkout when there is one: the iOS UIKit tests that paint with its faces read their files from it. */
export const dragonCheckout = (): string | undefined => {
	const dir = dragonDir();
	return existsSync(join(dir, 'package.json')) ? dir : undefined;
};

const iosHostTestSources = (iosPackage: string) => [
	...filesUnder(iosPackage, '.swift'),
	...filesUnder(join(iosPackage, 'Tests'), '.json'),
	...filesUnder(conformance(iosPackage), '.json'),
];

/**
 * The iOS host tests' inputs, without the simulator: CI keys a pass with it, so a pull request whose inputs already passed
 * on main or on an earlier push skips the macOS job.
 */
export const iosHostTestsKey = (iosPackage: string, dragon: string | undefined): string =>
	contentKey(iosPackage, iosHostTestSources(iosPackage), [dragon ? 'fonts' : 'no-fonts']);

/**
 * `xcodebuild test` of the iOS host package on a booted simulator: MarklessCore and the UIKit tests. Without a Dragon
 * checkout the two tests that need its font files are skipped by name, and the outcome lists them.
 */
export function iosHostTests(
	iosPackage: string,
	udid: string,
	dragon: string | undefined,
): Promise<HostTestOutcome> {
	const sources = iosHostTestSources(iosPackage);
	const key = contentKey(iosPackage, sources, [udid, dragon ? 'fonts' : 'no-fonts']);
	return remembered('ios', key, async () => {
		const skipped = dragon ? [] : [...DRAGON_FONT_TESTS];
		const result = await exec(
			'xcodebuild',
			[
				'test',
				'-scheme',
				'MarklessMobile-Package',
				'-destination',
				`id=${udid}`,
				'-derivedDataPath',
				// One build folder per simulator: runs on two simulators at once must not share xcodebuild's.
				join(cacheRoot(), 'host-tests', `ios-derived-data-${udid}`),
				...skipped.map((test) => `-skip-testing:${test}`),
			],
			{
				cwd: iosPackage,
				env: {
					...process.env,
					...(dragon ? { TEST_RUNNER_MARKLESS_DRAGON_DIR: dragon } : {}),
				},
				allowFailure: true,
				timeoutMs: 1_800_000,
			},
		);
		const output = `${result.stdout}\n${result.stderr}`;
		return {
			platform: 'ios',
			passed: result.code === 0,
			skipped,
			failures: result.code === 0 ? [] : failureLines(output, /✘|error:|\*\* TEST FAILED/),
		};
	});
}

/** The Kotlin host's JVM conformance test (`test-jvm.sh`): its interpreter core and style decoder against the vectors. */
export function androidHostTests(androidSources: string): Promise<HostTestOutcome> {
	const hostDir = dirname(androidSources);
	const script = join(hostDir, 'test-jvm.sh');
	if (!existsSync(script)) throw new Error(`the Android host's tests are not here: no ${script}`);
	const sources = [
		...filesUnder(hostDir, '.kt'),
		...filesUnder(join(hostDir, 'test'), '.json'),
		...filesUnder(conformance(hostDir), '.json'),
		script,
	];
	return remembered('android', contentKey(hostDir, sources), async () => {
		const result = await exec(script, [], {
			cwd: hostDir,
			env: {
				...process.env,
				MARKLESS_ANDROID_OUT: join(cacheRoot(), 'host-tests', 'android'),
			},
			allowFailure: true,
			timeoutMs: 1_800_000,
		});
		const output = `${result.stdout}\n${result.stderr}`;
		return {
			platform: 'android',
			passed: result.code === 0,
			skipped: [],
			failures: result.code === 0 ? [] : failureLines(output, /^fail|error|Exception/i),
		};
	});
}

export const describeHostTests = (outcome: HostTestOutcome): string =>
	[
		`${outcome.passed ? 'PASS' : 'FAIL'} host tests ${outcome.platform}${outcome.cached ? ' (passed before on these sources)' : ` (${outcome.seconds.toFixed(1)} s)`}`,
		...outcome.skipped.map(
			(test) => `  skipped ${test}: needs a Dragon checkout for its font files`,
		),
		...outcome.failures.map((line) => `  ${line.trim()}`),
	].join('\n');
