// Runs Dragon's style command on a component's style input and returns the export. Tonight's arrangement (the owner decides
// how Markless depends on Dragon): Dragon is a sibling checkout named by MARKLESS_DRAGON_DIR, never a package dependency.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** The Dragon package script that turns `markless.native-style-input/0` into `dragon.native-style-export/1`. */
export const DRAGON_STYLE_SCRIPT = 'markless:style-export';

export const dragonDir = (): string =>
	process.env.MARKLESS_DRAGON_DIR ?? join(homedir(), 'wt', 'dragon', 'native-dragon-styles');

/** The export for one style input file, generated now from the Dragon checkout; throws with Dragon's reasons when it refuses. */
export function dragonStyleExport(inputPath: string, dir: string = dragonDir()): Uint8Array {
	const manifest = join(dir, 'package.json');
	const scripts = existsSync(manifest)
		? ((JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {})
		: {};
	if (!scripts[DRAGON_STYLE_SCRIPT])
		throw new Error(
			`${dir} has no \`${DRAGON_STYLE_SCRIPT}\` script; set MARKLESS_DRAGON_DIR to a Dragon checkout of cw/native-dragon-styles`,
		);
	const scratch = mkdtempSync(join(tmpdir(), 'markless-style-'));
	try {
		const out = join(scratch, 'native-style.json');
		try {
			execFileSync('pnpm', ['--silent', '--dir', dir, 'run', DRAGON_STYLE_SCRIPT, '--', resolve(inputPath), out], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		} catch (error) {
			const failed = error as { stdout?: string; stderr?: string };
			throw new Error(`Dragon refused the styles:\n${[failed.stdout, failed.stderr].filter(Boolean).join('\n').trim()}`);
		}
		return readFileSync(out);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
