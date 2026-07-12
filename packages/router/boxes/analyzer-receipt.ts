import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { AnalyzerCanonicalInvariantResult } from '@markless/analyzer';
import { createRouterAnalyzerReport } from './analyzer-gate.ts';

const execFileAsync = promisify(execFile);
const receiptUrl = new URL('../.witness/receipts/analyzer-route-actions.json', import.meta.url);

export async function invalidateRouterAnalyzerReceipt(): Promise<void> {
	await rm(receiptUrl, { force: true });
}

export async function writeRouterAnalyzerReceipt(
	results: readonly AnalyzerCanonicalInvariantResult[],
): Promise<void> {
	const root = new URL('../../../', import.meta.url);
	const policyUrl = new URL('./analyzer/policy.ts', import.meta.url);
	const [{ stdout }, policy] = await Promise.all([
		execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root }),
		readFile(policyUrl),
	]);
	const report = createRouterAnalyzerReport({
		identity: { matrix: 'router-route-actions-v1' },
		commitSha: stdout.trim(),
		buildArtifactHash: createHash('sha256').update(policy).digest('hex'),
		results,
	});
	await mkdir(new URL('./', receiptUrl), { recursive: true });
	await writeFile(receiptUrl, `${JSON.stringify(report, null, '\t')}\n`);
}
