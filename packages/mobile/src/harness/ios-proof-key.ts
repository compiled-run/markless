// Prints the pass key of Native proofs' iOS job for CI: the rungs as the runner bundles them, the iOS host, and every other file
// the job reads. Prints nothing when a rung does not build here, so the job runs.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { repoRoot, rungDir, writeBundle, type BundledRung } from '../runner/bundle.ts';
import { hashFolder, hostFingerprint, rungFingerprint } from '../runner/reuse.ts';
import { bundleRung, type JobSpec, readJson } from '../runner/store.ts';

/** What the iOS job reads besides the bundle: the harness that drives the simulator, the versions it pins, its workflow. */
export const IOS_JOB_INPUTS = [
	'packages/mobile/src',
	'packages/mobile/package.json',
	'packages/mobile/dragon.json',
	'pnpm-lock.yaml',
	'.github/workflows/native-proofs.yml',
];
/** Android's sources and the phone runner never reach the iOS job. */
const NOT_READ_BY_IOS = [
	'packages/mobile/src/runner',
	'packages/mobile/src/adapters/android',
	'packages/mobile/src/harness/shells/android',
];

/** The key, or the rungs that did not build (their error may come from this machine, so it is no key). */
export function iosProofKey(input: {
	readonly job: string;
	readonly spec: JobSpec;
	readonly repo: string;
	readonly rungDirs: ReadonlyArray<string>;
}): { readonly key: string } | { readonly notBuilt: ReadonlyArray<string> } {
	const notBuilt = input.spec.rungs.filter(
		(rung) => readJson<BundledRung>(join(bundleRung(input.job, rung), 'rung.json'))?.buildError,
	);
	if (notBuilt.length > 0) return { notBuilt };
	const hash = createHash('sha256').update('native-proofs-ios/1\0');
	const host = hostFingerprint(input.job, input.spec, 'ios');
	hash.update(`${host}\0`);
	for (const rung of input.spec.rungs)
		hash.update(`${rung}\0${rungFingerprint(input.job, rung, 'ios', host)}\0`);
	const except = new Set(NOT_READ_BY_IOS.map((path) => join(input.repo, path)));
	const proofs = new Set(input.rungDirs.map((dir) => dirname(dir)));
	const sources = [
		...IOS_JOB_INPUTS.map((path) => join(input.repo, path)),
		...input.rungDirs,
		...[...proofs].flatMap((dir) => ['ladder.ts', 'app.json', 'lib'].map((file) => join(dir, file))),
	];
	for (const path of sources) {
		hash.update(`${path.slice(input.repo.length)}\0`);
		if (!existsSync(path)) hash.update('missing\0');
		else if (statSync(path).isDirectory()) hashFolder(hash, path, except);
		else hash.update(readFileSync(path)).update('\0');
	}
	return { key: hash.digest('hex') };
}

async function main(names: ReadonlyArray<string>): Promise<number> {
	const job = mkdtempSync(join(tmpdir(), 'native-proofs-ios-key-'));
	try {
		const rungDirs = names.map((name) => rungDir(name));
		const spec = await writeBundle({
			job,
			id: basename(job),
			rungDirs,
			platforms: ['ios'],
			host: 'adapters',
			log: (line) => console.error(line),
		});
		const result = iosProofKey({ job, spec, repo: repoRoot, rungDirs });
		if ('key' in result) console.log(result.key);
		else console.error(`no key: ${result.notBuilt.join(', ')} did not build here, so the iOS job runs`);
		return 0;
	} finally {
		rmSync(job, { recursive: true, force: true });
	}
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
