// Runs in the submitting checkout: compiles its rungs with its own compiler and copies its hosts, so the runner never reads
// a checkout that may change or disappear while the job waits.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { instrumentFlow, type InstrumentedFlow } from '../harness/flow.ts';
import { PROOF_PLATFORMS, type ProofPlatform } from '../harness/proof-app.ts';
import { loadRung, type ProofAssets } from '../harness/rung.ts';
import type { DeviceManifest } from '../permissions.ts';
import { bundleMobile, bundleRung, type JobSpec, JOB_VERSION, writeJson } from './store.ts';

const mobileDir = resolve(import.meta.dirname, '..', '..');
export const repoRoot = resolve(mobileDir, '..', '..');
export const proofsDir = join(mobileDir, 'proofs');

/** The folders a run reads besides the rungs, relative to the mobile package: hosts, their tests' vectors, the shells. */
const HOST_FOLDERS = [
	'src/adapters/ios',
	'src/adapters/android',
	'conformance',
	'src/harness/shells',
	'src/harness/stub-host',
];
/** Build output and the hosts' own screenshots: never inputs. */
const SKIPPED = new Set(['.build', 'build', 'out', 'screenshots', '.swiftpm', 'node_modules']);

/** A rung folder named on the command line: a path, or a folder name under `proofs/`. */
export function rungDir(name: string): string {
	const asPath = resolve(name);
	if (existsSync(join(asPath, 'expected.json'))) return asPath;
	const underProofs = join(proofsDir, name);
	if (existsSync(join(underProofs, 'expected.json'))) return underProofs;
	throw new Error(
		`${name} is not a rung folder (no expected.json there or under ${relative(process.cwd(), proofsDir)})`,
	);
}

/** What a phone needs for one rung: the flow with its screenshot steps, the bytes each shell carries, the manifest entries. */
export type BundledRung = {
	readonly name: string;
	readonly flow: InstrumentedFlow;
	readonly manifest: DeviceManifest;
	/** Set when the rung did not build: it fails at `build` on every platform without reaching a phone. */
	readonly buildError?: string;
};

const git = (args: string[]) =>
	execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

export async function writeBundle(input: {
	readonly job: string;
	readonly id: string;
	readonly rungDirs: ReadonlyArray<string>;
	readonly platforms: ReadonlyArray<ProofPlatform>;
	readonly host: 'adapters' | 'stub';
	readonly log: (line: string) => void;
}): Promise<JobSpec> {
	const mobile = bundleMobile(input.job);
	for (const folder of HOST_FOLDERS) {
		const from = join(mobileDir, folder);
		if (!existsSync(from)) continue;
		cpSync(from, join(mobile, folder), {
			recursive: true,
			filter: (source) => !SKIPPED.has(source.slice(dirname(source).length + 1)),
		});
	}
	const names: string[] = [];
	for (const dir of input.rungDirs) {
		const started = performance.now();
		const name = basename(dir);
		if (names.includes(name)) throw new Error(`two rungs are named ${name}`);
		const out = bundleRung(input.job, name);
		names.push(name);
		let bundled: BundledRung;
		try {
			const rung = await loadRung(dir);
			if (rung.expected.server === 'echo')
				throw new Error(
					'the rung fetches from the echo server, which the phone runner does not start; run it with `node src/harness/cli.ts`',
				);
			bundled = {
				name,
				flow: instrumentFlow(rung.flow, rung.expected, rung.flowPath),
				manifest: rung.manifest,
			};
			for (const platform of PROOF_PLATFORMS)
				writeAssets(join(out, 'assets', platform), rung.assets[platform]);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			bundled = {
				name,
				flow: { yaml: '', steps: [], commands: [] },
				manifest: { ios: [], android: [] },
				buildError: message,
			};
		}
		writeJson(join(out, 'rung.json'), bundled);
		input.log(
			`${bundled.buildError ? 'did not build' : 'built'} ${name} (${((performance.now() - started) / 1000).toFixed(1)} s)${bundled.buildError ? `: ${bundled.buildError.split('\n')[0]}` : ''}`,
		);
	}
	const spec: JobSpec = {
		version: JOB_VERSION,
		id: input.id,
		createdAt: Date.now(),
		worktree: repoRoot,
		head: git(['rev-parse', 'HEAD']),
		dirty: git(['status', '--porcelain']).length > 0,
		rungs: names,
		platforms: input.platforms,
		host: input.host,
	};
	return spec;
}

function writeAssets(dir: string, assets: ProofAssets): void {
	for (const [path, bytes] of assets) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), bytes);
	}
}

/** The bytes a shell carries for one rung, read back from the bundle. */
export function readAssets(dir: string): ProofAssets {
	const assets = new Map<string, Uint8Array>();
	if (!existsSync(dir)) return assets;
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const file = join(entry.parentPath, entry.name);
		assets.set(relative(dir, file), readFileSync(file));
	}
	return assets;
}
