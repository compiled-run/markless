// A coding-agent session on the Beanshop site, as the figure replays it: the agent follows the skill `markless-migrate setup` installs (src/agents/skill.ts), and its commands, check dimensions and output wording follow markless-migrate's src/cli.ts, src/plan/inventory.ts, src/check/summary.ts and src/switch/state.ts.
export const COLS = 44;
export const ROWS = 15;
export const OLD = 'http://localhost:3000';
export const ROUTES = ['/', '/menu', '/account', '/blog'] as const;
export const PAGE = '/account';
export const JS = { old: '84.0 kB', new: '1.1 kB' };
/** The request the prompt suggests; Enter on an empty prompt sends it. */
export const ASK = 'Use Markless Migrate on my coffee shop site';

/** The agents `markless-migrate setup` installs the skill for; the first is open until the reader picks another. */
export const AGENTS = [
	{ id: 'claude', label: 'Claude Code' },
	{ id: 'codex', label: 'Codex' },
	{ id: 'cursor', label: 'Cursor' },
	{ id: 'gemini', label: 'Gemini CLI' },
	{ id: 'copilot', label: 'GitHub Copilot CLI' },
	{ id: 'opencode', label: 'opencode' },
] as const;
export type AgentId = (typeof AGENTS)[number]['id'];
export const agentOf = (id: string) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];

/** The checks, in the page's plain words, with the report dimension each one is. */
export const CHECKS = [
	{ plain: 'what people see', dimension: 'visual' },
	{ plain: 'every button works', dimension: 'behaviour' },
	{ plain: 'same requests', dimension: 'network' },
	{ plain: 'what search engines get', dimension: 'seo' },
	{ plain: 'what screen readers get', dimension: 'a11y' },
	{ plain: 'how fast it loads', dimension: 'load' },
] as const;
export const FAILING = 'behaviour';

export interface Line {
	readonly mark: string;
	readonly text: string;
	/** Faint text in its own column, like the dimension behind a check. */
	readonly value: string;
	/** out, head, pass, fail, reason, agent, cmd, path */
	readonly kind: string;
	/** Milliseconds before the line prints. */
	readonly pause: number;
	/** What the report shows once this line has printed. */
	readonly report: '' | 'listed' | 'red' | 'green' | 'live';
	/** The sentence the live region speaks once this line has printed. */
	readonly say: string;
}
const out = (text: string, kind = 'out', pause = 90, more: Partial<Line> = {}): Line => ({ mark: '', text, value: '', kind, pause, report: '', say: '', ...more });
const agentSays = (text: string, pause: number, more: Partial<Line> = {}) => out(text, 'agent', pause, { mark: '●', ...more });
const shell = (text: string, pause = 500) => out(text, 'cmd', pause, { mark: '$' });
const ticks = (failing: boolean): Line[] =>
	CHECKS.flatMap((c) => {
		const bad = failing && c.dimension === FAILING;
		const row = out(c.plain, bad ? 'fail' : 'pass', 240, { mark: bad ? '✗' : '✓', value: c.dimension });
		return bad ? [row, out('  click "Settings": the old page opens', 'reason', 120), out('  its settings panel, the new one does not', 'reason', 120)] : [row];
	});

export const PLAN = 'markless-migrate plan --old $OLD --source ../beanshop';
export const CHECK = `markless-migrate check --old $OLD --new $NEW --route ${PAGE}`;
export const SWITCH = `markless-migrate switch ${PAGE}`;
const others = ROUTES.filter((r) => r !== PAGE);
const listed = `${others.slice(0, -1).join(', ')} and ${others.at(-1)}`;

/** What the agent does with the request, line by line: plan, convert one page, check it, fix what the check found, check again, and switch it only once it passes. */
export function session(id: AgentId): readonly Line[] {
	const agent = agentOf(id).label;
	return [
		agentSays("I'll take stock of the old site first.", 900),
		shell(PLAN, 600),
		out(`4 routes on the old site to port, from crawl 4, source 4`, 'head', 900),
		out('  200 /  "Beanshop"'),
		out('  200 /menu  "Menu · Beanshop"'),
		out('  200 /account  "Your account · Beanshop"'),
		out('  200 /blog  "Journal · Beanshop"'),
		out('Wrote .migrate/inventory.json', 'path', 200, { report: 'listed', say: `Markless Migrate planned 4 pages: ${ROUTES.slice(0, -1).join(', ')} and ${ROUTES.at(-1)}.` }),
		agentSays(`Converting ${PAGE} to Markless first.`, 1100),
		agentSays(`Converted ${PAGE}: pages/account.tsrx`, 2000),
		shell(CHECK),
		...ticks(true),
		out(`FAIL  ${PAGE}  [${FAILING}]`, 'fail', 300, { report: 'red', say: `The check failed one thing: on the new ${PAGE}, the Settings button opens nothing.` }),
		out('0 of 1 routes green, 1 red.', 'out', 150),
		agentSays('The new Settings button opens nothing. Fixing it.', 1200),
		agentSays('Fixed: the panel opens on click again.', 1900),
		shell(CHECK),
		...ticks(false),
		out(`pass  ${PAGE}`, 'head', 300, { report: 'green' }),
		out(`  run at load ${JS.old} -> ${JS.new}`),
		out('1 of 1 routes green.', 'out', 150, { say: `${agent} fixed it and every check passed. JavaScript run at load goes from ${JS.old} to ${JS.new}.` }),
		out(`Partial run: 1 of ${ROUTES.length} routes checked.`, 'path', 100),
		agentSays(`It passes. Switching ${PAGE} to Markless.`, 1000),
		shell(SWITCH),
		out(`Switched ${PAGE} to the new app.`, 'head', 400, { report: 'live' }),
		out('  .migrate/switched.json', 'path', 100),
		agentSays(`${PAGE} is live. The old app still serves ${listed} until each one passes its check too.`, 900, { say: `${PAGE} is live, served by Markless. ${listed} are still served by the old app.` }),
	];
}

/** What was entered at the prompt: the request the agent took, or a line it did not (abandoned with Ctrl+C, or typed once the session is done). */
export type Entry = { readonly ask: string } | string;
/** The session: what was entered, the agent it is open in, and how much of the agent's work has printed. */
export interface Run {
	readonly log: readonly Entry[];
	readonly agent: AgentId;
	readonly shown: number;
	readonly wait: number;
}
export const START: Run = { log: [], agent: 'claude', shown: 0, wait: 0 };
const askIn = (run: Run) => run.log.find((e): e is { ask: string } => typeof e !== 'string')?.ask;
/** Whether the reader has sent a request yet. */
export const sent = (run: Run) => askIn(run) !== undefined;
const lastIsAsk = (run: Run) => typeof run.log.at(-1) === 'object';
/** Whether the agent is still working; the prompt comes back when it is done. */
export const printing = (run: Run) => lastIsAsk(run) && run.shown < session(run.agent).length;

export const tidy = (typed: string) => typed.trim().replace(/\s+/g, ' ');
export const TICK_MS = 60;
const ticksFor = (ms: number) => Math.round(ms / TICK_MS);

/** One tick of printing: count down the pause before the next line, then print it. */
export function print(run: Run): Run {
	if (!printing(run)) return run;
	if (run.wait > 0) return { ...run, wait: run.wait - 1 };
	const lines = session(run.agent);
	const shown = run.shown + 1;
	return { ...run, shown, wait: shown < lines.length ? ticksFor(lines[shown]!.pause) : 0 };
}
/** Everything the agent prints, at once, for reduced motion. */
export const printAll = (run: Run): Run => (printing(run) ? { ...run, shown: session(run.agent).length, wait: 0 } : run);

/** The agent a typed line names, by id or by its own name, so the keyboard can switch agents as the footer does. */
export const agentNamed = (line: string) => AGENTS.find((a) => a.id === line.toLowerCase() || a.label.toLowerCase() === line.toLowerCase())?.id;
/** Opens the session in another agent, before anything is sent. */
export const pickAgent = (run: Run, id: string): Run => (sent(run) ? run : { ...run, agent: agentNamed(id) ?? run.agent });

const keepLastTry = (log: readonly Entry[]) => {
	const ask = log.findIndex((e) => typeof e !== 'string');
	return ask < 0 ? log.slice(-1) : [...log.slice(0, ask + 1), ...log.slice(ask + 1).slice(-1)];
};

/** Enter: before anything is sent, an agent's name opens that agent and any other line (or the suggestion, on an empty prompt) is the request; afterwards a line is echoed with a hint. */
export function submit(run: Run, text = ''): Run {
	if (printing(run)) return run;
	const line = tidy(text);
	if (!sent(run)) {
		if (agentNamed(line)) return pickAgent(run, line);
		const asked = { ...run, log: [...keepLastTry(run.log), { ask: line || ASK }], shown: 0 };
		return { ...asked, wait: ticksFor(session(run.agent)[0]!.pause) };
	}
	if (line === '') return run;
	return { ...run, log: keepLastTry([...run.log, line]) };
}

/** Ctrl+C abandons the line, as a shell does. */
export const interrupt = (run: Run, typed: string): Run => (printing(run) ? run : { ...run, log: keepLastTry([...run.log, `${typed}^C`]) });

/** The faint rest of the suggested request, while what is typed starts it. */
export const ghostFor = (run: Run, typed: string) => (!sent(run) && ASK.startsWith(typed) ? ASK.slice(typed.length) : '');
export const invalidAt = (run: Run, typed: string) => typed !== '' && sent(run);
export const completesAt = (run: Run, typed: string, at: number) => at === typed.length && ghostFor(run, typed) !== '';
export const MAX_TYPED = 80;

export interface Row {
	readonly mark: string;
	readonly text: string;
	readonly value: string;
	/** banner, prompt, cmd, out, head, pass, fail, reason, agent, path, try, input, start, blank, footer */
	readonly kind: string;
	readonly invalid: string;
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}
const row = (mark: string, text = '', kind = 'out', value = ''): Row => ({ mark, text, value, kind, invalid: 'no', caret: '', after: '', ghost: '' });
const BLANK = row('', '', 'blank');
/** The bottom row, kept clear for the footer naming the other agents while nothing has been sent. */
export const FOOTER = row('', '', 'footer');

/** For each open agent, the others the footer names, each with the separator before it. */
export const FOOTERS = AGENTS.map((open) => ({
	agent: open.id,
	others: AGENTS.filter((a) => a.id !== open.id).map((a, k) => ({ id: a.id, gap: k === 0 ? '' : ' · ' })),
}));
export const showsFooter = (run: Run, typed: string) => !sent(run) && typed === '';

/** Where a long line wraps: after the last space that fits, or at the width when none does. */
export function breaks(text: string, width = COLS): number[] {
	const starts = [0];
	while (text.length - starts.at(-1)! > width) {
		const from = starts.at(-1)!;
		const space = text.lastIndexOf(' ', from + width);
		starts.push(space > from ? space + 1 : from + width);
	}
	return starts;
}
const wrapped = (mark: string, text: string, kind: string): Row[] => {
	const at = breaks(text);
	return at.map((s, i) => row(i === 0 ? mark : '', text.slice(s, at[i + 1] ?? text.length).trimEnd(), kind));
};

/** The line being typed, wrapped like the echo it becomes: each piece carries its share of the text before the caret, the caret, the text after it, and the faint suggestion. */
export function inputRows(typed: string, at: number, ghost: string, invalid: boolean): Row[] {
	const full = typed + ghost;
	const starts = breaks(full);
	return starts.map((s, i) => {
		const e = starts[i + 1] ?? full.length;
		const last = i === starts.length - 1;
		const here = (at >= s && at < e) || (last && at === e);
		const end = Math.min(e, typed.length);
		const before = here ? typed.slice(s, at) : at >= e ? typed.slice(s, end) : '';
		return {
			...row(i === 0 ? '>' : '', before || '\u200b', 'input'),
			caret: here ? '|' : '',
			after: here ? typed.slice(at, end) : at < s ? typed.slice(s, end) : '',
			ghost: full.slice(Math.max(s, typed.length), e),
			invalid: invalid ? 'yes' : 'no',
		};
	});
}

/** The whole session so far, top to bottom: the agent's name, each line entered and what the agent did, then the prompt once it is done. */
export function transcript(run: Run, typed = '', at = typed.length): Row[] {
	const rows: Row[] = [row('', agentOf(run.agent).label, 'banner')];
	run.log.forEach((entry, i) => {
		if (typeof entry !== 'string') {
			const lines = session(run.agent);
			rows.push(...wrapped('>', entry.ask, 'prompt'));
			for (const line of i === run.log.length - 1 ? lines.slice(0, run.shown) : lines) rows.push(...(line.value ? [row(line.mark, line.text, line.kind, line.value)] : wrapped(line.mark, line.text, line.kind)));
			return;
		}
		if (entry.endsWith('^C')) return rows.push(...wrapped('>', entry, 'prompt'));
		rows.push(...wrapped('>', entry, 'prompt').map((r) => ({ ...r, invalid: 'yes' })));
		rows.push(row('', 'Done. Press Escape to start over.', 'try'));
	});
	if (printing(run)) return rows;
	rows.push(...inputRows(typed, at, at === typed.length ? ghostFor(run, typed) : '', invalidAt(run, typed)));
	if (!sent(run)) rows.push(row('', '↵ Press Enter to ask it', 'start'));
	else if (lastIsAsk(run)) rows.push(row('', 'Esc starts over', 'start'));
	return rows;
}

/** What the terminal shows: the last rows, like a terminal that scrolls, and the footer on the bottom row while nothing has been sent. */
export function screen(run: Run, typed = '', at = typed.length): Row[] {
	const foot = showsFooter(run, typed) ? [FOOTER] : [];
	const all = transcript(run, typed, at).slice(-(ROWS - foot.length));
	return [...all, ...Array.from({ length: ROWS - foot.length - all.length }, () => BLANK), ...foot];
}
export const focusRow = (rows: readonly Row[]) => rows.findIndex((r) => r.kind === 'input');

const printed = (run: Run) => run.log.flatMap((entry, i) => (typeof entry === 'string' ? [] : i === run.log.length - 1 ? session(run.agent).slice(0, run.shown) : session(run.agent)));

/** What the report below the terminal shows, from what has printed so far: the routes once planned, the old and new screenshots once checked, red or green, and which app serves the page. */
export function reportOf(run: Run) {
	const marks = printed(run).map((l) => l.report);
	const check = marks.findLast((m) => m === 'red' || m === 'green');
	return { listed: marks.includes('listed') ? 'yes' : 'no', check: check ?? 'none', live: marks.includes('live') ? 'yes' : 'no' };
}
export const servedBy = (route: string, run: Run) => (route === PAGE && reportOf(run).live === 'yes' ? 'Markless' : 'old app');

export function labelOf(run: Run): string {
	const agent = agentOf(run.agent).label;
	if (printing(run)) return `Terminal with ${agent} open. ${agent} is working.`;
	if (sent(run)) return `Terminal with ${agent} open. ${agent} is done; press Escape to start over.`;
	return `Terminal with ${agent} open. Press Enter to ask: ${ASK}, or type your own request. Type another agent's name to open it instead: ${AGENTS.filter((a) => a.id !== run.agent).map((a) => a.id).join(', ')}. Arrow Up recalls earlier lines, Escape starts over.`;
}

/** The sentence the live region speaks: the latest step the agent finished. */
export function describe(run: Run): string {
	const last = run.log.at(-1);
	if (last === undefined) return '';
	if (typeof last === 'string') return last.endsWith('^C') ? 'Line abandoned.' : 'Done. Press Escape to start over.';
	const said = printed(run).findLast((l) => l.say)?.say;
	return said ?? `Sent to ${agentOf(run.agent).label}: ${last.ask}`;
}
export const openSentence = (run: Run) => `${agentOf(run.agent).label} is open.`;

/** The idle tour, one tick at a time: wait, type the suggestion two characters a tick, press Enter, let the agent work, hold while the reader looks, then start over in the next agent. */
export interface Tour {
	readonly run: Run;
	readonly typed: string;
	readonly wait: number;
	readonly entered: boolean;
	/** Which pass of the tour this is: each pass opens the next agent, starting with the one open on load. */
	readonly loop: number;
}
const HOLD = 5200;
export const TOUR_START: Tour = { run: START, typed: '', wait: ticksFor(1400), entered: false, loop: 0 };
export const tourAgent = (loop: number) => AGENTS[loop % AGENTS.length]!.id;
export function tour(t: Tour): Tour {
	if (printing(t.run)) {
		const run = print(t.run);
		return { ...t, run, entered: false, wait: printing(run) ? 0 : ticksFor(HOLD) };
	}
	if (t.wait > 0) return { ...t, wait: t.wait - 1, entered: false };
	if (sent(t.run)) return { ...TOUR_START, run: { ...START, agent: tourAgent(t.loop + 1) }, loop: t.loop + 1 };
	if (t.typed.length < ASK.length) return { ...t, typed: ASK.slice(0, t.typed.length + 2), entered: false };
	return { ...t, run: submit(t.run, t.typed), typed: '', wait: 0, entered: true };
}
