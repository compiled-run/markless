// The dev server run as the figure plays it: the command the reader types, the lines the dev script really prints for the 0.5.0 starter, and the starter's first page.
import { type ManagerId, scriptCommand } from '../../docs/walkthrough/facts.ts';
import { devCommand } from '../create/model.ts';
import { completion, isInvalid, NO_WAIT, ranWith, tidy, waitsOf } from '../create/managers.ts';
import starterManifest from '../../../../packages/cli/templates/formats/node/package.json' with { type: 'json' };

export { tidy };
export const TARGET = 'my-markless-app';
export const PAGE_FILE = 'pages/index.tsrx';
/** Nitro's dev server takes port 3000 unless it is busy. */
export const PORT = 3000;
/** The Vite+ banner names the vite-plus version the starter pins. */
export const BANNER = `VITE+ v${starterManifest.dependencies['vite-plus']}`;
export const HOST = `localhost:${PORT}`;
export const URL_LINE = `http://${HOST}/`;
/** The commands that run the dev script with each manager; Deno also takes the `deno run dev` the create figure prints for a Node app it launched. */
export const devCommands = (manager: ManagerId): readonly string[] => [...new Set([scriptCommand(manager, 'dev'), devCommand('node', manager)])];

/** The starter page from packages/cli/templates/starters/minimal/pages/index.tsrx. */
export const HEADING = 'Markless Router';
export const LABEL = 'Count';

export interface Row {
	readonly mark: string;
	readonly text: string;
	/** cmd, prompt, banner, local, note, blank, start, footer */
	readonly kind: string;
	/** A command no manager accepts, typed or echoed: yes or no. */
	readonly invalid: string;
	/** On an empty prompt, each manager's command in MANAGERS order; the page's <html data-package-manager> shows the saved one. */
	readonly wait0: string;
	readonly wait1: string;
	readonly wait2: string;
	readonly wait3: string;
	readonly wait4: string;
	/** On the prompt line: the caret, the text after it, and the faint suggestion. */
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}

const row = (mark: string, text: string, kind: string): Row => ({ mark, text, kind, caret: '', after: '', ghost: '', invalid: 'no', ...NO_WAIT });
const BLANK = row('', '', 'blank');

/** The line already run when the figure opens. */
export const DONE = row('$', `cd ${TARGET}`, 'cmd');
/** The server's output, trimmed to the lines that matter. */
export const OUTPUT: readonly Row[] = [BLANK, row('', BANNER, 'banner'), BLANK, row('➜', `Local:   ${URL_LINE}`, 'local'), row('➜', 'Network: use --host to expose', 'note')];
/** The longest line the reader can type. */
export const MAX_TYPED = 32;
/** Lines the terminal sheet holds; older lines scroll off the top. */
export const SLOTS = 1 + 1 + OUTPUT.length;

/** off: the prompt waits; starting: the server prints its output; on: the browser shows the page. */
export type Phase = 'off' | 'starting' | 'on';

export interface Desk {
	/** Lines above the prompt: the cd, then any mistyped commands and their hints. */
	readonly history: readonly Row[];
	readonly phase: Phase;
	/** Output lines printed so far. */
	readonly shown: number;
	readonly count: number;
	/** The command that started the server, and the manager it ran with. */
	readonly command: string;
	readonly manager: ManagerId;
}
export const START: Desk = { history: [DONE], phase: 'off', shown: 0, count: 0, command: '', manager: 'npm' };

/** Enter at the prompt: any manager's dev command starts the server with it, an empty line takes the saved manager's; anything else prints a hint and a fresh prompt. */
export function enter(desk: Desk, typed: string, saved: ManagerId = 'npm'): Desk {
	if (desk.phase !== 'off') return desk;
	const line = tidy(typed) || scriptCommand(saved, 'dev');
	const manager = ranWith(line, devCommands);
	if (manager) return { ...desk, phase: 'starting', shown: 0, command: line, manager };
	return { ...desk, history: [...desk.history, { ...row('$', line, 'cmd'), invalid: 'yes' }, row('', `Try ${scriptCommand(saved, 'dev')}`, 'note')] };
}

/** Ctrl+C: at the prompt it abandons the line; while the server runs it stops it, leaves its output above, and opens a fresh prompt. */
export function interrupt(desk: Desk, typed: string): Desk {
	if (desk.phase === 'off') return { ...desk, history: [...desk.history, row('$', `${typed}^C`, 'cmd')] };
	return { ...desk, history: [...desk.history, row('$', desk.command, 'cmd'), ...OUTPUT.slice(0, desk.shown), row('', '^C', 'note')], phase: 'off', shown: 0, count: 0 };
}

/** One more output line; after the last one the server serves the page. */
export function print(desk: Desk): Desk {
	if (desk.phase !== 'starting') return desk;
	const shown = desk.shown + 1;
	return shown >= OUTPUT.length ? { ...desk, phase: 'on', shown: OUTPUT.length } : { ...desk, shown };
}

/** The page's own handler, `count++`; the button only exists once the server serves the page. */
export const press = (desk: Desk): Desk => (desk.phase === 'on' ? { ...desk, count: desk.count + 1 } : desk);

/** The suggestion shown faintly after the caret: the rest of whichever manager's dev command the text starts, the saved manager's first. */
export const ghostFor = (typed: string, saved: ManagerId = 'npm') => completion(typed, saved, devCommands);


/** Whether Tab would take a suggestion: the prompt is open and the caret is at the end of a line that has one; an empty prompt always suggests the saved manager's command. */
export const completesAt = (desk: Desk, typed: string, at: number) => desk.phase === 'off' && at === typed.length && ghostFor(typed) !== '';

/** The bottom row, kept clear for the footer naming the other managers while the prompt is empty. */
export const FOOTER = row('', '', 'footer');
export const showsFooter = (desk: Desk, typed: string) => desk.phase === 'off' && typed === '';

/** What the sheet shows: history, the prompt with what is typed, the output so far, scrolled so the newest line is on the sheet, and the footer on the bottom row while the prompt is empty. */
export function screen(desk: Desk, typed = '', at = typed.length): Row[] {
	const prompt =
		desk.phase === 'off'
			? { ...row('$', typed.slice(0, at), 'prompt'), caret: '|', after: typed.slice(at), ghost: at === typed.length && typed !== '' ? ghostFor(typed) : '', invalid: isInvalid(typed, devCommands) ? 'yes' : 'no', ...(typed === '' ? waitsOf(devCommands) : NO_WAIT) }
			: row('$', desk.command, 'cmd');
	const hint = desk.phase === 'off' && desk.history.length === 1 ? [row('', '↵ Press Enter to run it', 'start')] : [];
	const foot = showsFooter(desk, typed) ? [FOOTER] : [];
	const all = [...desk.history, prompt, ...hint, ...OUTPUT.slice(0, desk.shown)];
	const rows = all.slice(-(SLOTS - foot.length));
	return [...rows, ...Array.from({ length: SLOTS - foot.length - rows.length }, () => BLANK), ...foot];
}

/** The yellow wash under the number comes in three widths: one, two and three digits. */
export const washFor = (count: number) => Math.min(String(count).length, 3) - 1;

/** The sentence the live region speaks after each change. */
export function describe(desk: Desk, pressed = false): string {
	if (desk.phase === 'off') return desk.history.at(-1)!.text;
	if (desk.phase === 'starting') return OUTPUT.slice(0, desk.shown).findLast((r) => r.text)?.text ?? desk.command;
	if (pressed) return `${LABEL} ${desk.count}. The button on the page counted the click.`;
	return `The dev server is running at ${URL_LINE}. The browser shows ${PAGE_FILE}: a ${HEADING} heading and a ${LABEL} ${desk.count} button. Press it to count.`;
}
