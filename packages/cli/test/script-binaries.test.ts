import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { afterEach, expect, test } from 'vitest';
import { CreateProgram, STARTER_CHOICES, type ProjectFormat, type Starter } from '../src/index.ts';
import { createNodeRuntime } from '../src/node-runtime.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const requireFrom = createRequire(join(repoRoot, 'packages/router/package.json'));
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const combinations: ReadonlyArray<readonly [ProjectFormat, string, Starter]> = (
	[
		['node', 'npm/11.6.2'],
		['node', 'pnpm/10.33.2'],
		['node', 'yarn/4.9.0'],
		['bun', 'bun/1.3.0'],
		['deno', 'deno/2.8.3'],
	] as const
).flatMap(([format, agent]) =>
	STARTER_CHOICES.map((choice) => [format, agent, choice.value] as const),
);

// `npm:@scope/name@1.2.3` (deno imports and npm aliases) names the package that actually installs.
function installedName(name: string, spec: string): string {
	const alias = /^npm:(@?[^@]+)/.exec(spec);
	return alias ? alias[1]! : name;
}

// Reads the bins of the package this checkout installs under `name`, after checking it is the one the scaffold asks for.
function binariesOf(name: string, spec: string): string[] {
	const workspaceManifest = name.startsWith('@markless/')
		? join(repoRoot, 'packages', name.slice('@markless/'.length), 'package.json')
		: undefined;
	const manifestPath =
		workspaceManifest && existsSync(workspaceManifest)
			? workspaceManifest
			: requireFrom.resolve(`${name}/package.json`, { paths: [repoRoot] });
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
		name: string;
		bin?: string | Record<string, string>;
	};
	expect(manifest.name, `${name}: ${spec}`).toBe(installedName(name, spec));
	if (typeof manifest.bin === 'string') return [manifest.name.replace(/^@[^/]+\//, '')];
	return Object.keys(manifest.bin ?? {});
}

test.each(combinations)(
	'every script in a %s app created by %s (%s starter) runs a binary its declared dependencies provide',
	async (format, userAgent, starter) => {
		const root = await mkdtemp(join(tmpdir(), 'markless-scripts-'));
		roots.push(root);
		const printed: string[] = [];
		await new CreateProgram().run(
			['app', '--format', format, '--starter', starter, '--no-install', '--no-git'],
			createNodeRuntime({
				cwd: root,
				env: { npm_config_user_agent: userAgent },
				isTTY: false,
				stdout: { write: (chunk: string) => void printed.push(chunk) },
				stderr: { write: () => undefined },
			}),
		);
		const appRoot = join(root, 'app');
		const manifestFile = format === 'deno' ? 'deno.json' : 'package.json';
		const manifest = JSON.parse(await readFile(join(appRoot, manifestFile), 'utf-8')) as {
			scripts?: Record<string, string>;
			tasks?: Record<string, string>;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			imports?: Record<string, string>;
		};
		const scripts = manifest.scripts ?? manifest.tasks ?? {};
		const declared = {
			...manifest.dependencies,
			...manifest.devDependencies,
			...manifest.imports,
		};
		const provided = new Set([
			// `bun run` puts a `node` shim on PATH, so a bun app's `node` scripts run under bun.
			...(format === 'deno' ? ['deno'] : format === 'bun' ? ['bun', 'node'] : ['node']),
			...Object.entries(declared).flatMap(([name, spec]) => binariesOf(name, spec)),
		]);

		expect(Object.keys(scripts)).toContain('dev');
		for (const [name, command] of Object.entries(scripts)) {
			const binary = command.trim().split(/\s+/)[0]!;
			expect(provided, `${manifestFile} ${name}: ${command}`).toContain(binary);
		}

		const manager = userAgent.slice(0, userAgent.indexOf('/'));
		const runDev = format === 'deno' ? 'deno task dev' : `${manager} run dev`;
		expect(printed.join('')).toContain(`\n  ${runDev}\n`);
		const readme = await readFile(join(appRoot, 'README.md'), 'utf-8');
		expect(readme).toContain(`\n${runDev}\n`);
	},
	30_000,
);
