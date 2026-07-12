import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
	appendInvariantResult,
	createVerdictReport,
	createWitnessVerdict,
	readVerdictReport,
	type WitnessBoxOutcome,
} from '@markless/analyzer';
import { createBundlerAnalyzerReport } from './analyzer-gate.ts';

const execFileAsync = promisify(execFile);

const reportUrl = new URL('../.witness/receipts/mla-verdicts.json', import.meta.url);
let pendingWrite = Promise.resolve();

export type BundlerAnalyzerReceipt =
	| 'csr-preloader'
	| 'ssr-preloader'
	| 'ssr-preload-waterfall'
	| 'debug-channel'
	| 'debug-channel-positive';

const analyzerReceiptUrl = (name: BundlerAnalyzerReceipt) =>
	new URL(`../.witness/receipts/analyzer-${name}.json`, import.meta.url);

export async function invalidateBundlerAnalyzerReceipt(
	name: BundlerAnalyzerReceipt,
): Promise<void> {
	await rm(analyzerReceiptUrl(name), { force: true });
}

export async function writeBundlerAnalyzerReceipt(input: {
	readonly name: BundlerAnalyzerReceipt;
	readonly identity: { readonly fixture: string } | { readonly matrix: string };
	readonly results: readonly import('@markless/analyzer').AnalyzerCanonicalInvariantResult[];
}): Promise<void> {
	const root = new URL('../../../', import.meta.url);
	const policyUrl = new URL('./analyzer/policy.ts', import.meta.url);
	const [{ stdout }, policy] = await Promise.all([
		execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root }),
		readFile(policyUrl),
	]);
	const report = createBundlerAnalyzerReport({
		identity: input.identity,
		commitSha: stdout.trim(),
		buildArtifactHash: createHash('sha256').update(policy).digest('hex'),
		results: input.results,
	});
	const url = analyzerReceiptUrl(input.name);
	await mkdir(new URL('./', url), { recursive: true });
	await writeFile(url, `${JSON.stringify(report, null, '\t')}\n`);
}

export function appendWitnessVerdict(outcome: WitnessBoxOutcome): Promise<void> {
	const write = pendingWrite.then(() => writeWitnessVerdict(outcome));
	pendingWrite = write.catch(() => undefined);
	return write;
}

async function writeWitnessVerdict(outcome: WitnessBoxOutcome): Promise<void> {
	let report = createVerdictReport({ source: 'witness', lane: 'MLA-EXT-WITNESS' });
	try {
		report = readVerdictReport(JSON.parse(await readFile(reportUrl, 'utf8')));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	await mkdir(new URL('./', reportUrl), { recursive: true });
	await writeFile(
		reportUrl,
		`${JSON.stringify(appendInvariantResult(report, createWitnessVerdict(outcome)), null, '\t')}\n`,
	);
}
