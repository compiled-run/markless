// A markless-migrate run on a small shop, as the figure replays it; commands, agent ids, check dimensions and summary wording follow markless-migrate's src/cli.ts, src/run/drivers.ts, src/run/loop.ts, src/check/summary.ts and src/switch/state.ts.
export const COLS = 44;
export const ROWS = 15;
export const OLD = 'http://localhost:3000';
export const ROUTES = ['/', '/pricing', '/account', '/blog'] as const;
export const PAGE = '/account';
export const JS = { old: '84.0 kB', new: '1.1 kB' };
export const ATTEMPTS = 3;

/** The agents `run --agent` drives, with the binary it starts and the agent's own name; the first is suggested until the reader runs another. */
export const AGENTS = [
	{ id: 'claude', binary: 'claude', label: 'Claude Code' },
	{ id: 'codex', binary: 'codex', label: 'Codex' },
	{ id: 'cursor', binary: 'cursor-agent', label: 'Cursor' },
	{ id: 'gemini', binary: 'gemini', label: 'Gemini CLI' },
	{ id: 'copilot', binary: 'copilot', label: 'GitHub Copilot CLI' },
	{ id: 'opencode', binary: 'opencode', label: 'opencode' },
] as const;
export type AgentId = (typeof AGENTS)[number]['id'];
export const agentOf = (id: string) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];

/** The checks, in plain words, with the report dimension each one is. */
export const CHECKS = [
	{ plain: 'looks the same', dimension: 'visual' },
	{ plain: 'every button works', dimension: 'behaviour' },
	{ plain: 'same requests', dimension: 'network' },
	{ plain: 'same SEO', dimension: 'seo' },
	{ plain: 'screen reader the same', dimension: 'rendered' },
	{ plain: 'every language', dimension: 'i18n' },
	{ plain: 'signed in and out', dimension: 'auth' },
] as const;
export const FAILING = 'behaviour';

export interface Line {
	readonly mark: string;
	readonly text: string;
	/** Faint text in its own column, like the dimension behind a check. */
	readonly value: string;
	/** out, head, pass, fail, reason, agent, path */
	readonly kind: string;
	/** Milliseconds before the line prints. */
	readonly pause: number;
	/** What the report shows once this line has printed. */
	readonly report: '' | 'listed' | 'red' | 'green' | 'live';
}
const out = (text: string, kind = 'out', pause = 90, more: Partial<Line> = {}): Line => ({ mark: '', text, value: '', kind, pause, report: '', ...more });
const ticks = (failing: boolean): Line[] =>
	CHECKS.flatMap((c) => {
		const bad = failing && c.dimension === FAILING;
		const row = out(c.plain, bad ? 'fail' : 'pass', 240, { mark: bad ? '✗' : '✓', value: c.dimension, report: bad ? 'red' : '' });
		return bad ? [row, out('  click "Settings": the old page opens', 'reason', 120), out('  its settings panel, the new one does not', 'reason', 120)] : [row];
	});

export const runCommand = (agent: string) => `markless-migrate run --agent ${agent} --old $OLD --new $NEW --route ${PAGE}`;
export const PLAN = 'markless-migrate plan --old $OLD --source ../shop';
export const SWITCH = `markless-migrate switch ${PAGE}`;

export interface Step {
	readonly key: 'plan' | 'run' | 'switch';
	/** Every command that runs this step, the suggested one first. */
	readonly commands: (agent: AgentId) => readonly string[];
	readonly out: (agent: AgentId) => readonly Line[];
	/** How long the idle tour lets the reader look once the output has printed. */
	readonly hold: number;
}

export const STEPS: readonly Step[] = [
	{
		key: 'plan',
		commands: () => [PLAN],
		out: () => [
			out(`4 routes on ${OLD}`, 'head', 500),
			out('  200 /         8 links, 2 scripts'),
			out('  200 /pricing  6 links, 1 form, 2 scripts'),
			out('  200 /account  5 links, 2 forms, 4 scripts'),
			out('  200 /blog     12 links, 2 scripts'),
			out('Libraries: 2 (react-hook-form, swr)', 'out', 300),
			out('Wrote .migrate/inventory.json', 'path', 200, { report: 'listed' }),
		],
		hold: 2600,
	},
	{
		key: 'run',
		commands: (agent) => [runCommand(agent), ...AGENTS.filter((a) => a.id !== agent).map((a) => runCommand(a.id))],
		out: (id) => {
			const agent = agentOf(id);
			return [
				out(`attempt 1/${ATTEMPTS}  ${PAGE}: running ${agent.binary}`, 'out', 900),
				out(`${agent.label} converted ${PAGE}`, 'agent', 1700, { mark: '●' }),
				out(`check ${PAGE}`, 'path', 500),
				...ticks(true),
				out(`attempt 2/${ATTEMPTS}  ${PAGE}: running ${agent.binary}`, 'out', 1400),
				out(`${agent.label} fixed what check found`, 'agent', 1700, { mark: '●' }),
				out(`check ${PAGE}`, 'path', 500),
				...ticks(false),
				out(`green          ${PAGE} after 2 attempt(s)`, 'head', 400, { report: 'green' }),
				out('1 of 1 routes green. Log: .migrate/run.log', 'out', 200),
			];
		},
		hold: 3800,
	},
	{ key: 'switch', commands: () => [SWITCH], out: () => [out(`Switched ${PAGE} to the new app.`, 'head', 400, { report: 'live' }), out('  .migrate/switched.json', 'path', 100)], hold: 5200 },
];

export type Entry = number | string;
/** The run: what was entered at the prompt (a number is a step that ran, a string a line no step takes), the agent the run step uses, and how much of the last step's output has printed. */
export interface Run {
	readonly log: readonly Entry[];
	readonly agent: AgentId;
	readonly shown: number;
	readonly wait: number;
}
export const START: Run = { log: [], agent: 'claude', shown: 0, wait: 0 };
export const doneOf = (run: Run) => run.log.filter((e) => typeof e === 'number').length;
export const nextOf = (run: Run): Step | undefined => STEPS[doneOf(run)];
const lastStep = (run: Run) => {
	const last = run.log.at(-1);
	return typeof last === 'number' ? last : -1;
};
const outOf = (run: Run, step: number) => STEPS[step]!.out(run.agent);
/** Whether the last command is still printing; the prompt comes back when it is done. */
export const printing = (run: Run) => lastStep(run) >= 0 && run.shown < outOf(run, lastStep(run)).length;

export const tidy = (typed: string) => typed.trim().replace(/\s+/g, ' ');
export const TICK_MS = 60;
const ticksFor = (ms: number) => Math.round(ms / TICK_MS);

/** One tick of printing: count down the pause before the next line, then print it. */
export function print(run: Run): Run {
	if (!printing(run)) return run;
	if (run.wait > 0) return { ...run, wait: run.wait - 1 };
	const lines = outOf(run, lastStep(run));
	const shown = run.shown + 1;
	return { ...run, shown, wait: shown < lines.length ? ticksFor(lines[shown]!.pause) : 0 };
}
/** Everything the last command prints, at once, for reduced motion. */
export const printAll = (run: Run): Run => (printing(run) ? { ...run, shown: outOf(run, lastStep(run)).length, wait: 0 } : run);

const agentIn = (line: string) => AGENTS.find((a) => runCommand(a.id) === line)?.id;

/** Enter: an empty line runs the suggested command, the next step's command (with any agent, for run) runs it, anything else is echoed with a hint. */
export function submit(run: Run, text = ''): Run {
	if (printing(run)) return run;
	const next = nextOf(run);
	const line = tidy(text);
	if (next && (line === '' || next.commands(run.agent).includes(line))) {
		const agent = next.key === 'run' ? (agentIn(line) ?? run.agent) : run.agent;
		const ran = { ...run, log: [...run.log, doneOf(run)], agent, shown: 0 };
		return { ...ran, wait: ticksFor(outOf(ran, lastStep(ran))[0]!.pause) };
	}
	if (line === '') return run;
	return { ...run, log: [...withoutOldTries(run.log), line] };
}
const withoutOldTries = (log: readonly Entry[]) => {
	const last = log.findLastIndex((e) => typeof e === 'number');
	return [...log.slice(0, last + 1), ...log.slice(last + 1).slice(-1)];
};

/** Ctrl+C abandons the line, as a shell does. */
export const interrupt = (run: Run, typed: string): Run => (printing(run) ? run : { ...run, log: [...withoutOldTries(run.log), `${typed}^C`] });

/** The faint rest of the first command the typed text starts, the suggested agent's first. */
export const ghostFor = (run: Run, typed: string) => {
	const command = nextOf(run)?.commands(run.agent).find((c) => c.startsWith(typed));
	return command ? command.slice(typed.length) : '';
};
export const invalidAt = (run: Run, typed: string) => typed !== '' && !(nextOf(run)?.commands(run.agent) ?? []).some((c) => c.startsWith(typed));
export const completesAt = (run: Run, typed: string, at: number) => at === typed.length && ghostFor(run, typed) !== '';
export const MAX_TYPED = 80;

export interface Row {
	readonly mark: string;
	readonly text: string;
	readonly value: string;
	/** cmd, out, head, pass, fail, reason, agent, path, try, input, start, blank, footer */
	readonly kind: string;
	readonly invalid: string;
	readonly caret: string;
	readonly after: string;
	readonly ghost: string;
}
const row = (mark: string, text = '', kind = 'out', value = ''): Row => ({ mark, text, value, kind, invalid: 'no', caret: '', after: '', ghost: '' });
const BLANK = row('', '', 'blank');
/** The bottom row, kept clear for the footer naming the other agents while the run prompt is empty. */
export const FOOTER = row('', '', 'footer');

/** For each suggested agent, the others the footer names, each with the separator before it. */
export const FOOTERS = AGENTS.map((suggested) => ({
	agent: suggested.id,
	others: AGENTS.filter((a) => a.id !== suggested.id).map((a, k) => ({ id: a.id, gap: k === 0 ? '' : ' · ' })),
}));
export const showsFooter = (run: Run, typed: string) => !printing(run) && typed === '' && nextOf(run)?.key === 'run';

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
			...row(i === 0 ? '$' : '', before || '\u200b', 'input'),
			caret: here ? '|' : '',
			after: here ? typed.slice(at, end) : at < s ? typed.slice(s, end) : '',
			ghost: full.slice(Math.max(s, typed.length), e),
			invalid: invalid ? 'yes' : 'no',
		};
	});
}

/** The command a step entry ran, as it was typed: the run step names its agent. */
const commandOf = (run: Run, step: number) => (STEPS[step]!.key === 'run' ? runCommand(run.agent) : STEPS[step]!.commands(run.agent)[0]!);

/** The whole transcript so far, top to bottom: each command and what it printed, then the prompt once the last command is done. */
export function transcript(run: Run, typed = '', at = typed.length): Row[] {
	const rows: Row[] = [];
	run.log.forEach((entry, i) => {
		if (typeof entry === 'number') {
			const lines = outOf(run, entry);
			rows.push(...wrapped('$', commandOf(run, entry), 'cmd'));
			for (const line of i === run.log.length - 1 ? lines.slice(0, run.shown) : lines) rows.push(row(line.mark, line.text, line.kind, line.value));
			return;
		}
		if (entry.endsWith('^C')) return rows.push(...wrapped('$', entry, 'cmd'));
		rows.push(...wrapped('$', entry, 'cmd').map((r) => ({ ...r, invalid: 'yes' })));
		const next = nextOf({ ...run, log: run.log.slice(0, i) });
		rows.push(...wrapped('', next ? `Try ${next.commands(run.agent)[0]}` : 'Done. Press Escape to start over.', 'try'));
	});
	if (printing(run)) return rows;
	rows.push(...inputRows(typed, at, at === typed.length ? ghostFor(run, typed) : '', invalidAt(run, typed)));
	if (run.log.length === 0) rows.push(row('', '↵ Press Enter to run it', 'start'));
	if (!nextOf(run) && lastStep(run) === STEPS.length - 1) rows.push(row('', 'Esc starts over', 'start'));
	return rows;
}

/** What the terminal shows: the last rows, like a terminal that scrolls, and the footer on the bottom row while the run prompt is empty. */
export function screen(run: Run, typed = '', at = typed.length): Row[] {
	const foot = showsFooter(run, typed) ? [FOOTER] : [];
	const all = transcript(run, typed, at).slice(-(ROWS - foot.length));
	return [...all, ...Array.from({ length: ROWS - foot.length - all.length }, () => BLANK), ...foot];
}
export const focusRow = (rows: readonly Row[]) => rows.findIndex((r) => r.kind === 'input');

/** What the report below the terminal shows, from what has printed so far: the routes once planned, the old and new screenshots once checked, red or green, and which app serves the page. */
export function reportOf(run: Run) {
	const marks = run.log.flatMap((entry, i) => (typeof entry === 'number' ? (i === run.log.length - 1 ? outOf(run, entry).slice(0, run.shown) : outOf(run, entry)) : [])).map((l) => l.report);
	const check = marks.findLast((m) => m === 'red' || m === 'green');
	return { listed: marks.includes('listed') ? 'yes' : 'no', check: check ?? 'none', live: marks.includes('live') ? 'yes' : 'no' };
}
export const servedBy = (route: string, run: Run) => (route === PAGE && reportOf(run).live === 'yes' ? 'Markless' : 'old app');

export function labelOf(run: Run): string {
	if (printing(run)) return 'Terminal. The command is running.';
	const next = nextOf(run);
	if (!next) return 'Terminal. The run is done; press Escape to start over.';
	const agents = next.key === 'run' ? ` Name any agent after --agent: ${AGENTS.map((a) => a.id).join(', ')}.` : '';
	return `Terminal. Press Enter to run the next command: ${commandOf({ ...run, log: [...run.log, doneOf(run)] }, doneOf(run))}.${agents} Arrow Up recalls earlier commands, Escape starts over.`;
}

/** The sentence the live region speaks: what the command did, once it has printed it. */
export function describe(run: Run): string {
	const last = run.log.at(-1);
	if (last === undefined) return '';
	if (typeof last === 'string') {
		if (last.endsWith('^C')) return 'Line abandoned.';
		const next = nextOf(run);
		return next ? `Try ${next.commands(run.agent)[0]}` : 'Done. Press Escape to start over.';
	}
	if (printing(run)) return run.shown === 0 ? `Running ${commandOf(run, last)}` : '';
	const agent = agentOf(run.agent).label;
	return [
		'plan found 4 pages, /, /pricing, /account and /blog, and read the links, forms and scripts on each and 2 libraries.',
		`run had ${agent} convert ${PAGE}, then checked it: every button works failed, because the new Settings button opened nothing. ${agent} fixed it on the second attempt and all 7 checks passed. JavaScript run at load goes from ${JS.old} to ${JS.new}.`,
		`${PAGE} is live, served by Markless. /, /pricing and /blog are still served by the old app.`,
	][last]!;
}

/** The idle tour, one tick at a time: wait, type the next command two characters a tick, press Enter, let it print, hold while the reader looks; after the last step it starts over. */
export interface Tour {
	readonly run: Run;
	readonly typed: string;
	readonly wait: number;
	readonly entered: boolean;
	/** Which pass of the tour this is: each pass runs a different agent, starting with Codex. */
	readonly loop: number;
}
export const TOUR_START: Tour = { run: START, typed: '', wait: ticksFor(1400), entered: false, loop: 0 };
export const tourAgent = (loop: number) => AGENTS[(loop + 1) % AGENTS.length]!.id;
export function tour(t: Tour): Tour {
	if (printing(t.run)) {
		const run = print(t.run);
		return { ...t, run, entered: false, wait: printing(run) ? 0 : ticksFor(STEPS[lastStep(run)]!.hold) };
	}
	if (t.wait > 0) return { ...t, wait: t.wait - 1, entered: false };
	const next = nextOf(t.run);
	if (!next) return { ...TOUR_START, loop: t.loop + 1 };
	const command = next.key === 'run' ? runCommand(tourAgent(t.loop)) : next.commands(t.run.agent)[0]!;
	if (t.typed.length < command.length) return { ...t, typed: command.slice(0, t.typed.length + 2), entered: false };
	return { ...t, run: submit(t.run, t.typed), typed: '', wait: 0, entered: true };
}
