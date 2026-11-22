// Compiles each yardstick app's pages for the phones with compileNativeApp and writes, per screen, whether it builds and
// each refusal the compiler reported: `node packages/mobile/apps/measure.ts [--out <file.json>] [--styles]`. With
// `--styles`, each screen that builds also runs through Dragon (MARKLESS_DRAGON_DIR), since a styled screen reaches a
// phone only with a style export.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CompilerDiagnostic } from '@markless/compiler';
import { buildRouteManifestFromFileIds } from '@markless/router';
import { compileNativeApp } from '../src/compile.ts';
import { dragonStyleExport } from '../src/style-export.ts';
import { readAppConfig, readRelativeStylesheet, readWorkspaceModule } from '../src/harness/rung.ts';

export const APPS = ['notes', 'shop', 'checkin'] as const;
export const appsDir = import.meta.dirname;
const repoRoot = resolve(appsDir, '..', '..', '..');

export type Refusal = {
	readonly code: string;
	readonly message: string;
	readonly file: string | null;
	readonly line: number | null;
};

export type ScreenResult = {
	readonly page: string;
	readonly route: string;
	readonly builds: boolean;
	readonly refusals: ReadonlyArray<Refusal>;
	/** Handlers a phone runs only from a hardware keyboard: reported, not refusals. */
	readonly keyboardOnly: number;
	/**
	 * With `--styles`, for a screen that builds: whether Dragon made its style export (`true`), the reason it refused
	 * (a string), or `null` for a screen with no styles.
	 */
	readonly styled?: true | string | null;
};

function pageFiles(dir: string, under = 'pages'): string[] {
	return readdirSync(join(dir, under), { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? pageFiles(dir, join(under, entry.name))
			: entry.name.endsWith('.tsrx')
				? [join(under, entry.name)]
				: [],
	);
}

function lineOf(diagnostic: CompilerDiagnostic): number | null {
	const span = diagnostic.primarySpan;
	if (!span) return null;
	const file = resolve(repoRoot, span.filename);
	if (!existsSync(file)) return null;
	let line = 1;
	const source = readFileSync(file, 'utf8');
	for (let index = 0; index < span.start && index < source.length; index++)
		if (source[index] === '\n') line++;
	return line;
}

export async function measureApp(app: string, styles = false): Promise<ScreenResult[]> {
	const dir = join(appsDir, app);
	const pages = pageFiles(dir);
	const document = join(dir, 'document.tsrx');
	const routes = buildRouteManifestFromFileIds(pages).routes;
	let build: Awaited<ReturnType<typeof compileNativeApp>>;
	try {
		build = await compileNativeApp({
			pages: pages.map((page) => ({
				page,
				filename: relative(repoRoot, join(dir, page)),
				source: readFileSync(join(dir, page), 'utf8'),
			})),
			...(existsSync(document)
				? {
						document: {
							filename: relative(repoRoot, document),
							source: readFileSync(document, 'utf8'),
						},
					}
				: {}),
			readModule: readWorkspaceModule,
			readStylesheet: readRelativeStylesheet,
			...readAppConfig(dir),
			partial: true,
		});
	} catch (error) {
		const thrown = {
			code: 'THROWN',
			message: (error as Error).message,
			file: null,
			line: null,
		};
		return routes.map((route) => ({
			page: route.file,
			route: route.pattern,
			builds: false,
			refusals: [thrown],
			keyboardOnly: 0,
		}));
	}
	// Dragon's answer for each styled screen that builds, by route pattern.
	const styledBy = new Map<string, true | string>();
	if (styles) {
		const scratch = mkdtempSync(join(tmpdir(), 'markless-measure-'));
		try {
			for (const input of build.styleInputs) {
				const file = join(scratch, `${styledBy.size}.json`);
				writeFileSync(file, JSON.stringify(input.input));
				try {
					dragonStyleExport(file);
					styledBy.set(input.pattern, true);
				} catch (error) {
					const reasons = (error as Error).message.split('\n').slice(1).join(' ').trim();
					styledBy.set(input.pattern, reasons || (error as Error).message);
				}
			}
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	}
	return routes.map((route) => {
		const own = build.diagnostics.filter((diagnostic) => diagnostic.page === route.file);
		const errors = own.filter((diagnostic) => diagnostic.severity === 'error');
		const refusals = new Map<string, Refusal>();
		for (const diagnostic of errors) {
			const refusal = {
				code: diagnostic.code,
				message: diagnostic.message,
				file: diagnostic.primarySpan?.filename ?? null,
				line: lineOf(diagnostic),
			};
			refusals.set(JSON.stringify(refusal), refusal);
		}
		return {
			page: route.file,
			route: route.pattern,
			builds: errors.length === 0,
			refusals: [...refusals.values()],
			keyboardOnly: own.filter(
				(diagnostic) => diagnostic.code === 'MARKLESS_NATIVE_KEYBOARD_ONLY',
			).length,
			...(styles && errors.length === 0
				? { styled: styledBy.get(route.pattern) ?? null }
				: {}),
		};
	});
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { out: { type: 'string' }, styles: { type: 'boolean' } },
	});
	const report: Record<string, ScreenResult[]> = {};
	for (const app of APPS) {
		report[app] = await measureApp(app, values.styles === true);
		const built = report[app].filter((screen) => screen.builds).length;
		const runs = report[app].filter(
			(screen) =>
				screen.builds && screen.styled !== undefined && typeof screen.styled !== 'string',
		).length;
		console.error(
			`${app}: ${built} of ${report[app].length} screens build${values.styles ? `, ${runs} with their styles` : ''}`,
		);
	}
	const text = `${JSON.stringify(report, null, '\t')}\n`;
	if (values.out) writeFileSync(values.out, text);
	else process.stdout.write(text);
}
