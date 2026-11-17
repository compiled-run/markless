// Writes a rung's Dragon style export: `node packages/mobile/src/style-export.ts <rung folder>...` with MARKLESS_DRAGON_DIR
// naming a Dragon checkout. Each folder gets native-style-input.json (from the compiler's facts), native-style.json
// (dragon.native-style-export/1, from Dragon) and native-style.source.json (the Dragon commit it came from).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileNativeComponent } from './compile.ts';
import { nativeStyleInput } from './style-input.ts';

/** The Dragon command that turns a style input into an export; the contract names it. */
const DRAGON_TOOL = 'examples/markless-counter/tools/markless-style.ts';

const dragon = process.env.MARKLESS_DRAGON_DIR;
if (!dragon) throw new Error('set MARKLESS_DRAGON_DIR to a Dragon checkout');
const folders = process.argv.slice(2);
if (folders.length === 0) throw new Error('usage: style-export.ts <rung folder>...');
const commit = execFileSync('git', ['-C', dragon, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
for (const folder of folders.map((f) => resolve(f))) {
	const component = join(folder, 'App.tsrx');
	const build = await compileNativeComponent({ filename: component, source: readFileSync(component, 'utf8') });
	if (!build.payload) throw new Error(`${folder}: ${build.diagnostics.map((d) => d.message).join('; ')}`);
	const inputPath = join(folder, 'native-style-input.json');
	writeFileSync(inputPath, `${JSON.stringify(nativeStyleInput(build.payload, build.styles), null, '\t')}\n`);
	execFileSync(
		process.execPath,
		['--conditions=dragon-internal', DRAGON_TOOL, inputPath, join(folder, 'native-style.json')],
		{ cwd: dragon, stdio: 'inherit' },
	);
	writeFileSync(
		join(folder, 'native-style.source.json'),
		`${JSON.stringify({ dragonCommit: commit, tool: DRAGON_TOOL }, null, '\t')}\n`,
	);
}
