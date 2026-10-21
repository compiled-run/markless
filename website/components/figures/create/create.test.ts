import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CreateProgram,
	EDITOR_CHOICES,
	PROJECT_FORMAT_CHOICES,
	STARTER_CHOICES,
	type ProgramPrompts,
	type ProgramRuntime,
} from '../../../../packages/cli/src/index.ts';
import { createCommand, MANAGERS, type ManagerId } from '../../docs/walkthrough/facts.ts';
import {
	choose,
	completesAt,
	COMMON_FILES,
	createCommands,
	cursorRow,
	describe as say,
	dropOrder,
	type Editor,
	EDITORS,
	enter,
	filesFor,
	focusRow,
	type Format,
	FORMATS,
	ghostFor,
	invalidAt,
	isFirstPage,
	labelOf,
	landed,
	layout,
	LONGEST,
	MAX_TYPED,
	interrupt,
	move,
	MOST_FILES,
	NOTE_LINES,
	noteLines,
	NOTES,
	PAGE_SLOT,
	PER,
	PROMPTS,
	promptsFor,
	ROWS,
	type Run,
	screen,
	showsFooter,
	slipAt,
	START,
	type Starter,
	STARTERS,
	submit,
	tabOf,
	TARGET,
	transcript,
	widthOf,
	wrap,
	WRAP,
} from './model.ts';
import { FOOTERS } from './managers.ts';
import { drawing } from './create.ts';
import { recall, remember } from './history.ts';

const COMMAND = createCommand('npm');
const ids = MANAGERS.map((m) => m.id);

const scene = drawing();
const cli = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./create-anatomy.tsrx', import.meta.url), 'utf8');

const path = (p: string | URL) => (p instanceof URL ? fileURLToPath(p) : p);

/** A machine with no agents, no workspace and no editor terminal, whose files land in `paths`. */
function machine(
	paths: string[] = [],
	env: Record<string, string> = {},
	prompts?: ProgramPrompts,
): ProgramRuntime {
	return {
		cwd: () => '/tmp/desk',
		env,
		homeDir: '/tmp/home',
		isTTY: prompts !== undefined,
		prompts,
		sha256: async () => '',
		fs: {
			atomicCreateFile: async () => true,
			atomicWriteFile: async () => {},
			lstat: async () => null,
			mkdir: async () => {},
			readDirectory: async (dir) =>
				readdirSync(path(dir), { withFileTypes: true }).map((e) => ({
					name: e.name,
					kind: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
				})),
			readFile: async (file) => readFileSync(path(file), 'utf8'),
			stat: async () => null,
			remove: async () => {},
			rmdir: async () => {},
			writeFile: async (file) => {
				paths.push(path(file).replace('/tmp/desk/my-markless-app/', ''));
			},
		},
	};
}

/** Runs the CLI's own execute() with no git, no install and no agents, and returns the paths it writes. */
async function written(starter: Starter, format: Format, editor: Editor): Promise<string[]> {
	const paths: string[] = [];
	await new CreateProgram().execute(
		{
			target: TARGET,
			format,
			starter,
			install: false,
			git: false,
			force: false,
			packageManager: 'npm',
			cwd: '/tmp/desk',
			agents: [],
			editor,
		},
		machine(paths),
	);
	return paths.sort();
}

interface Asked {
	readonly message: string;
	readonly options: readonly { label: string; hint: string }[];
	readonly initial: string;
}

/** Launches the CLI the way `manager` does (its user agent), answers each question with the option at `picks[i]`, creates without install or git, and records what it asked and printed. */
async function launched(manager: ManagerId, picks: readonly number[]) {
	const asked: Asked[] = [];
	const paths: string[] = [];
	const notes: { title: string; body: string }[] = [];
	let i = 0;
	const prompts: ProgramPrompts = {
		intro: () => {},
		note: (body, title = '') => void notes.push({ title, body }),
		outro: () => {},
		cancel: () => {},
		multiselect: async () => [],
		text: async (options) => {
			asked.push({
				message: options.message,
				options: [],
				initial: options.initialValue ?? '',
			});
			i++;
			return options.defaultValue ?? '';
		},
		select: async (options) => {
			asked.push({
				message: options.message,
				options: options.options.map(({ label, hint }) => ({ label, hint })),
				initial: options.initialValue,
			});
			return options.options[picks[i++] ?? 0]!.value;
		},
	};
	const program = new CreateProgram();
	const runtime = machine(
		paths,
		{ npm_config_user_agent: `${manager}/1.0.0 node/v22.0.0` },
		prompts,
	);
	const options = await program.interact(program.validate([], runtime), runtime);
	await program.execute({ ...options, install: false, git: false }, runtime);
	return { asked, notes, options, paths: paths.sort() };
}

/** The figure's run for the same command and picks. */
function played(manager: ManagerId, picks: readonly number[]): Run {
	let run = submit(START, createCommand(manager));
	for (const pick of picks) {
		const next = choose(run, pick);
		run = next === run ? submit(run) : next;
	}
	return run;
}

describe('the create figure plays the real CLI', () => {
	it('asks the CLI prompts in its order, with its labels, hints and defaults', () => {
		const asked = [...cli.matchAll(/message: '([^']+)'/g)].map((m) => m[1]);
		for (const prompt of PROMPTS) expect(asked).toContain(prompt.message);
		const order = PROMPTS.map((p) => cli.indexOf(`message: '${p.message}'`));
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(STARTERS.map(({ value, label, hint }) => ({ value, label, hint }))).toEqual(
			STARTER_CHOICES.map(({ value, label, hint }) => ({ value, label, hint })),
		);
		expect(FORMATS.map(({ value, label, hint }) => ({ value, label, hint }))).toEqual(
			PROJECT_FORMAT_CHOICES.map(({ value, label, hint }) => ({ value, label, hint })),
		);
		expect(EDITORS.map(({ value, label, hint }) => ({ value, label, hint }))).toEqual(
			EDITOR_CHOICES.map(({ value, label, hint }) => ({ value, label, hint })),
		);
		expect(cli).toContain("const DEFAULT_TARGET = 'my-markless-app';");
		expect(cli).toContain("prompts.intro('Welcome to Markless');");
		expect(cli).toContain("{ value: 'create', label: 'Create app', hint: '' }");
		expect(cli).toContain("initialValue: 'minimal'");
		expect(cli).toContain("'  http://localhost:3000'");
	});

	it('drops exactly the files the CLI writes for every starter, runtime and editor, each with a true one-line note', async () => {
		for (const starter of STARTERS.map((s) => s.value as Starter))
			for (const format of FORMATS.map((f) => f.value as Format))
				for (const editor of EDITORS.map((e) => e.value as Editor)) {
					const files = filesFor(starter, format, editor);
					expect([...files].sort(), `${starter} ${format} ${editor}`).toEqual(
						await written(starter, format, editor),
					);
					expect(files.length).toBeLessThanOrEqual(MOST_FILES);
					expect(isFirstPage(files[0]!)).toBe(true);
					for (const file of files) expect(NOTES[file]).toBeTruthy();
				}
		expect(filesFor('minimal', 'node')).toContain('pages/index.tsrx');
		expect(filesFor('docs', 'node')).not.toContain('pages/index.tsrx');
		expect(filesFor('minimal', 'bun')).toContain('package.json');
		for (const note of Object.values(NOTES))
			expect(noteLines(note).length, note).toBeLessThanOrEqual(NOTE_LINES);
	});

	it('pins each note to what its template really holds', () => {
		const template = (path: string) =>
			readFileSync(
				new URL(`../../../../packages/cli/templates/${path}`, import.meta.url),
				'utf8',
			);
		expect(template('starters/minimal/pages/index.tsrx')).toContain('onClick={() => count++}');
		expect(template('starters/docs/pages/index.mdx')).toContain('This page is an MDX route.');
		expect(template('starters/minimal/document.tsrx')).toContain('<body>{children}</body>');
		expect(template('starters/app/pages/404.tsrx')).toContain('Not found');
		expect(template('starters/app/pages/500.tsrx')).toContain('Something went wrong');
		expect(template('starters/full-stack/api/health.ts')).toContain("new Response('ok')");
		expect(template('starters/full-stack/middleware/request.ts')).toContain(
			"headers.set('x-markless-router', '1')",
		);
		expect(template('starters/docs/pages/docs/[...slug].mdx')).toContain('<DocsLayout');
		expect(template('starters/docs/components/layouts/DocsLayout.tsrx')).toContain(
			'<Sidebar active={active} />',
		);
		expect(template('starters/docs/components/docs/Sidebar.tsrx')).toContain(
			'<nav aria-label="Docs">',
		);
		expect(template('formats/node/package.json')).toContain(
			'"doctor": "node scripts/markless-doctor.mjs"',
		);
		expect(template('common/vite.config.ts')).toContain('plugins: [markless(), router()]');
		expect(template('common/tsconfig.json')).toContain('@markless/typescript-plugin');
		expect(template('common/gitignore')).toContain('node_modules/');
		expect(template('common/scripts/markless-doctor.mjs')).toContain('hint:');
		expect(template('common/.vscode/extensions.json')).toContain(
			'ripple-ts.ripple-ts-vscode-plugin',
		);
		expect(template('common/.vscode/settings.json')).toContain('emmet.includeLanguages');
		expect(template('common/.zed/settings.json')).toContain('@markless/typescript-plugin');
	});

	it('takes Ctrl+C like a terminal: a fresh prompt at the shell, Create cancelled at a question', () => {
		const abandoned = interrupt(START, 'npm cre');
		expect(transcript(abandoned).map((r) => r.text)).toEqual(['npm cre^C', '']);
		expect(transcript(abandoned)[0]!.invalid).toBe('no');
		const cancelled = interrupt(enter(START), '');
		expect(cancelled.outcome).toBe('cancelled');
		expect(transcript(cancelled).map((r) => r.text)).toContain('Create cancelled.');
	});

	it('waits at a shell prompt: the command runs on Enter, an empty Enter takes the suggestion, anything else gets one friendly line', () => {
		expect(START.outcome).toBe('idle');
		expect(transcript(START).map((r) => r.kind)).toEqual(['input', 'start']);
		expect(transcript(START)[1]!.hint).toBe('↵ Press Enter to run it');
		expect(ghostFor(START, '')).toBe(COMMAND);
		for (const id of ids)
			for (const command of createCommands(id))
				expect(command.length).toBeLessThanOrEqual(MAX_TYPED);
		expect(ghostFor(START, 'npm cr')).toBe('eate markless@latest');
		expect(ghostFor(START, 'yarn')).toBe(' create markless');
		const wrong = submit(START, 'npm i markless');
		expect(wrong.outcome).toBe('idle');
		expect(transcript(wrong).map((r) => r.text)).toEqual([
			'npm i markless',
			`Try ${COMMAND}`,
			'',
		]);
		expect(say(wrong)).toBe(`Try ${COMMAND}`);
		expect(submit(START, COMMAND)).toEqual(enter(START));
		expect(enter(START).outcome).toBe('asking');
		const row = screen(START, 'npm', 3)[0]!;
		expect(row).toMatchObject({
			kind: 'input',
			text: 'npm',
			caret: '|',
			ghost: ' create markless@latest',
		});
		expect(screen(START, 'npm', 1)[0]).toMatchObject({ text: 'n', after: 'pm', ghost: '' });
	});

	it('takes any package manager create command, and remembers which one ran it', () => {
		for (const id of ids) {
			const run = submit(START, createCommand(id));
			expect(run).toMatchObject({
				outcome: 'asking',
				manager: id,
				command: createCommand(id),
			});
			expect(transcript(run)[0]).toMatchObject({
				mark: '$',
				text: createCommand(id),
				kind: 'cmd',
			});
			expect(enter(START, id)).toMatchObject({
				outcome: 'asking',
				manager: id,
				command: createCommand(id),
			});
		}
		expect(submit(START, '  npm   create markless ')).toMatchObject({
			outcome: 'asking',
			manager: 'npm',
			command: 'npm create markless',
		});
		expect(submit(START, 'pnpm create markless@latest').outcome).toBe('idle');
		expect(transcript(submit(START, 'yarn add markless', 'bun')).map((r) => r.text)).toEqual([
			'yarn add markless',
			'Try bun create markless',
			'',
		]);
		expect(say(submit(START, 'ls', 'bun'))).toBe('Try bun create markless');
		expect(labelOf(START)).toContain('npm, pnpm, yarn or Bun');
	});

	it("completes whichever manager's command the text starts, the saved one first", () => {
		expect(ghostFor(START, '', 'bun')).toBe('bun create markless');
		expect(ghostFor(START, 'p')).toBe('npm create markless');
		expect(ghostFor(START, 'b', 'npm')).toBe('un create markless');
		expect(ghostFor(START, 'y', 'pnpm')).toBe('arn create markless');
		expect(ghostFor(START, 'n', 'bun')).toBe('pm create markless@latest');
		expect(ghostFor(START, 'npm create markless')).toBe('@latest');
		expect(ghostFor(START, 'x')).toBe('');
		expect(screen(START, 'pn', 2)[0]!.ghost).toBe('pm create markless');
	});

	it('leaves the empty-line ghost and the footer to the saved manager on the page, so only running a command changes them', () => {
		const rows = screen(START, '', 0);
		expect(rows.slice(0, 2).map((r) => r.kind)).toEqual(['input', 'start']);
		expect(rows[0]!.ghost).toBe('');
		expect([rows[0]!.wait0, rows[0]!.wait1, rows[0]!.wait2, rows[0]!.wait3]).toEqual(
			ids.map((id) => createCommand(id)),
		);
		expect(rows.at(-1)!.kind).toBe('footer');
		expect(rows.filter((r) => r.kind === 'footer')).toHaveLength(1);
		expect(rows).toHaveLength(ROWS);
		expect(showsFooter(START, '')).toBe(true);
		const typing = screen(START, 'b', 1);
		expect(typing.some((r) => r.kind === 'footer')).toBe(false);
		expect(typing[0]!.wait0).toBe('');
		const missed = screen(submit(START, 'ls'), '', 0);
		expect(missed.slice(0, 3).map((r) => r.kind)).toEqual(['cmd', 'note', 'input']);
		expect(missed.at(-1)!.kind).toBe('footer');
		let made = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) made = enter(made);
		expect(showsFooter(made, '')).toBe(false);
		expect(screen(made).map((r) => r.text)).toContain('  npm run dev');
		for (const { saved, others } of FOOTERS)
			expect(others.map((o) => o.id)).toEqual(ids.filter((id) => id !== saved));
		ids.forEach((id, k) => expect(piece).toContain(`data-pm="${id}">{slot.wait${k}}</tspan>`));
		for (const id of ids)
			expect(piece).toContain(
				`html[data-package-manager='${id}'] :is(.wait-ghost, .others)[data-pm='${id}']`,
			);
		expect(piece).toContain('createCommand(managerOf(pick))');
		expect(piece.match(/^\s+packageManager = /gm)).toHaveLength(1);
		expect(
			piece.slice(
				piece.indexOf("event.key === 'Enter') {"),
				piece.indexOf("event.key === 'c' && event.ctrlKey) {"),
			),
		).toContain('packageManager = after.manager;');
		for (const handler of ['onFocusIn', 'onPointerOver'])
			for (const block of piece.split(handler).slice(1))
				expect(block.slice(0, 300)).not.toContain('savedOnPage');
	});

	it('lets Tab take the suggestion only while there is one at the caret, so Tab with nothing to complete leaves the terminal', () => {
		expect(completesAt(START, '', 0)).toBe(true);
		expect(completesAt(START, 'pn', 2)).toBe(true);
		expect(completesAt(START, 'pn', 1)).toBe(false);
		expect(completesAt(START, 'x', 1)).toBe(false);
		expect(completesAt(START, COMMAND, COMMAND.length)).toBe(false);
		const naming = enter(enter(START));
		expect(completesAt(naming, '', 0)).toBe(true);
		expect(completesAt(naming, 'beanshop', 8)).toBe(false);
		expect(completesAt(enter(START), '', 0)).toBe(false);
		expect(piece).toContain(
			"(event.key === 'Tab' && event.shiftKey === false && completes)) event.preventDefault();",
		);
		expect(piece).toContain(
			"(event.key === 'ArrowRight' || (event.key === 'Tab' && !event.shiftKey))",
		);
	});

	it('keeps the caret where the keyboard left it: a click only focuses the line, and nothing in the figure selects as text', () => {
		expect(piece).toMatch(/\.line-in \{[^}]*pointer-events: none;/);
		expect(piece).toMatch(/\.stage \{[^}]*user-select: none;/);
	});

	it('marks a line red once no create command starts with it, and keeps a wrong command red above its hint', () => {
		for (const typed of ['', 'n', 'pnpm cr', 'bun create', COMMAND])
			expect(invalidAt(START, typed), typed).toBe(false);
		for (const typed of ['x', 'npm i', 'pnpm create markless@'])
			expect(invalidAt(START, typed), typed).toBe(true);
		expect(screen(START, 'npm x', 5)[0]).toMatchObject({ invalid: 'yes', ghost: '' });
		expect(screen(START, 'npm', 3)[0]!.invalid).toBe('no');
		const wrong = transcript(submit(START, 'npm i markless'));
		expect(wrong[0]).toMatchObject({ text: 'npm i markless', invalid: 'yes' });
		expect(wrong[1]!.invalid).toBe('no');
		expect(invalidAt(enter(enter(START)), 'zzz')).toBe(false);
		expect(piece).toContain('data-invalid={slot.invalid}');
	});

	it('asks what the CLI asks when each manager launches it, and prints its summary and next steps', async () => {
		const answers = [
			[0, 0, 0, 0, 0, 0, 0],
			[2, 0, 1, 1, 1, 1, 0],
			[3, 0, 1, 2, 0, 0, 0],
			[1, 0, 0, 0, 1, 1, 0],
		];
		for (const manager of ids)
			for (const picks of answers) {
				const cli = await launched(manager, picks);
				const run = played(manager, picks);
				expect(run.outcome, `${manager} ${picks}`).toBe('created');
				expect(cli.options.packageManager).toBe(manager);
				const prompts = promptsFor(manager);
				expect(cli.asked.map((a) => a.message)).toEqual(prompts.map((p) => p.message));
				cli.asked.forEach((a, step) => {
					expect(a.options, a.message).toEqual(
						prompts[step]!.options.map(({ label, hint }) => ({ label, hint })),
					);
					if (a.options.length)
						expect(a.initial, a.message).toBe(prompts[step]!.options[0]!.value);
				});
				const rows = transcript(run);
				const pairs = (lines: string) =>
					lines.split('\n').map((line) => line.split(/:\s+/).map((part) => part.trim()));
				const summary = cli.notes.find((n) => n.title === 'Ready to create?')!;
				const drawn = rows
					.slice(
						rows.findIndex((r) => r.text === 'Ready to create?' && r.kind === 'note') +
							1,
					)
					.filter((r) => r.kind === 'value' && r.value)
					.map((r) => [r.text.replace(':', ''), r.value]);
				expect(drawn.slice(0, pairs(summary.body).length)).toEqual(pairs(summary.body));
				const created = cli.notes.find((n) => n.title.startsWith('Created '))!;
				expect(rows.map((r) => r.text)).toContain(created.title);
				const steps = rows.slice(
					rows.findIndex((r) => r.text === created.title) + 1,
					rows.findIndex((r) => r.text === 'Markless app ready.'),
				);
				expect(steps.map((r) => r.text)).toEqual(created.body.split('\n').filter(Boolean));
				expect([...landed(run)].sort()).toEqual(cli.paths);
			}
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
		expect(again.tries).toEqual([{ line: 'ls', saved: 'npm' }]);
		expect(enter(run).outcome).toBe('asking');
	});

	it('prints the transcript as clack does, hints on their own row, and scrolls it to the last rows', () => {
		const first = transcript(enter(START));
		expect(first[0]).toMatchObject({ mark: '$', text: COMMAND });
		expect(first.map((r) => r.text)).toEqual([
			'npm create markless@latest',
			'Welcome to Markless',
			'',
			'What are you building today?',
			'● Learn Markless',
			'',
			'○ Build an app',
			'○ Write docs',
			'○ Full-stack app',
			'',
		]);
		expect(first[5]).toMatchObject({
			kind: 'hint',
			hint: '(A small TSRX counter app. Best first project.)',
			option: 0,
		});
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
		expect(
			summary.filter((r) => r.kind === 'value').map((r) => r.text + ' ' + r.value),
		).toEqual([
			'App: my-markless-app',
			'Starter: Learn Markless',
			'Runtime: Node',
			'Install: Yes, with npm',
			'Git: Yes',
			'Editor: VS Code',
		]);
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
		expect(
			wrap('(A hint longer than a terminal line wraps onto two rows of about equal length.)'),
		).toEqual([
			'(A hint longer than a terminal line wraps',
			'onto two rows of about equal length.)',
		]);
		expect(Number(widthOf(screen(enter(START))[4]!))).toBeGreaterThanOrEqual(
			('● Learn Markless'.length + 1) / LONGEST,
		);
	});

	it('speaks the new lines', () => {
		expect(say(START)).toBe('');
		expect(say(enter(START))).toBe(
			'Welcome to Markless. What are you building today? Learn Markless: A small TSRX counter app. Best first project.',
		);
		expect(say(move(enter(START), 1), true)).toBe(
			'Build an app: A routed app with document.tsrx plus 404 and 500 pages.',
		);
		expect(say(enter(enter(START)))).toBe(
			'Learn Markless. Next: What should we call it? Type a name, or press Enter to keep my-markless-app.',
		);
		let run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		expect(say(run)).toBe(
			'Created my-markless-app: 11 files dropped into the folder, and pages/index.tsrx is your first page.',
		);
	});

	it('lays every file in its own slot, shared files left, the page on top of the right column, and nothing before Create', () => {
		let run = enter(START);
		for (let i = 0; i < PROMPTS.length; i++) run = enter(run);
		const shown = Array.from({ length: MOST_FILES }, (_, slot) => slipAt(run, slot))
			.filter((s) => s.on === 'yes')
			.map((s) => s.dir + s.name);
		expect([...shown].sort()).toEqual([...filesFor('minimal', 'node')].sort());
		expect(slipAt(run, PAGE_SLOT, PAGE_SLOT)).toMatchObject({
			on: 'yes',
			dir: 'pages/',
			name: 'index.tsrx',
			path: 'pages/index.tsrx',
			note: NOTES['pages/index.tsrx'],
			tab: 0,
			peek: 'yes',
		});
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
				expect(
					slots
						.slice(0, PER)
						.filter((p) => p !== '')
						.every((p) => COMMON_FILES.includes(p)),
				).toBe(true);
				expect(
					slots
						.slice(0, PER)
						.every((p) => p.length <= 'scripts/markless-doctor.mjs'.length),
				).toBe(true);
				const order = dropOrder(slots).filter((_, i) => slots[i] !== '');
				expect([...order].sort((a, b) => a - b)).toEqual(order.map((_, i) => i));
			}
		expect(piece.match(/class="slip"/g)).toHaveLength(MOST_FILES);
		expect(piece.match(/class="page-wash"/g)).toHaveLength(1);
		expect(piece).toContain(`data-on={s${PAGE_SLOT}.on}`);
		for (let k = 0; k < MOST_FILES; k++)
			expect(piece).toContain(
				`tabindex={s${k}.tab} role="img" aria-label={s${k}.path} aria-description={s${k}.note}`,
			);
	});

	it('pins the markup: a labelled input, one live region, one margin note, keyboard, no auto-play, reduced motion', () => {
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece.match(/<input/g)).toHaveLength(1);
		expect(piece).toContain('aria-label={label}');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain("event.key === 'ArrowDown'");
		expect(piece).toContain("event.key === 'Enter'");
		for (const banned of [
			'setInterval',
			'setTimeout',
			'onVisible',
			'IntersectionObserver',
			'class="play"',
			'outline-offset: 4px',
		])
			expect(piece).not.toContain(banned);
		expect(piece).toContain(".stage:focus-within .focus[data-on='yes']");
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
