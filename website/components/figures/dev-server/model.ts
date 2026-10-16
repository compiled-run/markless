// The dev server run as the figure plays it: the command the reader types, the lines `npm run dev` really prints for the 0.5.0 starter, and the starter's first page.
export const TARGET = 'my-markless-app';
export const PAGE_FILE = 'pages/index.tsrx';
/** Nitro's dev server takes port 3000 unless it is busy; the Vite+ banner is from the starter's pinned vite-plus 0.3.1. */
export const PORT = 3000;
export const HOST = `localhost:${PORT}`;
export const URL_LINE = `http://${HOST}/`;
export const COMMAND = 'npm run dev';

/** The starter page from packages/cli/templates/starters/minimal/pages/index.tsrx. */
export const HEADING = 'Markless Router';
export const LABEL = 'Count';

export interface Row {
	readonly mark: string;
	readonly text: string;
	/** cmd, prompt, banner, local, note, blank */
	readonly kind: string;
	/** On the prompt line: the caret, the text after it, and the faint suggestion. */
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}

const row = (mark: string, text: string, kind: string): Row => ({ mark, text, kind, caret: '', after: '', ghost: '' });
const BLANK = row('', '', 'blank');

/** The line already run when the figure opens. */
export const DONE = row('$', `cd ${TARGET}`, 'cmd');
/** The server's output, trimmed to the lines that matter. */
export const OUTPUT: readonly Row[] = [BLANK, row('', 'VITE+ v0.3.1', 'banner'), BLANK, row('➜', `Local:   ${URL_LINE}`, 'local'), row('➜', 'Network: use --host to expose', 'note')];
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
}
export const START: Desk = { history: [DONE], phase: 'off', shown: 0, count: 0 };

export const tidy = (typed: string) => typed.trim().replace(/\s+/g, ' ');

/** Enter at the prompt: an empty line takes the ghost command; anything but npm run dev prints a hint and a fresh prompt. */
export function enter(desk: Desk, typed: string): Desk {
	if (desk.phase !== 'off') return desk;
	const line = tidy(typed) || COMMAND;
	if (line === COMMAND) return { ...desk, phase: 'starting', shown: 0 };
	return { ...desk, history: [...desk.history, row('$', line, 'cmd'), row('', `Try ${COMMAND}`, 'note')] };
}

/** Ctrl+C: at the prompt it abandons the line; while the server runs it stops it, leaves its output above, and opens a fresh prompt. */
export function interrupt(desk: Desk, typed: string): Desk {
	if (desk.phase === 'off') return { ...desk, history: [...desk.history, row('$', `${typed}^C`, 'cmd')] };
	return { history: [...desk.history, row('$', COMMAND, 'cmd'), ...OUTPUT.slice(0, desk.shown), row('', '^C', 'note')], phase: 'off', shown: 0, count: 0 };
}

/** One more output line; after the last one the server serves the page. */
export function print(desk: Desk): Desk {
	if (desk.phase !== 'starting') return desk;
	const shown = desk.shown + 1;
	return shown >= OUTPUT.length ? { ...desk, phase: 'on', shown: OUTPUT.length } : { ...desk, shown };
}

/** The page's own handler, `count++`; the button only exists once the server serves the page. */
export const press = (desk: Desk): Desk => (desk.phase === 'on' ? { ...desk, count: desk.count + 1 } : desk);

/** The suggestion shown faintly after the caret: the rest of npm run dev, while what is typed still leads to it. */
export const ghostFor = (typed: string) => (COMMAND.startsWith(typed) ? COMMAND.slice(typed.length) : '');

/** What the sheet shows: history, the prompt with what is typed, the output so far, scrolled so the newest line is on the sheet. */
export function screen(desk: Desk, typed = '', at = typed.length): Row[] {
	const prompt = desk.phase === 'off' ? { ...row('$', typed.slice(0, at), 'prompt'), caret: '|', after: typed.slice(at), ghost: at === typed.length ? ghostFor(typed) : '' } : row('$', COMMAND, 'cmd');
	const hint = desk.phase === 'off' && desk.history.length === 1 ? [row('', '↵ Press Enter to run it', 'start')] : [];
	const all = [...desk.history, prompt, ...hint, ...OUTPUT.slice(0, desk.shown)];
	const top = Math.max(0, all.length - SLOTS);
	const rows = all.slice(top);
	return [...rows, ...Array.from({ length: SLOTS - rows.length }, () => BLANK)];
}

/** The yellow wash under the number comes in three widths: one, two and three digits. */
export const washFor = (count: number) => Math.min(String(count).length, 3) - 1;

/** The sentence the live region speaks after each change. */
export function describe(desk: Desk, pressed = false): string {
	if (desk.phase === 'off') return desk.history.at(-1)!.text;
	if (desk.phase === 'starting') return OUTPUT.slice(0, desk.shown).findLast((r) => r.text)?.text ?? COMMAND;
	if (pressed) return `${LABEL} ${desk.count}. The button on the page counted the click.`;
	return `The dev server is running at ${URL_LINE}. The browser shows ${PAGE_FILE}: a ${HEADING} heading and a ${LABEL} ${desk.count} button. Press it to count.`;
}
