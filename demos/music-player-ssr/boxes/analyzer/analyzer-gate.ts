import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
	createVerdictReport,
	evaluatePreloadIntegrity,
	type AnalyzerCanonicalInvariantResult,
} from '@markless/analyzer';
import type { MusicSsrNetworkRule } from './policy.ts';

const receiptUrl = new URL('../../.witness/receipts/analyzer-ssr.json', import.meta.url);
const execFileAsync = promisify(execFile);

export function evaluateMusicSsrRequests(input: {
	readonly pageOrigin: string;
	readonly rules: readonly MusicSsrNetworkRule[];
	readonly requests: readonly {
		readonly method: string;
		readonly url: string;
		readonly status: number | null;
		readonly failedReason?: string | null;
	}[];
}): AnalyzerCanonicalInvariantResult {
	const details = input.requests.flatMap((request) => {
		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return [`undeclared request: ${request.method} ${request.url}`];
		}
		const declared = input.rules.some(
			(rule) =>
				rule.method === request.method &&
				(rule.origin === 'fixture'
					? url.origin === input.pageOrigin
					: url.origin === rule.origin) &&
				(typeof rule.path === 'string'
					? `${url.pathname}${url.search}` === rule.path
					: rule.path.test(url.pathname)),
		);
		if (!declared) return [`undeclared request: ${request.method} ${request.url}`];
		if (request.failedReason || request.status === null || request.status >= 400)
			return [
				`failed request: ${request.method} ${request.url} (${request.status ?? request.failedReason ?? 'no response'})`,
			];
		return [];
	});
	return { id: 'MLA-I2-NETWORK', status: details.length ? 'fail' : 'pass', details };
}

export const evaluateMusicSsrPreloadWindow = evaluatePreloadIntegrity;

export function createMusicSsrReport(results: readonly AnalyzerCanonicalInvariantResult[]) {
	return createVerdictReport({
		source: 'witness',
		lane: 'music-player-ssr-analyzer-adoption',
		results,
		metadata: {
			consumer: 'markless-music-player-ssr',
			matrix: 'music-player-ssr-route-actions-v1',
		},
	});
}

export async function invalidateMusicSsrReceipt(): Promise<void> {
	await rm(receiptUrl, { force: true });
}

export async function writeMusicSsrReceipt(
	results: readonly AnalyzerCanonicalInvariantResult[],
): Promise<void> {
	const [policy, { stdout }] = await Promise.all([
		readFile(new URL('./policy.ts', import.meta.url)),
		execFileAsync('git', ['rev-parse', 'HEAD'], {
			cwd: new URL('../../../../', import.meta.url),
		}),
	]);
	const report = createVerdictReport({
		source: 'witness',
		lane: 'music-player-ssr-analyzer-adoption',
		results,
		metadata: {
			consumer: 'markless-music-player-ssr',
			matrix: 'music-player-ssr-route-actions-v1',
			commitSha: stdout.trim(),
			buildArtifactHash: createHash('sha256').update(policy).digest('hex'),
		},
	});
	await mkdir(new URL('./', receiptUrl), { recursive: true });
	await writeFile(receiptUrl, `${JSON.stringify(report, null, '\t')}\n`);
}
