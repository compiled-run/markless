// A rung whose compiled bundle and platform host sources are byte-identical to a run that passed would run the same app on
// the same host: the job reuses that pass, and its report names the job it came from.
import { createHash, type Hash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ProofPlatform } from '../harness/proof-app.ts';
import type { BundledRung } from './bundle.ts';
import {
	bundleMobile,
	bundleRung,
	type JobSpec,
	readJson,
	type ReusedPass,
	runnerHome,
	rungsOn,
	writeJson,
} from './store.ts';

/** A platform's host inputs inside a bundle: its host, its shell, and the vectors its own tests run. */
const hostFolders = (platform: ProofPlatform) => [
	`src/adapters/${platform}`,
	`src/harness/shells/${platform}`,
	'conformance',
];
/** Build output the host leaves beside its sources: never an input. */
const SKIPPED = new Set(['.build', 'build', 'out', 'screenshots', '.swiftpm', 'node_modules']);

function hashFolder(hash: Hash, root: string): void {
	if (!existsSync(root)) return;
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
		)) {
			if (SKIPPED.has(entry.name)) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) {
				hash.update(`${relative(root, path)}\0`);
				hash.update(readFileSync(path));
				hash.update('\0');
			}
		}
	};
	walk(root);
}

/** The hash of a job's host inputs for one platform, shared by every rung of the job on it. */
export function hostFingerprint(job: string, spec: JobSpec, platform: ProofPlatform): string {
	const hash = createHash('sha256').update(`${spec.host}\0${platform}\0`);
	const mobile = bundleMobile(job);
	for (const folder of [
		...hostFolders(platform),
		...(spec.host === 'stub' ? ['src/harness/stub-host'] : []),
	]) {
		hash.update(`${folder}\0`);
		hashFolder(hash, join(mobile, folder));
	}
	return hash.digest('hex');
}

/** One rung on one platform: its host inputs, its flow and manifest, and the bytes its shell carries. */
export function rungFingerprint(
	job: string,
	rung: string,
	platform: ProofPlatform,
	hostInputs: string,
): string {
	const dir = bundleRung(job, rung);
	const hash = createHash('sha256').update(`${hostInputs}\0`);
	hash.update(readFileSync(join(dir, 'rung.json')));
	hash.update('\0');
	hashFolder(hash, join(dir, 'assets', platform));
	return hash.digest('hex');
}

export type RecordedPass = { readonly job: string; readonly rung: string; readonly at: number };

const passFile = (platform: ProofPlatform, fingerprint: string) =>
	join(runnerHome(), 'passes', platform, `${fingerprint}.json`);

export const earlierPass = (platform: ProofPlatform, fingerprint: string) =>
	readJson<RecordedPass>(passFile(platform, fingerprint));

/** Keeps the first job that passed with these inputs, so a reused pass always names a run that happened. */
export function recordPass(platform: ProofPlatform, fingerprint: string, pass: RecordedPass): void {
	if (!earlierPass(platform, fingerprint)) writeJson(passFile(platform, fingerprint), pass);
}

/** The rungs of a bundled job that an earlier job already passed with the same inputs, per platform. */
export function findReused(
	job: string,
	spec: JobSpec,
	platforms: ReadonlyArray<ProofPlatform>,
): ReusedPass[] {
	const reused: ReusedPass[] = [];
	for (const platform of platforms) {
		const host = hostFingerprint(job, spec, platform);
		for (const rung of rungsOn(spec, platform)) {
			if (readJson<BundledRung>(join(bundleRung(job, rung), 'rung.json'))?.buildError)
				continue;
			const pass = earlierPass(platform, rungFingerprint(job, rung, platform, host));
			if (pass)
				reused.push({
					platform,
					result: {
						name: rung,
						failure: null,
						installSeconds: 0,
						flowSeconds: 0,
						reusedFrom: pass.job,
					},
				});
		}
	}
	return reused;
}
