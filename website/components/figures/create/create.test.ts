import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CreateProgram, PROJECT_FORMAT_CHOICES, STARTER_CHOICES, type ProgramRuntime } from '../../../../packages/cli/src/index.ts';
import { choose, COMMAND, COMMON_FILES, cursorRow, describe as say, dropOrder, enter, filesFor, focusRow, type Format, FORMATS, ghostFor, isFirstPage, layout, LONGEST, MAX_TYPED, move, MOST_FILES, NOTE_LINES, noteLines, NOTES, PAGE_SLOT, PER, PROMPTS, ROWS, type Run, screen, slipAt, START, type Starter, STARTERS, submit, tabOf, TARGET, transcript, widthOf, wrap, WRAP } from './model.ts';
import { drawing } from './create.ts';
import { recall, remember } from './history.ts';

const scene = drawing();
const cli = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./create-anatomy.tsrx', import.meta.url), 'utf8');

/** Runs the CLI's own execute() with no git, no install and no agents, and returns the paths it writes. */
async function written(starter: Starter, format: Format): Promise<string[]> {
	const paths: string[] = [];
	const path = (p: string | URL) => (p instanceof URL ? fileURLToPath(p) : p);
	const runtime: ProgramRuntime = {
		cwd: () => '/tmp/desk',
		env: {},
		homeDir: '/tmp/home',
		isTTY: false,
		sha256: async () => '',
		fs: {
			atomicCreateFile: async () => true,
			atomicWriteFile: async () => {},
			lstat: async () => null,
			mkdir: async () => {},
			readDirectory: async (dir) => readdirSync(path(dir), { withFileTypes: true }).map((e) => ({ name: e.name, kind: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other' })),
			readFile: async (file) => readFileSync(path(file), 'utf8'),
			stat: async () => null,
			remove: async () => {},
			rmdir: async () => {},
			writeFile: async (file) => {
				paths.push(path(file).replace('/tmp/desk/my-markless-app/', ''));
			},
		},
	};
	await new CreateProgram().execute({ target: TARGET, format, starter, install: false, git: false, force: false, packageManager: 'npm', cwd: '/tmp/desk', agents: [] }, runtime);
	return paths.sort();
}

describe('the create figure plays the real CLI', () => {
	it('asks the CLI prompts in its order, with its labels, hints and defaults', () => {
		const asked = [...cli.matchAll(/message: '([^']+)'/g)].map((m) => m[1]);
		for (const prompt of PROMPTS) expect(asked).toContain(prompt.message);
		const order = PROMPTS.map((p) => cli.indexOf(`message: '${p.message}'`));
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(STARTERS.map(({ value, label, hint }) => ({ value, label, hint }))).toEqual(STARTER_CHOICES.map(({ value, label, hint }) => ({ value, label, hint })));
		expect(FORMATS.map(({ value, label, hint }) => ({ value, label, hint }))).toEqual(PROJECT_FORMAT_CHOICES.map(({ value, label, hint }) => ({ value, label, hint })));
		expect(cli).toContain("const DEFAULT_TARGET = 'my-markless-app';");
		expect(cli).toContain("prompts.intro('Welcome to Markless');");
		expect(cli).toContain("{ value: 'create', label: 'Create app', hint: '' }");
		expect(cli).toContain("initialValue: 'minimal'");
		expect(cli).toContain("'  http://localhost:3000'");
	});

	it('drops exactly the files the CLI writes for every starter and runtime, each with a true one-line note', async () => {
		for (const starter of STARTERS.map((s) => s.value as Starter))
			for (const format of FORMATS.map((f) => f.value as Format)) {
				const files = filesFor(starter, format);
				expect([...files].sort()).toEqual(await written(starter, format));
				expect(files.length).toBeLessThanOrEqual(MOST_FILES);
				expect(isFirstPage(files[0]!)).toBe(true);
				for (const file of files) expect(NOTES[file]).toBeTruthy();
			}
		expect(filesFor('minimal', 'node')).toContain('pages/index.tsrx');
		expect(filesFor('docs', 'node')).not.toContain('pages/index.tsrx');
		expect(filesFor('minimal', 'deno')).toContain('deno.json');
		for (const note of Object.values(NOTES)) expect(noteLines(note).length, note).toBeLessThanOrEqual(NOTE_LINES);
	});

	it('pins each note to what its template really holds', () => {
		const template = (path: string) => readFileSync(new URL(`../../../../packages/cli/templates/${path}`, import.meta.url), 'utf8');
		expect(template('starters/minimal/pages/index.tsrx')).toContain('onClick={() => count++}');
		expect(template('starters/docs/pages/index.mdx')).toContain('This page is an MDX route.');
		expect(template('starters/minimal/document.tsrx')).toContain('<body>{children}</body>');
		expect(template('starters/app/pages/404.tsrx')).toContain('Not found');
		expect(template('starters/app/pages/500.tsrx')).toContain('Something went wrong');
		expect(template('starters/full-stack/api/health.ts')).toContain("new Response('ok')");
		expect(template('starters/full-stack/middleware/request.ts')).toContain("headers.set('x-markless-router', '1')");
		expect(template('starters/docs/pages/docs/[...slug].mdx')).toContain('<DocsLayout');
		expect(template('starters/docs/components/layouts/DocsLayout.tsrx')).toContain('<Sidebar active={active} />');
		expect(template('starters/docs/components/docs/Sidebar.tsrx')).toContain('<nav aria-label="Docs">');
		expect(template('formats/node/package.json')).toContain('"doctor": "node scripts/markless-doctor.mjs"');
		expect(template('formats/deno/deno.json')).toContain('"tasks"');
		expect(template('formats/deno/deno.json')).toContain('"imports"');
		expect(template('common/vite.config.ts')).toContain('plugins: [markless(), router()]');
		expect(template('common/tsconfig.json')).toContain('@markless/typescript-plugin');
		expect(template('common/gitignore')).toContain('node_modules/');
		expect(template('common/scripts/markless-doctor.mjs')).toContain('hint:');
		expect(template('common/.vscode/extensions.json')).toContain('ripple-ts.ripple-ts-vscode-plugin');
		expect(template('common/.vscode/settings.json')).toContain('emmet.includeLanguages');
		expect(template('common/.zed/settings.json')).toContain('@markless/typescript-plugin');
	});

	it('waits at a shell prompt: the command runs on Enter, an empty Enter takes the suggestion, anything else gets one friendly line', () => {
		expect(START.outcome).toBe('idle');
		expect(transcript(START).map((r) => r.kind)).toEqual(['input', 'start']);
		expect(transcript(START)[1]!.hint).toBe('↵ Press Enter to run it');
		expect(ghostFor(START, '')).toBe(COMMAND);
		expect(COMMAND.length).toBeLessThanOrEqual(MAX_TYPED);
		expect(ghostFor(START, 'npm cr')).toBe('eate markless@latest');
		expect(ghostFor(START, 'yarn')).toBe('');
		const wrong = submit(START, 'npm i markless');
		expect(wrong.outcome).toBe('idle');
		expect(transcript(wrong).map((r) => r.text)).toEqual(['npm i markless', `Try ${COMMAND}`, '']);
		expect(say(wrong)).toBe(`Try ${COMMAND}`);
		expect(submit(START, COMMAND)).toEqual(enter(START));
		expect(enter(START).outcome).toBe('asking');
		const row = screen(START, 'npm', 3)[0]!;
		expect(row).toMatchObject({ kind: 'input', text: 'npm', caret: '|', ghost: ' create markless@latest' });
		expect(screen(START, 'npm', 1)[0]).toMatchObject({ text: 'n', after: 'pm', ghost: '' });
	});

	it('asks the prompts like the CLI: Enter picks the highlight, typing names the app, a click picks an option and nothing else', () => {
		let run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		expect(run.outcome).toBe('created');
		expect(run.name).toBe(TARGET);
		expect(move(enter(START), -1).cursor).toBe(3);
		const docs = choose(enter(START), 2);
		expect(docs.picks).toEqual([2]);
		expect(docs.step).toBe(1);
		expect(choose(docs, 0)).toBe(docs);
		expect(choose(START, 0)).toBe(START);
		const named = submit(docs, '  beanshop ');
		expect(named.name).toBe('beanshop');
		expect(transcript(named).map((r) => r.text)).toContain('beanshop');
		expect(ghostFor(docs, '')).toBe(TARGET);
		expect(ghostFor(docs, 'b')).toBe('');
		expect(tabOf(named)).toBe('beanshop/');
		expect(tabOf({ ...named, name: 'a-very-long-app-name' })).toBe('a-very-long-ap…/');
		let cancel = enter(START);
		for (let i = 0; i < PROMPTS.length - 1; i++) cancel = enter(cancel);
		expect(choose(cancel, 1).outcome).toBe('cancelled');
		const again = submit(run, 'ls');
		expect(again.outcome).toBe('created');
		expect(again.tries).toEqual(['ls']);
		expect(enter(run).outcome).toBe('asking');
	});

	it('prints the transcript as clack does, hints on their own row, and scrolls it to the last rows', () => {
		const first = transcript(enter(START));
		expect(first[0]).toMatchObject({ mark: '$', text: COMMAND });
		expect(first.map((r) => r.text)).toEqual(['npm create markless@latest', 'Welcome to Markless', '', 'What are you building today?', '● Learn Markless', '', '○ Build an app', '○ Write docs', '○ Full-stack app', '']);
		expect(first[5]).toMatchObject({ kind: 'hint', hint: '(A small TSRX counter app. Best first project.)', option: 0 });
		let run: Run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		const rows = screen(run);
		expect(rows).toHaveLength(ROWS);
		expect(rows.at(-2)!.text).toBe('Markless app ready.');
		expect(rows.at(-1)!.kind).toBe('input');
		expect(rows.map((r) => r.text)).toContain('  npm run dev');
		expect(rows.map((r) => r.text)).toContain('  http://localhost:3000');
		expect(cursorRow(rows)).toBe(-1);
		expect(focusRow(rows)).toBe(ROWS - 1);
		expect(cursorRow(screen(enter(START)))).toBe(4);
		expect(focusRow(screen(START))).toBe(0);
		let ready: Run = enter(START);
		for (let i = 0; i < PROMPTS.length - 1; i++) ready = enter(ready);
		const summary = screen(ready);
		expect(summary.filter((r) => r.kind === 'value').map((r) => r.text + ' ' + r.value)).toEqual(['App: my-markless-app', 'Starter: Learn Markless', 'Runtime: Node', 'Install: Yes, with npm', 'Git: Yes']);
		expect(cursorRow(summary)).toBeGreaterThan(0);
	});

	it('wraps long hints onto two balanced rows and washes the whole option label', () => {
		for (const prompt of PROMPTS)
			for (const option of prompt.options) {
				const lines = wrap(`(${option.hint})`);
				expect(lines.join(' ')).toBe(`(${option.hint})`);
				for (const line of lines) expect(line.length).toBeLessThanOrEqual(WRAP);
				expect(`● ${option.label}`.length).toBeLessThanOrEqual(LONGEST);
			}
		expect(wrap(`(${FORMATS[1]!.hint})`)).toHaveLength(2);
		const deno = screen(move(enter(enter(enter(START))), 1));
		expect(deno.filter((r) => r.kind === 'hint').map((r) => r.hint)).toEqual(['(If you love its security model.', 'Any deno-compatible runtime works.)']);
		expect(Number(widthOf(screen(enter(START))[4]!))).toBeGreaterThanOrEqual(('● Learn Markless'.length + 1) / LONGEST);
	});

	it('speaks the new lines', () => {
		expect(say(START)).toBe('');
		expect(say(enter(START))).toBe('Welcome to Markless. What are you building today? Learn Markless: A small TSRX counter app. Best first project.');
		expect(say(move(enter(START), 1), true)).toBe('Build an app: A routed app with document.tsrx plus 404 and 500 pages.');
		expect(say(enter(enter(START)))).toBe('Learn Markless. Next: What should we call it? Type a name, or press Enter to keep my-markless-app.');
		let run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		expect(say(run)).toBe('Created my-markless-app: 12 files dropped into the folder, and pages/index.tsrx is your first page.');
	});

	it('lays every file in its own slot, shared files left, the page on top of the right column, and nothing before Create', () => {
		let run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		const shown = Array.from({ length: MOST_FILES }, (_, slot) => slipAt(run, slot)).filter((s) => s.on === 'yes').map((s) => s.dir + s.name);
		expect([...shown].sort()).toEqual([...filesFor('minimal', 'node')].sort());
		expect(slipAt(run, PAGE_SLOT, PAGE_SLOT)).toMatchObject({ on: 'yes', dir: 'pages/', name: 'index.tsrx', path: 'pages/index.tsrx', note: NOTES['pages/index.tsrx'], tab: 0, peek: 'yes' });
		expect(slipAt(START, PAGE_SLOT)).toMatchObject({ on: 'no', tab: -1, peek: 'no' });
		expect(slipAt(submit(run, 'ls'), PAGE_SLOT).on).toBe('yes');
		for (const starter of STARTERS.map((s) => s.value as Starter))
			for (const format of FORMATS.map((f) => f.value as Format)) {
				const slots = layout(filesFor(starter, format));
				expect(isFirstPage(slots[PAGE_SLOT]!)).toBe(true);
				for (const col of [slots.slice(0, PER), slots.slice(PER)]) {
					const used = col.filter((p) => p !== '').length;
					expect(col.slice(0, used).every((p) => p !== '')).toBe(true);
				}
				expect(slots.slice(0, PER).filter((p) => p !== '').every((p) => COMMON_FILES.includes(p))).toBe(true);
				expect(slots.slice(0, PER).every((p) => p.length <= 'scripts/markless-doctor.mjs'.length)).toBe(true);
				const order = dropOrder(slots).filter((_, i) => slots[i] !== '');
				expect([...order].sort((a, b) => a - b)).toEqual(order.map((_, i) => i));
			}
		expect(piece.match(/class="slip"/g)).toHaveLength(MOST_FILES);
		expect(piece.match(/class="page-wash"/g)).toHaveLength(1);
		expect(piece).toContain(`data-on={s${PAGE_SLOT}.on}`);
		for (let k = 0; k < MOST_FILES; k++) expect(piece).toContain(`tabindex={s${k}.tab} role="img" aria-label={s${k}.path} aria-description={s${k}.note}`);
	});

	it('pins the markup: a labelled input, one live region, one margin note, keyboard, no auto-play, reduced motion', () => {
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece.match(/<input/g)).toHaveLength(1);
		expect(piece).toContain('aria-label={label}');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain("event.key === 'ArrowDown'");
		expect(piece).toContain("event.key === 'Enter'");
		for (const banned of ['setInterval', 'setTimeout', 'onVisible', 'IntersectionObserver', 'class="play"', 'outline-offset: 4px']) expect(piece).not.toContain(banned);
		expect(piece).toContain('.stage:focus-within .focus[data-on=\'yes\']');
		expect(piece).toContain('@media (prefers-reduced-motion: reduce)');
		expect(piece).toContain("import { art } from './create.art.ts';");
	});

	it('recalls the commands run at the prompt like a shell: ArrowUp walks back newest first, ArrowDown walks forward to the empty line', () => {
		const ran = remember(remember(remember([], 'ls'), 'npm create'), COMMAND);
		expect(ran).toEqual(['ls', 'npm create', COMMAND]);
		expect(recall([], 0, 1)).toBeNull();
		expect(recall(ran, 0, -1)).toBeNull();
		const up1 = recall(ran, 0, 1)!;
		const up2 = recall(ran, up1.back, 1)!;
		const up3 = recall(ran, up2.back, 1)!;
		expect([up1.line, up2.line, up3.line]).toEqual([COMMAND, 'npm create', 'ls']);
		expect(recall(ran, up3.back, 1)).toBeNull();
		const down = recall(ran, up3.back, -1)!;
		expect(down.line).toBe('npm create');
		expect(recall(ran, 1, -1)).toEqual({ back: 0, line: '' });
		expect(piece).toContain('recall(ran, back, ');
		expect(piece).toContain('remember(ran, ');
		expect(piece).toContain('onSelectionChange');
	});

	it('inks every part fully enough not to look thin, and the same way every time', () => {
		expect(scene.rows).toHaveLength(ROWS);
		expect(scene.slips).toHaveLength(MOST_FILES);
		expect(scene.sheet.ink.length).toBeGreaterThan(500);
		expect(scene.sheet.desk.length).toBeGreaterThan(200);
		expect(scene.sheet.pencil.length).toBeGreaterThan(100);
		expect(scene.folder.ink.length).toBeGreaterThan(500);
		expect(scene.folder.cover.ink.length).toBeGreaterThan(500);
		expect(scene.folder.shadow.hatch.length).toBeGreaterThan(200);
		for (const slip of scene.slips) expect(slip.ink.length).toBeGreaterThan(200);
		for (const row of scene.rows) expect(row.underline.length).toBeGreaterThan(50);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(scene));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by create.test.ts from create.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './create.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(scene, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./create.art.ts');
	});
});
