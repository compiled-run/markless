import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { validateVerdictReport } from '../src/verdicts.ts';

interface ExpectedReceipt {
	readonly receiptPath: string;
	readonly consumer: string;
	readonly fixture?: string;
	readonly matrix?: string;
	readonly commitSha: string;
	readonly buildArtifactHash: string;
}

interface ExpectedReceiptManifest {
	readonly entries: readonly ExpectedReceipt[];
}

const nonempty = (value: unknown, name: string): string => {
	if (typeof value !== 'string' || value.length === 0)
		throw new Error(`${name} must be a nonempty string`);
	return value;
};

function validateManifest(value: unknown): ExpectedReceiptManifest {
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new Error('Expected-receipt manifest must be an object');
	const entries = (value as { entries?: unknown }).entries;
	if (!Array.isArray(entries))
		throw new Error('Expected-receipt manifest entries must be an array');
	return {
		entries: entries.map((value, index) => {
			if (typeof value !== 'object' || value === null || Array.isArray(value))
				throw new Error(`Manifest entry ${index} must be an object`);
			const entry = value as Record<string, unknown>;
			const fixture =
				entry.fixture === undefined
					? undefined
					: nonempty(entry.fixture, `Entry ${index} fixture`);
			const matrix =
				entry.matrix === undefined
					? undefined
					: nonempty(entry.matrix, `Entry ${index} matrix`);
			if ((fixture === undefined) === (matrix === undefined))
				throw new Error(`Manifest entry ${index} must name exactly one fixture or matrix`);
			return {
				receiptPath: nonempty(entry.receiptPath, `Entry ${index} receiptPath`),
				consumer: nonempty(entry.consumer, `Entry ${index} consumer`),
				...(fixture === undefined ? { matrix: matrix! } : { fixture }),
				commitSha: nonempty(entry.commitSha, `Entry ${index} commitSha`),
				buildArtifactHash: nonempty(
					entry.buildArtifactHash,
					`Entry ${index} buildArtifactHash`,
				),
			};
		}),
	};
}

const identity = (entry: ExpectedReceipt): string =>
	`${entry.consumer}\0${entry.fixture === undefined ? `matrix:${entry.matrix}` : `fixture:${entry.fixture}`}`;

function assertUnique(entries: readonly ExpectedReceipt[]): void {
	const paths = new Set<string>();
	const identities = new Set<string>();
	for (const entry of entries) {
		if (paths.has(entry.receiptPath))
			throw new Error(`Manifest has duplicate receipt path: ${entry.receiptPath}`);
		paths.add(entry.receiptPath);
		const key = identity(entry);
		if (identities.has(key))
			throw new Error(`Manifest has duplicate consumer fixture/matrix identity: ${key}`);
		identities.add(key);
	}
}

function receiptFile(root: string, path: string): string {
	if (isAbsolute(path)) throw new Error(`Receipt path must be relative: ${path}`);
	const file = resolve(root, path);
	const prefix = resolve(root) + sep;
	if (!file.startsWith(prefix)) throw new Error(`Receipt path escapes the receipt root: ${path}`);
	return file;
}

export async function checkReceiptSet(
	manifestValue: unknown,
	receiptRoot: string,
): Promise<{ readonly checked: number }> {
	const manifest = validateManifest(manifestValue);
	assertUnique(manifest.entries);
	for (const entry of manifest.entries) {
		let text: string;
		try {
			text = await readFile(receiptFile(receiptRoot, entry.receiptPath), 'utf8');
		} catch (error) {
			throw new Error(`Required receipt ${entry.receiptPath} could not be read`, {
				cause: error,
			});
		}
		let value: unknown;
		try {
			value = JSON.parse(text);
		} catch (error) {
			throw new Error(`Required receipt ${entry.receiptPath} is malformed JSON`, {
				cause: error,
			});
		}
		const report = validateVerdictReport(value);
		if (!report.passed)
			throw new Error(`Required receipt ${entry.receiptPath} has a failed verdict`);
		if (report.results.some((result) => result.status !== 'pass'))
			throw new Error(`Required receipt ${entry.receiptPath} contains a non-pass result`);
		const metadata = report.metadata;
		for (const field of ['consumer', 'commitSha', 'buildArtifactHash'] as const)
			if (metadata?.[field] !== entry[field])
				throw new Error(
					`Required receipt ${entry.receiptPath} metadata ${field} does not match the manifest`,
				);
		const identityField = entry.fixture === undefined ? 'matrix' : 'fixture';
		if (metadata?.[identityField] !== entry[identityField])
			throw new Error(
				`Required receipt ${entry.receiptPath} metadata ${identityField} does not match the manifest`,
			);
	}
	return { checked: manifest.entries.length };
}

export async function checkReceiptManifestFile(manifestPath: string, receiptRoot: string) {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
	return checkReceiptSet(manifest, receiptRoot);
}
