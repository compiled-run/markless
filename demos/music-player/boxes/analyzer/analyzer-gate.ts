import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
	createVerdictReport,
	evaluatePreloadIntegrity,
	type AnalyzerCanonicalInvariantResult,
} from '@markless/analyzer';
import type { MusicCsrFixtureId, MusicCsrNetworkRule } from './policy.ts';

const receiptUrl = new URL('../../.witness/receipts/analyzer-csr.json', import.meta.url);
const execFileAsync = promisify(execFile);

export type MusicCsrAnalyzerSurface =
	| 'MLA-S1-PRELOAD-INTEGRITY'
	| 'MLA-I1-CONSOLE'
	| 'MLA-I2-NETWORK'
	| 'MLA-I5-BOOTSTRAP-BUDGET'
	| 'MLA-I5-ACTION-BUDGET'
	| 'MLA-EXT-WITNESS';

export interface MusicCsrFixtureSurfaceMatrix {
	readonly schemaVersion: 1;
	readonly kind: 'fixture-surface-matrix';
	readonly fixtures: readonly {
		readonly fixture: MusicCsrFixtureId;
		readonly interactions: readonly string[];
		readonly surfaces: readonly MusicCsrAnalyzerSurface[];
	}[];
}

const fixtureIds = new Set<MusicCsrFixtureId>([
	'csr-command-state',
	'csr-play-branch',
	'csr-library-toggle',
]);
const surfaceIds = new Set<MusicCsrAnalyzerSurface>([
	'MLA-S1-PRELOAD-INTEGRITY',
	'MLA-I1-CONSOLE',
	'MLA-I2-NETWORK',
	'MLA-I5-BOOTSTRAP-BUDGET',
	'MLA-I5-ACTION-BUDGET',
	'MLA-EXT-WITNESS',
]);

export function validateMusicCsrMatrixDocument(value: unknown): MusicCsrFixtureSurfaceMatrix {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new Error('CSR fixture/surface matrix must be an object');
	const document = value as Record<string, unknown>;
	if (document.schemaVersion !== 1 || document.kind !== 'fixture-surface-matrix')
		throw new Error('CSR fixture/surface matrix has an unsupported schema or kind');
	if (!Array.isArray(document.fixtures))
		throw new Error('CSR fixture/surface matrix fixtures must be an array');
	const seen = new Set<string>();
	for (const fixture of document.fixtures) {
		if (typeof fixture !== 'object' || fixture === null || Array.isArray(fixture))
			throw new Error('CSR fixture/surface entry must be an object');
		const entry = fixture as Record<string, unknown>;
		if (
			!fixtureIds.has(entry.fixture as MusicCsrFixtureId) ||
			seen.has(entry.fixture as string)
		)
			throw new Error(
				`CSR fixture id is missing, duplicate, or undeclared: ${entry.fixture}`,
			);
		seen.add(entry.fixture as string);
		if (!Array.isArray(entry.interactions) || entry.interactions.some((id) => !id))
			throw new Error(`CSR fixture ${entry.fixture} has invalid interactions`);
		if (
			!Array.isArray(entry.surfaces) ||
			entry.surfaces.some((id) => !surfaceIds.has(id as MusicCsrAnalyzerSurface))
		)
			throw new Error(`CSR fixture ${entry.fixture} has a non-canonical surface`);
	}
	if (seen.size !== fixtureIds.size)
		throw new Error('CSR fixture/surface matrix does not cover every declared fixture id');
	return value as MusicCsrFixtureSurfaceMatrix;
}

export function evaluateMusicCsrRequests(input: {
	readonly pageOrigin: string;
	readonly rules: readonly MusicCsrNetworkRule[];
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

export const evaluateMusicCsrPreloadWindow = evaluatePreloadIntegrity;

export function createMusicCsrReport(results: readonly AnalyzerCanonicalInvariantResult[]) {
	return createVerdictReport({
		source: 'witness',
		lane: 'music-player-csr-analyzer-adoption',
		results,
		metadata: { consumer: 'markless-music-player', matrix: 'music-player-csr-surfaces-v1' },
	});
}

export async function invalidateMusicCsrReceipt(): Promise<void> {
	await rm(receiptUrl, { force: true });
}

export async function writeMusicCsrReceipt(
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
		lane: 'music-player-csr-analyzer-adoption',
		results,
		metadata: {
			consumer: 'markless-music-player',
			matrix: 'music-player-csr-surfaces-v1',
			commitSha: stdout.trim(),
			buildArtifactHash: createHash('sha256').update(policy).digest('hex'),
		},
	});
	await mkdir(new URL('./', receiptUrl), { recursive: true });
	await writeFile(receiptUrl, `${JSON.stringify(report, null, '\t')}\n`);
}
