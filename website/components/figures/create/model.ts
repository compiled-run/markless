// The create-markless run as the figure plays it: the real prompts, options and defaults from packages/cli/src/index.ts, and the files each starter writes.
export type Starter = 'minimal' | 'app' | 'docs' | 'full-stack';
export type Format = 'node' | 'deno' | 'bun';

export interface Option {
	readonly value: string;
	readonly label: string;
	readonly hint: string;
}

export const COMMAND = 'npm create markless@latest';
export const INTRO = 'Welcome to Markless';
export const TARGET = 'my-markless-app';
export const MANAGER = 'npm';

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
const INSTALL: readonly Option[] = [
	{ value: 'yes', label: 'Yes', hint: `Runs ${MANAGER} install after files are created.` },
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
	readonly key: 'starter' | 'name' | 'format' | 'install' | 'git' | 'ready';
	readonly message: string;
	/** Empty for the text prompt, which takes the default name. */
	readonly options: readonly Option[];
}

/** The six prompts in the order the CLI asks them; workspace and agent prompts only appear on some machines and are left out. */
export const PROMPTS: readonly Prompt[] = [
	{ key: 'starter', message: 'What are you building today?', options: STARTERS },
	{ key: 'name', message: 'What should we call it?', options: [] },
	{ key: 'format', message: 'Where should it run?', options: FORMATS },
	{ key: 'install', message: 'Install dependencies now?', options: INSTALL },
	{ key: 'git', message: 'Initialize git?', options: GIT },
	{ key: 'ready', message: 'Ready to create?', options: READY },
];

/** The files `create-markless` writes, by template folder, after `gitignore` becomes `.gitignore`. */
export const COMMON_FILES = ['.gitignore', '.vscode/extensions.json', '.vscode/settings.json', '.zed/settings.json', 'README.md', 'public/.gitkeep', 'scripts/markless-doctor.mjs', 'tsconfig.json', 'vite.config.ts'];
const FORMAT_FILE: Record<Format, string> = { node: 'package.json', deno: 'deno.json', bun: 'package.json' };
const MINIMAL = ['pages/index.tsrx', 'document.tsrx'];
const APP = ['pages/404.tsrx', 'pages/500.tsrx'];
const FULL_STACK = ['api/health.ts', 'middleware/request.ts'];
const DOCS = ['pages/index.mdx', 'document.tsrx', 'pages/docs/index.mdx', 'pages/docs/[...slug].mdx', 'components/layouts/DocsLayout.tsrx', 'components/docs/Sidebar.tsrx'];

/** Every file the starter writes, the first page first. */
export function filesFor(starter: Starter, format: Format): string[] {
	const own = starter === 'docs' ? DOCS : [...MINIMAL, ...(starter === 'minimal' ? [] : APP), ...(starter === 'full-stack' ? FULL_STACK : [])];
	return [...own, FORMAT_FILE[format], ...COMMON_FILES];
}
export const MOST_FILES = 16;
/** Slots per column: 0–7 the left column back to front, 8–15 the right one; slot 8, top of the right column, is always the first page. */
export const PER = 8;
export const PAGE_SLOT = PER;
/** The files lying in the folder: none until the run creates the app. */
export const landed = (run: Run) => (run.outcome === 'created' ? filesFor(starterOf(run), formatOf(run)) : []);

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

/** One plain line per file, read from the template the CLI copies (packages/cli/templates). */
export const NOTES: Record<string, string> = {
	'pages/index.tsrx': 'your first page, served at /: a button that counts',
	'pages/index.mdx': 'your first page, served at /, written in Markdown',
	'document.tsrx': 'the HTML shell every page renders inside',
	'pages/404.tsrx': 'shown when no page matches the address',
	'pages/500.tsrx': 'shown when a page fails with an error',
	'api/health.ts': 'an endpoint at /api/health that answers ok',
	'middleware/request.ts': 'runs on every request and adds a response header',
	'pages/docs/index.mdx': 'the docs home, served at /docs',
	'pages/docs/[...slug].mdx': 'every other /docs/ page, inside the docs layout',
	'components/layouts/DocsLayout.tsrx': 'the docs layout: a sidebar beside the page',
	'components/docs/Sidebar.tsrx': 'the docs sidebar and its links',
	'package.json': 'the app\'s scripts (dev, build, doctor...) and packages',
	'deno.json': 'the app\'s Deno tasks (dev, build...) and npm imports',
	'vite.config.ts': 'turns on Markless and the router for dev and build',
	'tsconfig.json': 'TypeScript settings that teach your editor .tsrx',
	'README.md': 'how to start the app and set up your editor',
	'.gitignore': 'keeps node_modules, build output and logs out of git',
	'scripts/markless-doctor.mjs': 'checks your setup and hints at each fix',
	'public/.gitkeep': 'keeps public/, where files served as-is go',
	'.vscode/extensions.json': 'suggests the TSRX extension to VS Code',
	'.vscode/settings.json': 'turns on Emmet in .tsrx files in VS Code',
	'.zed/settings.json': 'sets Zed up to read .tsrx with the Markless plugin',
};

/** The run: before the command runs it is idle at the shell prompt; then which prompt is open, where the cursor sits, what was chosen, the name typed, and any mistyped commands. */
export interface Run {
	readonly step: number;
	readonly cursor: number;
	readonly picks: readonly number[];
	readonly outcome: 'idle' | 'asking' | 'created' | 'cancelled';
	readonly name: string;
	readonly tries: readonly string[];
}
export const START: Run = { step: 0, cursor: 0, picks: [], outcome: 'idle', name: TARGET, tries: [] };
const ASK: Run = { ...START, outcome: 'asking' };

const optionsAt = (step: number) => PROMPTS[step]?.options ?? [];
export const starterOf = (run: Run): Starter => STARTERS[run.picks[0] ?? 0]!.value as Starter;
export const formatOf = (run: Run): Format => FORMATS[run.picks[2] ?? 0]!.value as Format;
/** Whether the line being typed is a shell command, the name prompt, or nothing (a select is open). */
export const typing = (run: Run) => (run.outcome !== 'asking' ? 'shell' : PROMPTS[run.step]!.key === 'name' ? 'name' : 'none');

/** Arrow keys move the highlight round the open select, as clack does. */
export function move(run: Run, by: number): Run {
	const n = optionsAt(run.step).length;
	if (run.outcome !== 'asking' || n === 0) return run;
	return { ...run, cursor: (run.cursor + by + n) % n };
}

/** Enter with `text` on the line: at the shell it runs the command (an empty line takes the suggestion), at the name prompt it names the app, in a select it picks the highlight. */
export function submit(run: Run, text = ''): Run {
	const line = text.trim();
	if (run.outcome !== 'asking') return line === '' || line === COMMAND ? ASK : { ...run, tries: [...run.tries, line].slice(-2) };
	const picks = [...run.picks, run.cursor];
	const name = PROMPTS[run.step]!.key === 'name' ? line || TARGET : run.name;
	if (run.step === PROMPTS.length - 1) return { ...run, picks, name, outcome: run.cursor === 0 ? 'created' : 'cancelled' };
	return { ...run, step: run.step + 1, cursor: 0, picks, name };
}
/** Enter on an empty line. */
export const enter = (run: Run) => submit(run, '');

/** A click on an option picks and submits it, as clack allows; a click anywhere else changes nothing. */
export const choose = (run: Run, option: number): Run => (run.outcome === 'asking' && option >= 0 && option < optionsAt(run.step).length ? submit({ ...run, cursor: option }) : run);

export const devCommand = (format: Format) => (format === 'deno' ? 'deno task dev' : `${MANAGER} run dev`);

export interface Row {
	readonly mark: string;
	readonly text: string;
	/** Text set at the summary's tab stop, so the values line up. */
	readonly value: string;
	/** A hint line, indented under the option it explains. */
	readonly hint: string;
	/** cmd, bar, active, done, value, pick, hint, opt, note, input, start */
	readonly kind: string;
	/** The option index a click on this row picks, or -1. */
	readonly option: number;
	/** On the line being typed: the caret, the text after it, and the faint suggestion. */
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}

const row = (mark: string, text = '', kind = 'bar', value = '', option = -1, hint = ''): Row => ({ mark, text, value, hint, kind, option, caret: '', after: '', ghost: '' });

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
	return optionsAt(step)[run.picks[step]!]!.label;
}

function summary(run: Run): Row[] {
	const yes = (i: number) => (run.picks[i] ?? 0) === 0;
	return [
		row('◇', 'Ready to create?', 'note'),
		row('│', 'App:', 'value', run.name),
		row('│', 'Starter:', 'value', STARTERS[run.picks[0] ?? 0]!.label),
		row('│', 'Runtime:', 'value', FORMATS[run.picks[2] ?? 0]!.label),
		row('│', 'Install:', 'value', yes(3) ? `Yes, with ${MANAGER}` : 'No'),
		row('│', 'Git:', 'value', yes(4) ? 'Yes' : 'No'),
		row('│'),
	];
}

/** The friendly answers to mistyped commands, then a fresh shell prompt. */
const shell = (run: Run): Row[] => [...run.tries.flatMap((t) => [row('$', t, 'cmd'), row('', `Try ${COMMAND}`, 'note')]), row('$', '', 'input')];

/** The whole transcript so far, top to bottom, as the shell and clack print it. */
export function transcript(run: Run): Row[] {
	if (run.outcome === 'idle') return run.tries.length ? shell(run) : [...shell(run), row('', '', 'start', '', -1, '↵ Press Enter to run it')];
	const rows: Row[] = [row('$', COMMAND, 'cmd'), row('┌', INTRO, 'done'), row('│')];
	for (let step = 0; step < run.picks.length; step++) {
		if (PROMPTS[step]!.key === 'ready') rows.push(...summary(run));
		rows.push(row('◇', PROMPTS[step]!.message, 'done'), row('│', answer(run, step), 'value'), row('│'));
	}
	if (run.outcome === 'created') {
		const format = formatOf(run);
		rows.push(row('◇', `Created ${run.name}`, 'note'), row('│', 'Next steps:', 'value'), row('│', `  cd ${run.name}`, 'value'), row('│', `  ${devCommand(format)}`, 'value'), row('│', 'Then open:', 'value'), row('│', '  http://localhost:3000', 'value'), row('└', 'Markless app ready.', 'done'));
		return [...rows, ...shell(run)];
	}
	if (run.outcome === 'cancelled') {
		rows.pop();
		rows.push(row('■', 'Create cancelled.', 'done'));
		return [...rows, ...shell(run)];
	}
	const prompt = PROMPTS[run.step]!;
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
/** The longest line the reader can type; the terminal and the folder's tab are drawn for it. */
export const MAX_TYPED = 24;

/** The suggestion shown faintly after the caret: the rest of the command at the shell, the default name at the name prompt. */
export function ghostFor(run: Run, typed: string): string {
	const kind = typing(run);
	if (kind === 'shell') return COMMAND.startsWith(typed) ? COMMAND.slice(typed.length) : '';
	if (kind === 'name') return typed === '' ? TARGET : '';
	return '';
}

/** What the terminal sheet shows: the last ROWS lines, like a terminal that scrolls, with the typed line, caret and suggestion filled in; an empty line keeps a zero-width character so its text still starts at its column. */
export function screen(run: Run, typed = '', at = typed.length): Row[] {
	const all = transcript(run)
		.map((r) => (r.kind === 'input' ? { ...r, text: typed.slice(0, at) || '\u200b', caret: '|', after: typed.slice(at), ghost: at === typed.length ? ghostFor(run, typed) : '' } : r))
		.slice(-ROWS);
	return [...all, ...Array.from({ length: ROWS - all.length }, () => BLANK)];
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

/** What the slot's sheet is, for a reader who hovers, taps or focuses it. */
export function noteAt(run: Run, slot: number) {
	const path = layout(landed(run))[slot] ?? '';
	return { path, note: NOTES[path] ?? '' };
}

/** The terminal input's label: what the open line expects. */
export function labelOf(run: Run): string {
	const kind = typing(run);
	if (kind === 'shell') return `Terminal. Type ${COMMAND} and press Enter; Enter on an empty line runs it.`;
	if (kind === 'name') return `What should we call it? Type a name, or press Enter to keep ${TARGET}.`;
	return `${PROMPTS[run.step]!.message} Arrow keys move, Enter picks, Escape starts over.`;
}

/** The sentence the live region speaks: the new lines the terminal printed. */
export function describe(run: Run, moved = false): string {
	if (run.outcome === 'idle') return run.tries.length > 0 ? `Try ${COMMAND}` : '';
	if (run.outcome === 'created') {
		const files = filesFor(starterOf(run), formatOf(run));
		const page = files.find(isFirstPage)!;
		return run.tries.length > 0 ? `Try ${COMMAND}` : `Created ${run.name}: ${files.length} files dropped into the folder, and ${page} is your first page.`;
	}
	if (run.outcome === 'cancelled') return run.tries.length > 0 ? `Try ${COMMAND}` : 'Create cancelled. Nothing was written.';
	const prompt = PROMPTS[run.step]!;
	const option = prompt.options[run.cursor];
	const said = option ? `${option.label}${option.hint ? `: ${option.hint}` : ''}` : `Type a name, or press Enter to keep ${TARGET}.`;
	if (moved) return said;
	if (run.picks.length === 0) return `${INTRO}. ${prompt.message} ${said}`;
	return `${answer(run, run.step - 1)}. Next: ${prompt.message} ${said}`;
}
