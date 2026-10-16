// The create-markless run as the figure plays it: the real prompts, options and defaults from packages/cli/src/index.ts, and the files each starter writes.
import { createCommand, type ManagerId } from '../../docs/walkthrough/facts.ts';
import { completion, isInvalid, NO_WAIT, ranWith, waitsOf } from './managers.ts';

export type Starter = 'minimal' | 'app' | 'docs' | 'full-stack';
export type Format = 'node' | 'deno' | 'bun';
export type Editor = 'vscode' | 'zed' | 'none';

export interface Option {
	readonly value: string;
	readonly label: string;
	readonly hint: string;
}

/** The commands that start create-markless with each manager; npm also takes it without @latest. */
export const createCommands = (manager: ManagerId): readonly string[] => (manager === 'npm' ? [createCommand(manager), createCommand(manager).replace('@latest', '')] : [createCommand(manager)]);
export const INTRO = 'Welcome to Markless';
export const TARGET = 'my-markless-app';

export const STARTERS: readonly Option[] = [
	{ value: 'minimal', label: 'Learn Markless', hint: 'A small TSRX counter app. Best first project.' },
	{ value: 'app', label: 'Build an app', hint: 'A routed app with document.tsrx plus 404 and 500 pages.' },
	{ value: 'docs', label: 'Write docs', hint: 'An MDX docs site with a layout and sidebar components.' },
	{ value: 'full-stack', label: 'Full-stack app', hint: 'App routes plus api/ and middleware/ files.' },
];
export const FORMATS: readonly Option[] = [
	{ value: 'node', label: 'Node', hint: 'Creates a package.json project for pnpm, npm, or yarn.' },
	{ value: 'deno', label: 'Deno', hint: 'If you love its security model. Any deno-compatible runtime works.' },
	{ value: 'bun', label: 'Bun', hint: 'Creates a package.json project tuned for Bun.' },
];
export const EDITORS: readonly Option[] = [
	{ value: 'vscode', label: 'VS Code', hint: 'Also Cursor and Windsurf.' },
	{ value: 'zed', label: 'Zed', hint: '' },
	{ value: 'none', label: 'Other', hint: 'Writes no editor settings.' },
];
const install = (manager: ManagerId): readonly Option[] => [
	{ value: 'yes', label: 'Yes', hint: `Runs ${manager} install after files are created.` },
	{ value: 'no', label: 'No', hint: 'Leaves dependencies for you to install later.' },
];
const GIT: readonly Option[] = [
	{ value: 'yes', label: 'Yes', hint: 'Runs git init in the app directory.' },
	{ value: 'no', label: 'No', hint: 'Leaves version control untouched.' },
];
const READY: readonly Option[] = [
	{ value: 'create', label: 'Create app', hint: '' },
	{ value: 'cancel', label: 'Cancel', hint: '' },
];

export interface Prompt {
	readonly key: 'starter' | 'name' | 'format' | 'editor' | 'install' | 'git' | 'ready';
	readonly message: string;
	/** Empty for the text prompt, which takes the default name. */
	readonly options: readonly Option[];
}

/** The prompts in the order the CLI asks them, as the manager that launched it words them; workspace and agent prompts only appear on some machines and are left out. */
export const promptsFor = (manager: ManagerId): readonly Prompt[] => [
	{ key: 'starter', message: 'What are you building today?', options: STARTERS },
	{ key: 'name', message: 'What should we call it?', options: [] },
	{ key: 'format', message: 'Where should it run?', options: FORMATS },
	{ key: 'editor', message: 'Which editor do you use?', options: EDITORS },
	{ key: 'install', message: 'Install dependencies now?', options: install(manager) },
	{ key: 'git', message: 'Initialize git?', options: GIT },
	{ key: 'ready', message: 'Ready to create?', options: READY },
];
export const PROMPTS = promptsFor('npm');
const stepOf = (key: Prompt['key']) => PROMPTS.findIndex((p) => p.key === key);

/** The files `create-markless` writes, by template folder, after `gitignore` becomes `.gitignore`. */
export const COMMON_FILES = ['.gitignore', '.vscode/extensions.json', '.vscode/settings.json', '.zed/settings.json', 'README.md', 'public/.gitkeep', 'scripts/markless-doctor.mjs', 'tsconfig.json', 'vite.config.ts'];
const FORMAT_FILE: Record<Format, string> = { node: 'package.json', deno: 'deno.json', bun: 'package.json' };
const MINIMAL = ['pages/index.tsrx', 'document.tsrx'];
const APP = ['pages/404.tsrx', 'pages/500.tsrx'];
const FULL_STACK = ['api/health.ts', 'middleware/request.ts'];
const DOCS = ['pages/index.mdx', 'document.tsrx', 'pages/docs/index.mdx', 'pages/docs/[...slug].mdx', 'components/layouts/DocsLayout.tsrx', 'components/docs/Sidebar.tsrx'];

const EDITOR_DIRECTORY: Record<Editor, string> = { vscode: '.vscode/', zed: '.zed/', none: '' };
const isEditorFile = (path: string) => path.startsWith('.vscode/') || path.startsWith('.zed/');

/** Every file the starter writes, the first page first; only the chosen editor's settings. */
export function filesFor(starter: Starter, format: Format, editor: Editor = 'vscode'): string[] {
	const own = starter === 'docs' ? DOCS : [...MINIMAL, ...(starter === 'minimal' ? [] : APP), ...(starter === 'full-stack' ? FULL_STACK : [])];
	const common = COMMON_FILES.filter((path) => !isEditorFile(path) || (EDITOR_DIRECTORY[editor] !== '' && path.startsWith(EDITOR_DIRECTORY[editor])));
	return [...own, FORMAT_FILE[format], ...common];
}
export const MOST_FILES = 16;
/** Slots per column: 0–7 the left column back to front, 8–15 the right one; slot 8, top of the right column, is always the first page. */
export const PER = 8;
export const PAGE_SLOT = PER;
/** The files lying in the folder: none until the run creates the app. */
export const landed = (run: Run) => (run.outcome === 'created' ? filesFor(starterOf(run), formatOf(run), editorOf(run)) : []);

/** Where each file lies: the shared files fill the left column from the top, the page and the starter's own files the right. */
export function layout(files: readonly string[]): string[] {
	const slots: string[] = Array.from({ length: MOST_FILES }, () => '');
	if (files.length === 0) return slots;
	const page = files.find(isFirstPage)!;
	const others = [...files.filter((f) => COMMON_FILES.includes(f)), ...files.filter((f) => f !== page && !COMMON_FILES.includes(f))];
	const left = Math.ceil(others.length / 2);
	others.slice(0, left).forEach((path, i) => (slots[i] = path));
	[page, ...others.slice(left)].forEach((path, i) => (slots[PER + i] = path));
	return slots;
}

/** The order the sheets fall in: back to front, alternating columns. */
export function dropOrder(slots: readonly string[]): number[] {
	const used = slots.map((path, slot) => ({ path, slot })).filter((s) => s.path !== '');
	used.sort((a, b) => (a.slot % PER) - (b.slot % PER) || a.slot - b.slot);
	const rank = slots.map(() => 0);
	used.forEach((s, i) => (rank[s.slot] = i));
	return rank;
}

/** What one slot shows: whether a sheet lies there, its folder in light type, its name in bold, when it falls, what it is for, and whether the reader is looking at it. */
export function slipAt(run: Run, slot: number, peek = -1) {
	const slots = layout(landed(run));
	const path = slots[slot]!;
	const cut = path.lastIndexOf('/') + 1;
	const on = path === '' ? 'no' : 'yes';
	return { on, dir: path.slice(0, cut), name: path.slice(cut), order: `;--i:${dropOrder(slots)[slot]}`, path, note: NOTES[path] ?? '', tab: on === 'yes' ? 0 : -1, peek: on === 'yes' && peek === slot ? 'yes' : 'no' };
}
export const isFirstPage = (path: string) => path === 'pages/index.tsrx' || path === 'pages/index.mdx';

/** What each file is for, in words for someone who has never seen it; written in the margin while its sheet is hovered, tapped or focused. */
export const NOTES: Record<string, string> = {
	'pages/index.tsrx': 'Your home page, at /. Edit it and the browser shows the change.',
	'pages/index.mdx': 'Your home page, at /, in Markdown. Edit it and the browser shows it.',
	'document.tsrx': 'The HTML around every page: the head, the title, and the body.',
	'pages/404.tsrx': 'The page people see when an address has no page.',
	'pages/500.tsrx': 'The page people see when a page breaks with an error.',
	'api/health.ts': 'A server endpoint at /api/health. It answers with data, not a page.',
	'middleware/request.ts': 'Code that runs on the server before every request.',
	'pages/docs/index.mdx': 'The docs home page, at /docs.',
	'pages/docs/[...slug].mdx': 'Every other page under /docs, wrapped in the docs layout.',
	'components/layouts/DocsLayout.tsrx': 'The frame around each docs page: the sidebar beside the text.',
	'components/docs/Sidebar.tsrx': 'The list of links down the side of the docs.',
	'package.json': 'Lists the packages your app uses and its commands, like npm run dev.',
	'deno.json': 'Lists the packages your app uses and its tasks, like deno task dev.',
	'vite.config.ts': 'Sets up Vite, which serves and builds your app. Markless plugs in here.',
	'tsconfig.json': 'Tells your editor how to read .tsrx files, for autocomplete and errors.',
	'README.md': 'How to start the app and set up your editor.',
	'.gitignore': 'Tells git which files not to save, like node_modules and build output.',
	'scripts/markless-doctor.mjs': 'Run npm run doctor to check your setup and see how to fix problems.',
	'public/.gitkeep': 'Files you put in public/, like images, are served as they are.',
	'.vscode/extensions.json': 'Suggests the extension VS Code needs to read .tsrx files.',
	'.vscode/settings.json': 'Turns on HTML shortcuts (Emmet) for .tsrx files in VS Code.',
	'.zed/settings.json': 'Tells Zed how to read .tsrx files, for autocomplete and errors.',
};

/** Characters per line of a file's margin note, and how many lines the margin has room for. */
export const NOTE_WIDTH = 20;
export const NOTE_LINES = 5;
export function noteLines(text: string): string[] {
	const lines: string[] = [];
	for (const word of text.split(' ')) {
		const last = lines.at(-1);
		if (last !== undefined && last.length + 1 + word.length <= NOTE_WIDTH) lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	return lines;
}

export interface Try {
	readonly line: string;
	readonly saved: ManagerId;
}

/** The run: before the command runs it is idle at the shell prompt; then the command and the manager that launched it, which prompt is open, where the cursor sits, what was chosen, the name typed, and any mistyped commands. */
export interface Run {
	readonly command: string;
	readonly manager: ManagerId;
	readonly step: number;
	readonly cursor: number;
	readonly picks: readonly number[];
	readonly outcome: 'idle' | 'asking' | 'created' | 'cancelled';
	readonly name: string;
	/** Mistyped lines, each with the manager saved when it was typed, whose command the Try line names. */
	readonly tries: readonly Try[];
}
export const START: Run = { command: '', manager: 'npm', step: 0, cursor: 0, picks: [], outcome: 'idle', name: TARGET, tries: [] };

const optionsAt = (run: Run, step = run.step) => promptsFor(run.manager)[step]?.options ?? [];
const pickOf = (run: Run, key: Prompt['key']) => run.picks[stepOf(key)] ?? 0;
export const starterOf = (run: Run): Starter => STARTERS[pickOf(run, 'starter')]!.value as Starter;
export const formatOf = (run: Run): Format => FORMATS[pickOf(run, 'format')]!.value as Format;
export const editorOf = (run: Run): Editor => EDITORS[pickOf(run, 'editor')]!.value as Editor;
/** Whether the line being typed is a shell command, the name prompt, or nothing (a select is open). */
export const typing = (run: Run) => (run.outcome !== 'asking' ? 'shell' : PROMPTS[run.step]!.key === 'name' ? 'name' : 'none');

/** Arrow keys move the highlight round the open select, as clack does. */
export function move(run: Run, by: number): Run {
	const n = optionsAt(run).length;
	if (run.outcome !== 'asking' || n === 0) return run;
	return { ...run, cursor: (run.cursor + by + n) % n };
}

/** Enter with `text` on the line: at the shell any manager's create command runs it as that manager (an empty line takes the saved manager's), at the name prompt it names the app, in a select it picks the highlight. */
export function submit(run: Run, text = '', saved: ManagerId = 'npm'): Run {
	const line = text.trim();
	if (run.outcome !== 'asking') {
		const manager = line === '' ? saved : ranWith(line, createCommands);
		if (manager) return { ...START, outcome: 'asking', manager, command: line === '' ? createCommand(saved) : line.replace(/\s+/g, ' ') };
		return { ...run, tries: [...run.tries, { line, saved }].slice(-2) };
	}
	const picks = [...run.picks, run.cursor];
	const name = PROMPTS[run.step]!.key === 'name' ? line || TARGET : run.name;
	if (run.step === PROMPTS.length - 1) return { ...run, picks, name, outcome: run.cursor === 0 ? 'created' : 'cancelled' };
	return { ...run, step: run.step + 1, cursor: 0, picks, name };
}
/** Enter on an empty line. */
export const enter = (run: Run, saved: ManagerId = 'npm') => submit(run, '', saved);

/** A click on an option picks and submits it, as clack allows; a click anywhere else changes nothing. */
export const choose = (run: Run, option: number): Run => (run.outcome === 'asking' && option >= 0 && option < optionsAt(run).length ? submit({ ...run, cursor: option }) : run);

/** The CLI's next-steps dev command: a Deno app runs its task, any other app the launching manager's script. */
export const devCommand = (format: Format, manager: ManagerId) => (format === 'deno' ? 'deno task dev' : `${manager} run dev`);

export interface Row {
	readonly mark: string;
	readonly text: string;
	/** Text set at the summary's tab stop, so the values line up. */
	readonly value: string;
	/** A hint line, indented under the option it explains. */
	readonly hint: string;
	/** cmd, bar, active, done, value, pick, hint, opt, note, input, start, footer */
	readonly kind: string;
	/** A command no manager accepts, typed or echoed: yes or no. */
	readonly invalid: string;
	/** On an empty prompt, each manager's command in MANAGERS order; the page's <html data-package-manager> shows the saved one. */
	readonly wait0: string;
	readonly wait1: string;
	readonly wait2: string;
	readonly wait3: string;
	readonly wait4: string;
	/** The option index a click on this row picks, or -1. */
	readonly option: number;
	/** On the line being typed: the caret, the text after it, and the faint suggestion. */
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}

const row = (mark: string, text = '', kind = 'bar', value = '', option = -1, hint = ''): Row => ({ mark, text, value, hint, kind, option, caret: '', after: '', ghost: '', invalid: 'no', ...NO_WAIT });

/** A hint longer than this wraps onto two balanced lines, as a narrow terminal would. */
export const WRAP = 58;
export function wrap(text: string, width = WRAP): string[] {
	if (text.length <= width) return [text];
	const spaces = [...text.matchAll(/ /g)].map((m) => m.index);
	const cut = spaces.reduce((best, at) => (Math.abs(at - text.length / 2) < Math.abs(best - text.length / 2) ? at : best));
	return [text.slice(0, cut), text.slice(cut + 1)];
}

function answer(run: Run, step: number): string {
	if (PROMPTS[step]!.key === 'name') return run.name;
	return optionsAt(run, step)[run.picks[step]!]!.label;
}

function summary(run: Run): Row[] {
	const yes = (key: Prompt['key']) => pickOf(run, key) === 0;
	const editor = EDITORS[pickOf(run, 'editor')]!;
	return [
		row('◇', 'Ready to create?', 'note'),
		row('│', 'App:', 'value', run.name),
		row('│', 'Starter:', 'value', STARTERS[pickOf(run, 'starter')]!.label),
		row('│', 'Runtime:', 'value', FORMATS[pickOf(run, 'format')]!.label),
		row('│', 'Install:', 'value', yes('install') ? `Yes, with ${run.manager}` : 'No'),
		row('│', 'Git:', 'value', yes('git') ? 'Yes' : 'No'),
		row('│', 'Editor:', 'value', editor.value === 'none' ? 'Other, no editor settings' : editor.label),
		row('│'),
	];
}

const echo = (line: string): Row => ({ ...row('$', line, 'cmd'), invalid: 'yes' });
/** The friendly answers to mistyped commands, then a fresh shell prompt. */
const shell = (run: Run): Row[] => [
	...run.tries.flatMap((t) => (t.line.endsWith('^C') ? [row('$', t.line, 'cmd')] : [echo(t.line), row('', `Try ${createCommand(t.saved)}`, 'note')])),
	row('$', '', 'input'),
];
/** The bottom row, kept clear for the footer naming the other managers while the shell line is empty and nothing has run. */
export const FOOTER = { ...row(''), kind: 'footer' };
export const showsFooter = (run: Run, typed: string) => run.outcome === 'idle' && typed === '';

/** Ctrl+C: at a question it cancels the create, as clack does; at the shell it abandons the line and opens a fresh prompt. */
export function interrupt(run: Run, typed: string): Run {
	if (run.outcome === 'asking') return { ...run, outcome: 'cancelled' };
	return { ...run, tries: [...run.tries, { line: `${typed}^C`, saved: run.manager }].slice(-2) };
}

/** The whole transcript so far, top to bottom, as the shell and clack print it. */
export function transcript(run: Run): Row[] {
	if (run.outcome === 'idle') return run.tries.length ? shell(run) : [...shell(run), row('', '', 'start', '', -1, '↵ Press Enter to run it')];
	const rows: Row[] = [row('$', run.command, 'cmd'), row('┌', INTRO, 'done'), row('│')];
	for (let step = 0; step < run.picks.length; step++) {
		if (PROMPTS[step]!.key === 'ready') rows.push(...summary(run));
		rows.push(row('◇', PROMPTS[step]!.message, 'done'), row('│', answer(run, step), 'value'), row('│'));
	}
	if (run.outcome === 'created') {
		const format = formatOf(run);
		rows.push(row('◇', `Created ${run.name}`, 'note'), row('│', 'Next steps:', 'value'), row('│', `  cd ${run.name}`, 'value'), row('│', `  ${devCommand(format, run.manager)}`, 'value'), row('│', 'Then open:', 'value'), row('│', '  http://localhost:3000', 'value'), row('└', 'Markless app ready.', 'done'));
		return [...rows, ...shell(run)];
	}
	if (run.outcome === 'cancelled') {
		rows.pop();
		rows.push(row('■', 'Create cancelled.', 'done'));
		return [...rows, ...shell(run)];
	}
	const prompt = promptsFor(run.manager)[run.step]!;
	if (prompt.key === 'ready') rows.push(...summary(run));
	rows.push(row('◆', prompt.message, 'active'));
	if (prompt.options.length === 0) rows.push(row('│', '', 'input', '', 0));
	else
		prompt.options.forEach((option, i) => {
			if (i !== run.cursor) return rows.push(row('│', `○ ${option.label}`, 'opt', '', i));
			rows.push(row('│', `● ${option.label}`, 'pick', '', i));
			if (option.hint) for (const line of wrap(`(${option.hint})`)) rows.push(row('│', '', 'hint', '', i, line));
		});
	rows.push(row('└'));
	return rows;
}

export const ROWS = 11;
const BLANK = row('', '', 'blank');
/** The longest line the reader can type at the shell; the command and some slack must fit. */
export const MAX_TYPED = 40;
/** The longest app name; the terminal and the folder's tab are drawn for it. */
export const MAX_NAME = 24;


/** The suggestion shown faintly after the caret: at the shell the rest of whichever manager's create command the text starts (the saved manager's on an empty line), the default name at the name prompt. */
export function ghostFor(run: Run, typed: string, saved: ManagerId = 'npm'): string {
	const kind = typing(run);
	if (kind === 'shell') return completion(typed, saved, createCommands);
	if (kind === 'name') return typed === '' ? TARGET : '';
	return '';
}

/** Whether the shell line can no longer become any manager's create command. */
export const invalidAt = (run: Run, typed: string) => typing(run) === 'shell' && isInvalid(typed, createCommands);

/** What the terminal sheet shows: the last lines, like a terminal that scrolls, with the typed line, caret and suggestion filled in, and the footer on the bottom row while the shell line is empty; an empty line keeps a zero-width character so its text still starts at its column. */
export function screen(run: Run, typed = '', at = typed.length): Row[] {
	const foot = showsFooter(run, typed) ? [FOOTER] : [];
	const waiting = typing(run) === 'shell' && typed === '';
	const all = transcript(run)
		.map((r) => (r.kind === 'input' ? { ...r, text: typed.slice(0, at) || '\u200b', caret: '|', after: typed.slice(at), ghost: at === typed.length && !waiting ? ghostFor(run, typed) : '', invalid: invalidAt(run, typed) ? 'yes' : 'no', ...(waiting ? waitsOf(createCommands) : NO_WAIT) } : r))
		.slice(-(ROWS - foot.length));
	return [...all, ...Array.from({ length: ROWS - foot.length - all.length }, () => BLANK), ...foot];
}

/** The row the pink cursor wash sits on, or -1 when nothing is waiting for a pick. */
export const cursorRow = (rows: readonly Row[]) => rows.findIndex((r) => r.kind === 'pick');
/** The row the keyboard focus mark points at: the highlighted option, or the line being typed. */
export const focusRow = (rows: readonly Row[]) => {
	const at = cursorRow(rows);
	return at >= 0 ? at : rows.findIndex((r) => r.kind === 'input');
};
/** The cursor wash and focus underline are drawn for the longest label; shorter rows take a narrower share of it. */
export const LONGEST = 17;
export const widthOf = (row: Row) => String(Math.round(Math.min(1.15, Math.max(0.35, (row.text.length + 1) / LONGEST)) * 100) / 100);

/** Each finished create flips the beat, so the drop animation restarts. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

/** The folder's tab: the app's name, shortened to fit. */
export const tabOf = (run: Run) => (run.name.length > 15 ? run.name.slice(0, 14) + '…' : run.name) + '/';

/** The margin note for the hovered, tapped or focused sheet: which slot, its file name and its note in lines. */
export function frontAt(run: Run, slot: number) {
	const path = layout(landed(run))[slot] ?? '';
	const cut = path.lastIndexOf('/') + 1;
	const lines = noteLines(NOTES[path] ?? '');
	return { on: path === '' ? 'no' : 'yes', slot: path === '' ? 0 : slot, side: slot >= 0 && slot < PER ? 'left' : 'right', name: path.slice(cut), lines: Array.from({ length: NOTE_LINES }, (_, k) => lines[k] ?? '') };
}

/** The terminal input's label: what the open line expects. */
export function labelOf(run: Run): string {
	const kind = typing(run);
	if (kind === 'shell') return "Terminal. Type the create command of npm, pnpm, yarn, Bun or Deno and press Enter; Enter on an empty line runs the suggested one.";
	if (kind === 'name') return `What should we call it? Type a name, or press Enter to keep ${TARGET}.`;
	return `${PROMPTS[run.step]!.message} Arrow keys move, Enter picks, Escape starts over.`;
}

/** The sentence the live region speaks: the new lines the terminal printed. */
export function describe(run: Run, moved = false): string {
	const last = run.tries.at(-1);
	const retry = last ? `Try ${createCommand(last.saved)}` : '';
	if (run.outcome === 'idle') return run.tries.length > 0 ? retry : '';
	if (run.outcome === 'created') {
		const files = landed(run);
		const page = files.find(isFirstPage)!;
		return run.tries.length > 0 ? retry : `Created ${run.name}: ${files.length} files dropped into the folder, and ${page} is your first page.`;
	}
	if (run.outcome === 'cancelled') return run.tries.length > 0 ? retry : 'Create cancelled. Nothing was written.';
	const prompt = promptsFor(run.manager)[run.step]!;
	const option = prompt.options[run.cursor];
	const said = option ? `${option.label}${option.hint ? `: ${option.hint}` : ''}` : `Type a name, or press Enter to keep ${TARGET}.`;
	if (moved) return said;
	if (run.picks.length === 0) return `${INTRO}. ${prompt.message} ${said}`;
	return `${answer(run, run.step - 1)}. Next: ${prompt.message} ${said}`;
}
