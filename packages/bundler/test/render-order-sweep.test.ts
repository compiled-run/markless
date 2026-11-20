import { execFile } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
import { componentsRoot, type Divergence } from './helpers/render-order-census.ts';

const census = resolve(import.meta.dirname, 'helpers/render-order-census.ts');
// A dev server holds every module and compile of the scenarios it loads until its process exits, so the census runs
// in child processes one after another, each over at most this many scenarios, and never in this worker.
const SCENARIOS_PER_PROCESS = 180;

// method.tsrx does not compile; the study excluded it and so does this sweep.
const EXCLUDED = new Set(['method.tsrx']);

function scenarioPaths(): ReadonlyArray<string> {
	const src = resolve(componentsRoot, 'src');
	if (!existsSync(src)) return [];
	return readdirSync(src, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((family) => {
			const dir = resolve(src, family.name, 'scenarios');
			if (!existsSync(dir)) return [];
			return readdirSync(dir)
				.filter((file) => file.endsWith('.tsrx') && !EXCLUDED.has(file))
				.map((file) => `src/${family.name}/scenarios/${file}`);
		})
		.sort();
}

async function censusInChildProcesses(paths: ReadonlyArray<string>): Promise<ReadonlyArray<Divergence>> {
	const found: Divergence[] = [];
	for (let at = 0; at < paths.length; at += SCENARIOS_PER_PROCESS) {
		const { stdout } = await promisify(execFile)(
			process.execPath,
			[census, ...paths.slice(at, at + SCENARIOS_PER_PROCESS)],
			{ cwd: componentsRoot, maxBuffer: 64 << 20 },
		);
		found.push(...(JSON.parse(stdout) as Divergence[]));
	}
	return found;
}


// The four shapes that exercise the census's hard cases: a repeat whose rows
// come from data, a toaster's custom content, an accordion, and a select whose
// parts nest several levels deep.
const REPRESENTATIVE = [
	'src/navbar/scenarios/items-from-data.tsrx',
	'src/toaster/scenarios/basic.tsrx',
	'src/accordion/scenarios/basic.tsrx',
	'src/select/scenarios/basic.tsrx',
] as const;

describe('render-order oracle', () => {
	test('representative scenarios: every served locator index names its own element', async () => {
		expect(await censusInChildProcesses(REPRESENTATIVE)).toEqual([]);
	}, 180_000);

	// Every scenario, not a sample.
	test('full sweep: no scenario serves a locator index that names another element', async () => {
		expect(await censusInChildProcesses(scenarioPaths())).toEqual([]);
	}, 900_000);

	test('the sweep actually covers the family scenarios, so an empty pass is not vacuous', () => {
		// A silent drop to zero paths would make every assertion above trivially
		// true; the count is the witness that the sweep still has a corpus.
		expect(scenarioPaths().length).toBeGreaterThan(150);
	});
});
