// Runs Dragon's style command on a component's style input and returns the export. Dragon is a checkout named by
// MARKLESS_DRAGON_DIR, never a package dependency; dragon.json pins the Dragon master commit it must contain.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { arch, homedir, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { cacheRoot } from './harness/tools.ts';
import pin from '../dragon.json' with { type: 'json' };

const execFileAsync = promisify(execFile);

/** The Dragon package script that turns `markless.native-style-input/0` into `dragon.native-style-export/1`. */
export const DRAGON_STYLE_SCRIPT = 'markless:style-export';

/** The Dragon repository and the master commit this Markless builds against; CI checks Dragon out at this commit. */
export const DRAGON_PIN: { readonly repository: string; readonly commit: string } = pin;

export const dragonDir = (): string =>
	process.env.MARKLESS_DRAGON_DIR ?? join(homedir(), 'wt', 'dragon', 'native-dragon-styles');

/** Throws unless the checkout at `dir` contains the pinned Dragon commit. */
export function assertDragonPin(dir: string = dragonDir()): void {
	try {
		execFileSync('git', ['-C', dir, 'merge-base', '--is-ancestor', DRAGON_PIN.commit, 'HEAD'], {
			stdio: 'ignore',
		});
	} catch {
		throw new Error(
			`${dir} does not contain ${DRAGON_PIN.repository}@${DRAGON_PIN.commit} (packages/mobile/dragon.json); check out that commit or a later one and set MARKLESS_DRAGON_DIR to it`,
		);
	}
}

/** Part of every style export cache key; bumped when what the key covers or the cached folder's layout changes. */
export const STYLE_EXPORT_CACHE_FORMAT = 'style-export-cache/1';

type ExportedFonts = {
	readonly fonts?: ReadonlyArray<{
		readonly id: string;
		readonly file: string;
		readonly from: string;
	}>;
};
type InputFonts = { readonly fonts?: ReadonlyArray<{ readonly file: string }> };

/**
 * What Dragon's export of one input depends on: Dragon's commit, the flags, the machine's system fonts (by OS release), the
 * input's path (the export names it) and bytes, and the bytes of every font file the input names. No key for a Dragon checkout
 * with uncommitted changes.
 */
export function styleExportKey(inputPath: string, dir: string, plan: boolean): string | undefined {
	// A git hook's GIT_DIR and GIT_INDEX_FILE would point these at the hook's repository, not Dragon's.
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
	);
	const git = (args: string[]) =>
		execFileSync('git', ['-C', dir, ...args], {
			encoding: 'utf8',
			env,
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	if (git(['status', '--porcelain']).length > 0) return undefined;
	const input = readFileSync(inputPath);
	const hash = createHash('sha256').update(
		`${STYLE_EXPORT_CACHE_FORMAT}\0${git(['rev-parse', 'HEAD'])}\0${plan}\0${platform()} ${release()} ${arch()}\0${resolve(inputPath)}\0`,
	);
	hash.update(input).update('\0');
	for (const font of (JSON.parse(input.toString('utf8')) as InputFonts).fonts ?? []) {
		const file = resolve(dirname(inputPath), font.file);
		hash.update(`${font.file}\0`);
		hash.update(existsSync(file) ? readFileSync(file) : 'missing').update('\0');
	}
	return hash.digest('hex');
}

const cacheDir = (key: string) => join(cacheRoot(), 'style-exports', key);

/**
 * The export for one style input file from the Dragon checkout, or from the cache when the same inputs were exported before;
 * throws with Dragon's reasons when it refuses. Dragon writes the fonts it decodes beside the input, and a cached export puts
 * them back there. `plan`: each target also carries Dragon's layout plan, so a phone lays the page out at its own size.
 */
export async function dragonStyleExport(
	inputPath: string,
	dir: string = dragonDir(),
	plan = false,
): Promise<Uint8Array> {
	const manifest = join(dir, 'package.json');
	const scripts = existsSync(manifest)
		? ((JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> })
				.scripts ?? {})
		: {};
	if (!scripts[DRAGON_STYLE_SCRIPT])
		throw new Error(
			`${dir} has no \`${DRAGON_STYLE_SCRIPT}\` script; set MARKLESS_DRAGON_DIR to a Dragon checkout at ${DRAGON_PIN.repository}@${DRAGON_PIN.commit}`,
		);
	assertDragonPin(dir);
	const key = styleExportKey(inputPath, dir, plan);
	const inputDir = dirname(resolve(inputPath));
	if (key && existsSync(join(cacheDir(key), 'export.json'))) {
		const cached = cacheDir(key);
		if (existsSync(join(cached, 'decoded')))
			cpSync(join(cached, 'decoded'), inputDir, { recursive: true });
		return readFileSync(join(cached, 'export.json'));
	}
	const scratch = mkdtempSync(join(tmpdir(), 'markless-style-'));
	try {
		const out = join(scratch, 'native-style.json');
		try {
			await execFileAsync(
				'pnpm',
				[
					'--silent',
					'--dir',
					dir,
					'run',
					DRAGON_STYLE_SCRIPT,
					'--',
					resolve(inputPath),
					out,
					...(plan ? ['--plan'] : []),
				],
				{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
			);
		} catch (error) {
			const failed = error as { stdout?: string; stderr?: string };
			throw new Error(
				`Dragon refused the styles:\n${[failed.stdout, failed.stderr].filter(Boolean).join('\n').trim()}`,
			);
		}
		const bytes = readFileSync(out);
		// Exports beside one another decode the same font to the same file, so a file is kept only when its bytes are its id.
		const decoded = ((JSON.parse(bytes.toString('utf8')) as ExportedFonts).fonts ?? [])
			.filter((font) => font.from === 'input')
			.map((font) => ({ font, bytes: readFileSync(join(inputDir, font.file)) }));
		const whole = decoded.every(
			({ font, bytes: file }) =>
				font.id === `sha256:${createHash('sha256').update(file).digest('hex')}`,
		);
		if (key && whole) {
			const staging = join(scratch, 'cache');
			mkdirSync(join(staging, 'decoded'), { recursive: true });
			for (const { font, bytes: file } of decoded) {
				const to = join(staging, 'decoded', font.file);
				mkdirSync(dirname(to), { recursive: true });
				writeFileSync(to, file);
			}
			writeFileSync(join(staging, 'export.json'), bytes);
			mkdirSync(dirname(cacheDir(key)), { recursive: true });
			try {
				renameSync(staging, cacheDir(key));
			} catch (error) {
				// Another build stored the same export first.
				if (!existsSync(join(cacheDir(key), 'export.json'))) throw error;
			}
		}
		return bytes;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
