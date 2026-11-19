// Compiles each yardstick app's pages for the phones with compileNativeApp and writes, per screen, whether it builds and
// each refusal the compiler reported: `node packages/mobile/apps/measure.ts [--out <file.json>]`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CompilerDiagnostic } from '@markless/compiler';
import { buildRouteManifestFromFileIds } from '@markless/router';
import { compileNativeApp } from '../src/compile.ts';
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

export async function measureApp(app: string): Promise<ScreenResult[]> {
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
			...readAppConfig(join(dir, 'pages')),
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
		};
	});
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { out: { type: 'string' } } });
	const report: Record<string, ScreenResult[]> = {};
	for (const app of APPS) {
		report[app] = await measureApp(app);
		const built = report[app].filter((screen) => screen.builds).length;
		console.error(`${app}: ${built} of ${report[app].length} screens build`);
	}
	const text = `${JSON.stringify(report, null, '\t')}\n`;
	if (values.out) writeFileSync(values.out, text);
	else process.stdout.write(text);
}
