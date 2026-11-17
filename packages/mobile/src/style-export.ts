// Runs Dragon's entry point on a component's style input and returns the export. Tonight's arrangement (the owner decides
// how Markless depends on Dragon): Dragon is a sibling checkout named by DRAGON_DIR, never a package dependency.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** The Dragon entry point that turns `markless.native-style-input/0` into `dragon.native-style-export/1`. */
export const DRAGON_STYLE_ENTRY = 'examples/markless-counter/tools/markless-style.ts';

export const dragonDir = (): string =>
	process.env.DRAGON_DIR ?? join(homedir(), 'wt', 'dragon', 'native-dragon-styles');

/** The export for one style input file, generated now from the Dragon checkout; throws with the reason when it cannot be. */
export function dragonStyleExport(inputPath: string, dir: string = dragonDir()): Uint8Array {
	if (!existsSync(join(dir, DRAGON_STYLE_ENTRY)))
		throw new Error(`Dragon's style entry ${DRAGON_STYLE_ENTRY} is not in ${dir}; set DRAGON_DIR to a Dragon checkout that has it`);
	const scratch = mkdtempSync(join(tmpdir(), 'markless-style-'));
	try {
		const out = join(scratch, 'native-style.json');
		execFileSync(process.execPath, ['--conditions=dragon-internal', DRAGON_STYLE_ENTRY, inputPath, out], {
			cwd: dir,
			stdio: ['ignore', 'ignore', 'inherit'],
		});
		return readFileSync(out);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
