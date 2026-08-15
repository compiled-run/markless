// Version-sync CLI against temporary fixture repositories. The fixture still
// exercises the production script and the real releasePackages() derivation;
// MARKLESS_REPO_ROOT is the only test seam.
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const syncVersionCli = fileURLToPath(new URL('./sync-version.mjs', import.meta.url));

type VersionPackage = {
	readonly name: string;
	readonly version: string;
	readonly private?: boolean;
};

type VersionFixtureSpec = {
	readonly root: string;
	readonly packages: readonly VersionPackage[];
};

type SyncResult = {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
};

function packageDirectory(name: string): string {
	const slash = name.lastIndexOf('/');
	return slash === -1 ? name : name.slice(slash + 1);
}

function manifestJson(manifest: Record<string, unknown>): string {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
}

async function versionFixture(spec: VersionFixtureSpec): Promise<string> {
	const fixture = await mkdtemp(join(tmpdir(), 'markless-version-sync-'));
	await writeFile(join(fixture, 'package.json'), manifestJson({ version: spec.root }));
	for (const pkg of spec.packages) {
		const directory = join(fixture, 'packages', packageDirectory(pkg.name));
		await mkdir(directory, { recursive: true });
		const manifest: Record<string, unknown> = {
			name: pkg.name,
			version: pkg.version,
		};
		if (pkg.private === true) {
			manifest.private = true;
		}
		await writeFile(join(directory, 'package.json'), manifestJson(manifest));
	}
	return fixture;
}

async function versionOf(fixture: string, relativePath: string): Promise<string> {
	const manifest = JSON.parse(await readFile(join(fixture, relativePath), 'utf8')) as {
		version?: string;
	};
	if (typeof manifest.version !== 'string') {
		throw new Error(`${relativePath} has no version`);
	}
	return manifest.version;
}

async function runSync(
	fixture: string,
	args: readonly string[] = [],
	options: { readonly reject?: boolean } = {},
): Promise<SyncResult> {
	const result = spawnSync(process.execPath, [syncVersionCli, ...args], {
		encoding: 'utf8',
		env: { ...process.env, MARKLESS_REPO_ROOT: fixture },
	});
	const wrapped: SyncResult = {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
	if (options.reject !== false && wrapped.exitCode !== 0) {
		throw new Error(
			`sync-version exited ${wrapped.exitCode}\n${wrapped.stdout}\n${wrapped.stderr}`,
		);
	}
	return wrapped;
}

test('sync-version rewrites every derived release manifest to the root version', async () => {
	const fixture = await versionFixture({
		root: '1.2.3',
		packages: [
			{ name: '@markless/a', version: '0.0.1' },
			{ name: '@markless/private', version: '9.9.9', private: true },
		],
	});
	await runSync(fixture);
	expect(await versionOf(fixture, 'packages/a/package.json')).toBe('1.2.3');
	expect(await versionOf(fixture, 'packages/private/package.json')).toBe('9.9.9');
});

test('--check reports drift without writing', async () => {
	const fixture = await versionFixture({
		root: '1.2.3',
		packages: [{ name: '@markless/a', version: '0.0.1' }],
	});
	const before = await readFile(join(fixture, 'packages/a/package.json'), 'utf8');
	const result = await runSync(fixture, ['--check'], { reject: false });
	expect(result.exitCode).toBe(1);
	expect(result.stderr).toContain('@markless/a');
	expect(await readFile(join(fixture, 'packages/a/package.json'), 'utf8')).toBe(before);
});
