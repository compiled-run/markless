import { rolldown, type Plugin } from 'rolldown';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, expect, test } from 'vitest';
import { dynamicImportersOf, isPlannedCoLocation } from '../src/build/planned-co-location.ts';

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { force: true, recursive: true });
});

// Two import() targets that page.js also imports statically; the plan packs only `planned.js` with page.js.
async function buildWithPlan(): Promise<string[]> {
	const dir = await mkdtemp(join(await realpath(tmpdir()), 'markless-co-location-'));
	dirs.push(dir);
	await writeFile(
		join(dir, 'page.js'),
		[
			"import { planned } from './planned.js';",
			"import { unplanned } from './unplanned.js';",
			"export const later = () => [import('./planned.js'), import('./unplanned.js')];",
			'console.log(planned, unplanned);',
		].join('\n'),
	);
	await writeFile(join(dir, 'planned.js'), 'export const planned = 1;');
	await writeFile(join(dir, 'unplanned.js'), 'export const unplanned = 2;');
	const packs = new Map([
		[join(dir, 'page.js'), 'page-pack'],
		[join(dir, 'planned.js'), 'page-pack'],
	]);
	let importers = new Map<string, readonly string[]>();
	const plan: Plugin = {
		name: 'test-pack-plan',
		buildEnd() {
			const modules = new Map(
				[...this.getModuleIds()].map((id) => {
					const info = this.getModuleInfo(id)!;
					return [
						id,
						{ dependencies: info.importedIds, dynamicDependencies: info.dynamicallyImportedIds },
					];
				}),
			);
			importers = dynamicImportersOf(modules);
		},
		onLog(_level, log) {
			if (isPlannedCoLocation(log, (id) => packs.get(id), importers)) return false;
		},
	};
	const warned: string[] = [];
	const bundle = await rolldown({
		input: join(dir, 'page.js'),
		plugins: [plan],
		onLog(_level, log) {
			if (log.code === 'INEFFECTIVE_DYNAMIC_IMPORT') warned.push(log.id!.slice(dir.length + 1));
		},
	});
	await bundle.generate({ format: 'esm' });
	await bundle.close();
	return warned;
}

test('an import() target packed with its importer by the plan is not reported, an unplanned one still is', async () => {
	expect(await buildWithPlan()).toEqual(['unplanned.js']);
});
