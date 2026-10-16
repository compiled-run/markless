import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandVariants, type CommandKind } from './commands.ts';
import { tabsInk } from './tabs-ink.ts';
import { COMMON_FILES, DEFAULT_APP, commandFor, createCommand, MANAGERS, NO_DENO_TASK, scriptCommand, SCRIPTS, scriptsFor, STARTERS } from './facts.ts';

const templates = new URL('../../../../packages/cli/templates/', import.meta.url);
const cli = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/start/walkthrough.mdx', import.meta.url), 'utf8');
const cliPackage = JSON.parse(readFileSync(new URL('../../../../packages/cli/package.json', import.meta.url), 'utf8')) as { name: string };

// Under the test runner's resolve conditions shiki loads a wasm build Node cannot run, so the fences render in a plain child.
function renderBashFences(codes: readonly string[]): string[] {
	const script = `import { renderFence } from ${JSON.stringify(new URL('../../../tooling/highlight-code.ts', import.meta.url).href)};
const out = [];
for (const code of ${JSON.stringify(codes)}) out.push(await renderFence(code, 'bash'));
process.stdout.write(JSON.stringify(out));`;
	return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) as string[];
}

function filesUnder(dir: URL, prefix = ''): string[] {
	return readdirSync(dir).flatMap((name) => {
		const url = new URL(name, dir);
		return statSync(url).isDirectory() ? filesUnder(new URL(name + '/', dir), prefix + name + '/') : [prefix + name];
	});
}

const starterDirs: Record<string, string[]> = { minimal: ['minimal'], app: ['minimal', 'app'], 'full-stack': ['minimal', 'app', 'full-stack'], docs: ['docs'] };

describe('the Walkthrough facts match create-markless', () => {
	it('lists the starter package.json scripts, in order', () => {
		const pkg = JSON.parse(readFileSync(new URL('formats/node/package.json', templates), 'utf8')) as { scripts: Record<string, string> };
		expect(SCRIPTS.map((script) => script.name)).toEqual(Object.keys(pkg.scripts));
	});

	it('lists exactly the files each starter writes on top of the common ones', () => {
		expect(cli).toMatch(/return \[new URL\('starters\/docs\/', TEMPLATE_ROOT\)\];/);
		expect(cli).toMatch(/const directories = \[new URL\('starters\/minimal\/', TEMPLATE_ROOT\)\];/);
		for (const starter of STARTERS) {
			const written = starterDirs[starter.id]!.flatMap((dir) => filesUnder(new URL('starters/' + dir + '/', templates)));
			expect([...starter.files].sort()).toEqual([...new Set(written)].sort());
		}
	});

	it('names the common files and folders that exist in the template', () => {
		for (const file of COMMON_FILES) {
			const path = file === 'package.json' ? 'formats/node/package.json' : 'common/' + (file === '.gitignore' ? 'gitignore' : file);
			expect(existsSync(new URL(path, templates)), file).toBe(true);
		}
	});

	it('uses the menu labels and flags of the CLI', () => {
		for (const starter of STARTERS) expect(cli).toContain(`value: '${starter.id}',\n\t\tlabel: '${starter.label}',`);
		expect(cli).toContain("message: 'What are you building today?'");
		expect(cli).toContain(`const DEFAULT_TARGET = '${DEFAULT_APP}';`);
		expect(cli).toContain("`${options.packageManager} run dev`");
		expect(commandFor('app')).toBe('npm create markless@latest my-app -- --yes --starter app');
	});

	it('shows the create figure and no bare tables', () => {
		expect(page).toContain('<CreateAnatomy />');
		expect(page).not.toMatch(/\| --- \|/);
	});
});

describe('the package-manager commands', () => {
	it('offers the package managers the CLI knows', () => {
		const known = /export type PackageManager = ([^;]+);/.exec(cli)?.[1];
		expect(known?.split(' | ').map((name) => name.slice(1, -1))).toEqual(MANAGERS.map((manager) => manager.id));
	});

	it('runs create-markless through each manager', () => {
		expect(cliPackage.name).toBe('create-markless');
		expect(MANAGERS.map((manager) => createCommand(manager.id))).toEqual([
			'npm create markless@latest',
			'pnpm create markless',
			'yarn create markless',
			'bun create markless',
			'deno run -A npm:create-markless',
		]);
		expect(commandFor('app', 'pnpm')).toBe('pnpm create markless my-app --yes --starter app');
		expect(commandFor('app', 'deno')).toBe('deno run -A npm:create-markless my-app --yes --starter app');
	});

	it('runs scripts the way the CLI tells you to run dev', () => {
		expect(cli).toContain("options.format === 'deno' ? 'deno task dev' : `${options.packageManager} run dev`");
		for (const manager of MANAGERS) expect(scriptCommand(manager.id, 'dev')).toBe(manager.id === 'deno' ? 'deno task dev' : `${manager.id} run dev`);
	});

	it('leaves out the scripts a Deno app has no task for', () => {
		const deno = JSON.parse(readFileSync(new URL('formats/deno/deno.json', templates), 'utf8')) as { tasks: Record<string, string> };
		expect(scriptsFor('deno').map((script) => script.name)).toEqual(Object.keys(deno.tasks));
		expect(SCRIPTS.filter((script) => !(script.name in deno.tasks)).map((script) => script.name)).toEqual(NO_DENO_TASK);
	});

	it('colours every block exactly as the site highlights a bash fence', () => {
		const variants = (['create', 'dev', 'scripts', 'starters'] as CommandKind[]).flatMap((kind) => commandVariants(kind));
		const rendered = renderBashFences(variants.map((variant) => variant.code));
		for (const [index, variant] of variants.entries()) {
			const fenced = rendered[index]!.split('<span class="line">').slice(1).map((line) => [...line.matchAll(/<span style="([^"]*)">([^<]*)<\/span>/g)].map(([, style, text]) => [style, text]));
			expect(variant.lines.map((line) => line.runs.map((run) => [run.style, run.text])), variant.code).toEqual(fenced);
		}
	});

	it('styles a block for every manager and draws a tab for each', () => {
		const source = readFileSync(new URL('commands.tsrx', import.meta.url), 'utf8');
		for (const manager of MANAGERS) expect(source, manager.id).toContain(`html[data-pm='${manager.id}'] .variant[data-pm='${manager.id}']`);
		expect(tabsInk().map((tab) => tab.id)).toEqual(MANAGERS.map((manager) => manager.id));
	});

	it('puts every manager command on the page through the components', () => {
		expect(page).toContain('<CreateCommand />');
		for (const kind of ['dev', 'scripts', 'starters']) expect(page).toContain(`<Commands kind="${kind}" />`);
		expect(page).not.toMatch(/^npm (create|run) /m);
	});
});


describe('the package-manager tabs ink', () => {
	it('draws the same tabs every run and freezes them (run with -u after editing)', async () => {
		expect(tabsInk()).toEqual(tabsInk());
		const module = `// Written by walkthrough.test.ts from tabs-ink.ts. Run \`vp test -u\` to refresh.
import type { tabsInk } from './tabs-ink.ts';

export const tabsArt: ReturnType<typeof tabsInk> = ${JSON.stringify(tabsInk(), null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./tabs-ink.art.ts');
	});
});
