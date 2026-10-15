import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMON_FILES, commandFor, SCRIPTS, STARTERS } from './facts.ts';

const templates = new URL('../../../../packages/cli/templates/', import.meta.url);
const cli = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/start/walkthrough.mdx', import.meta.url), 'utf8');

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
		expect(cli).toContain("`${options.packageManager} run dev`");
		expect(commandFor('app')).toBe('npm create markless@latest my-app -- --yes --starter app');
	});

	it('shows the create figure and no bare tables', () => {
		expect(page).toContain('<CreateAnatomy />');
		expect(page).not.toMatch(/\| --- \|/);
	});
});

