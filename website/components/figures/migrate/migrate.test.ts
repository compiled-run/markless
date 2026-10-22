import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENTS, ASK, breaks, CHECK, CHECKS, COLS, completesAt, describe as say, FOOTERS, ghostFor, inputRows, interrupt, invalidAt, labelOf, pickAgent, PLAN, print, printAll, printing, reportOf, ROUTES, ROWS, screen, sent, servedBy, session, showsFooter, START, submit, SWITCH, tour, tourAgent, TOUR_START, type Run, transcript } from './model.ts';
import { drawing } from './migrate.ts';

const scene = drawing();
const piece = readFileSync(new URL('./migrate-anatomy.tsrx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/start/migrate.mdx', import.meta.url), 'utf8');

const finish = (run: Run) => {
	let r = run;
	while (printing(r)) r = print(r);
	return r;
};
const asked = (agent = 'claude', ask = ''): Run => finish(submit(pickAgent(START, agent), ask));
const text = (run: Run) => transcript(run).map((r) => r.mark + ' ' + r.text + r.after + r.ghost + r.value).join('\n');
const lines = (agent = 'claude') => session(agent as Run['agent']);

describe('the migrate session', () => {
	it('takes the request in plain words, and the agent runs the CLI’s own commands: plan, check, check again, switch', () => {
		expect(ASK).toBe('Use Markless Migrate on my coffee shop site');
		expect([PLAN, CHECK, SWITCH]).toEqual(['markless-migrate plan --old $OLD --source ../beanshop', 'markless-migrate check --old $OLD --new $NEW --route /account', 'markless-migrate switch /account']);
		expect(lines().filter((l) => l.kind === 'cmd').map((l) => l.text)).toEqual([PLAN, CHECK, CHECK, SWITCH]);
		expect(ROUTES).toEqual(['/', '/menu', '/account', '/blog']);
		expect(text(asked())).toContain('> Use Markless Migrate on my coffee shop site');
		const done = lines().map((l) => l.text).join('\n');
		for (const line of ['4 routes on the old site to port, from crawl 4, source 4', 'Wrote .migrate/inventory.json', 'FAIL  /account  [behaviour]', '0 of 1 routes green, 1 red.', 'pass  /account', 'run at load 84.0 kB -> 1.1 kB', '1 of 1 routes green.', 'Partial run: 1 of 4 routes checked.', 'Switched /account to the new app.']) expect(done).toContain(line);
	});

	it('switches only after the second check passes, and says the old app keeps the rest', () => {
		const all = lines();
		const kinds = all.map((l) => l.text);
		expect(kinds.indexOf(SWITCH)).toBeGreaterThan(kinds.lastIndexOf('1 of 1 routes green.'));
		expect(kinds.indexOf('0 of 1 routes green, 1 red.')).toBeLessThan(kinds.lastIndexOf(CHECK));
		expect(all.at(-1)!.text).toContain('The old app still serves /, /menu and /blog');
	});

	it('takes the reader’s own sentence as the request too', () => {
		const own = asked('claude', '  port   my shop please ');
		expect(sent(own)).toBe(true);
		expect(text(own)).toContain('> port my shop please');
		expect(text(own)).toContain('Switched /account to the new app.');
	});

	it('opens any of the six agents setup installs the skill for, by name or from the footer, before anything is sent', () => {
		expect(AGENTS.map((a) => a.id)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode']);
		expect(submit(START, 'codex').agent).toBe('codex');
		expect(submit(START, 'Gemini CLI').agent).toBe('gemini');
		expect(sent(submit(START, 'codex'))).toBe(false);
		expect(transcript(pickAgent(START, 'cursor'))[0]!.text).toBe('Cursor');
		expect(pickAgent(asked(), 'codex').agent).toBe('claude');
		expect(say(asked('gemini'))).toContain('/account is live');
		expect(text(asked('codex'))).not.toContain('Claude');
		expect(labelOf(START)).toContain('Use Markless Migrate on my coffee shop site');
	});

	it('names the other agents in a footer on the empty prompt, and nowhere else', () => {
		expect(FOOTERS.find((f) => f.agent === 'claude')!.others.map((o) => o.gap + o.id).join('')).toBe('codex · cursor · gemini · copilot · opencode');
		expect(screen(START).at(-1)!.kind).toBe('footer');
		expect(showsFooter(START, 'U')).toBe(false);
		expect(showsFooter(asked(), '')).toBe(false);
	});

	it('runs the checks in plain words, each with its report dimension, and fails only every button works the first time', () => {
		expect(CHECKS.map((c) => c.plain)).toEqual(['what people see', 'every button works', 'same requests', 'what search engines get', 'what screen readers get', 'how fast it loads']);
		expect(CHECKS.map((c) => c.dimension)).toEqual(['visual', 'behaviour', 'network', 'seo', 'a11y', 'load']);
		expect(lines().filter((l) => l.mark === '✗').map((l) => l.value)).toEqual(['behaviour']);
		expect(lines().filter((l) => l.mark === '✓')).toHaveLength(CHECKS.length * 2 - 1);
	});

	it('prints a line at a time, with no prompt until the agent is done, and the report follows what has printed', () => {
		let run = submit(START);
		expect(printing(run)).toBe(true);
		expect(transcript(run).some((r) => r.kind === 'input')).toBe(false);
		const seen: string[] = [];
		while (printing(run)) {
			run = print(run);
			seen.push(reportOf(run).check);
		}
		expect([...new Set(seen)]).toEqual(['none', 'red', 'green']);
		expect(transcript(run).some((r) => r.kind === 'input')).toBe(true);
		expect(printAll(submit(START)).shown).toBe(lines().length);
		expect(submit(submit(START))).toEqual(submit(START));
	});

	it('prints only lines that fit the terminal, for every agent', () => {
		for (const agent of AGENTS) for (const l of lines(agent.id)) expect(l.value ? l.text.length <= 24 && l.value.length <= 10 : l.text.length <= COLS * 3).toBe(true);
		expect(breaks(CHECK).length).toBe(2);
		for (const run of [START, submit(START), asked()]) expect(screen(run)).toHaveLength(ROWS);
	});

	it('suggests the request as faint text, echoes later lines as done, and abandons a line on Ctrl+C', () => {
		expect(ghostFor(START, '')).toBe(ASK);
		expect(ghostFor(START, 'Use Mark')).toBe('less Migrate on my coffee shop site');
		expect(ghostFor(START, 'port')).toBe('');
		expect(completesAt(START, 'Use', 3)).toBe(true);
		expect(completesAt(START, 'Use', 1)).toBe(false);
		expect(invalidAt(asked(), 'again')).toBe(true);
		const later = submit(asked(), 'again');
		expect(transcript(later).filter((r) => r.kind === 'try').map((r) => r.text)).toEqual(['Done. Press Escape to start over.']);
		expect(submit(asked(), '')).toEqual(asked());
		expect(text(interrupt(START, 'Use'))).toContain('Use^C');
	});

	it('splits the typed line across its wrapped rows with the caret in the right piece', () => {
		const long = 'Use Markless Migrate on my coffee shop site and keep the old one up';
		const rows = inputRows(long.slice(0, 50), 50, long.slice(50), false);
		expect(rows).toHaveLength(2);
		expect(rows[0]!.text + rows[1]!.text + rows[1]!.caret + rows[1]!.ghost).toBe(long.slice(0, 50).replace(/ $/, '') + '|' + long.slice(50));
		const mid = inputRows('abc def', 2, '', false);
		expect([mid[0]!.text, mid[0]!.caret, mid[0]!.after]).toEqual(['ab', '|', 'c def']);
	});

	it('fills the report as the agent works, and Markless serves the page only once switched', () => {
		expect(reportOf(START)).toEqual({ listed: 'no', check: 'none', live: 'no' });
		expect(reportOf(asked())).toEqual({ listed: 'yes', check: 'green', live: 'yes' });
		let run = submit(START);
		while (printing(run) && reportOf(run).check !== 'green') run = print(run);
		expect(ROUTES.map((r) => servedBy(r, run))).toEqual(['old app', 'old app', 'old app', 'old app']);
		expect(ROUTES.map((r) => servedBy(r, asked()))).toEqual(['old app', 'old app', 'Markless', 'old app']);
	});

	it('speaks one plain sentence per step, naming the agent', () => {
		expect(say(START)).toBe('');
		expect(say(submit(START))).toBe('Sent to Claude Code: Use Markless Migrate on my coffee shop site');
		let run = submit(pickAgent(START, 'gemini'));
		const said = new Set<string>();
		while (printing(run)) said.add(say((run = print(run))));
		expect([...said].some((s) => s.startsWith('Gemini CLI fixed it and every check passed.') && s.includes('84.0 kB to 1.1 kB'))).toBe(true);
		expect(say(asked())).toBe('/account is live, served by Markless. /, /menu and /blog are still served by the old app.');
	});

	it('tours by typing the request, letting the agent work, holding, then starting over in the next agent', () => {
		let t = TOUR_START;
		const seen: string[] = [];
		for (let i = 0; i < 20000 && seen.length < 2; i++) {
			const before = t.run.agent;
			t = tour(t);
			if (t.entered) seen.push(t.run.agent);
			if (t.run.agent !== before) seen.push('next ' + t.run.agent);
		}
		expect(seen).toEqual(['claude', 'next codex']);
		expect([0, 1].map(tourAgent)).toEqual(['claude', 'codex']);
	});
});

describe('the migrate figure', () => {
	it('draws a row slot per terminal row, both screenshots, a wash per route, and the tick and cross', () => {
		expect(scene.rows).toHaveLength(ROWS);
		expect(scene.report.routes).toHaveLength(ROUTES.length);
		for (const thumb of [scene.report.old, scene.report.fresh]) {
			expect(thumb.ink.length).toBeGreaterThan(300);
			expect(thumb.panel.ink.length).toBeGreaterThan(300);
		}
		expect(scene.report.tick.length).toBeGreaterThan(50);
		expect(scene.report.cross.length).toBeGreaterThan(50);
	});

	it('has one live region, keyboard history and restart, reduced motion and an offscreen-paused tour that stops on first touch', () => {
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('recall(ran, back, ');
		expect(piece).toContain('remember(ran, ');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('IntersectionObserver');
		expect(piece).toContain('touched = true');
		expect(piece).toContain('data-pick={other.id}');
		expect(piece).toContain('@media (prefers-reduced-motion: reduce)');
		expect(piece).toContain("import { art } from './migrate.art.ts';");
	});

	it('is placed on the migrate page', () => {
		expect(page).toContain("import MigrateAnatomy from '../../components/figures/migrate/migrate-anatomy.tsrx';");
		expect(page).toContain('<MigrateAnatomy />');
	});

	it('inks the same way every time', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(scene));
		expect(scene.sheet.ink.length).toBeGreaterThan(500);
		expect(scene.report.ink.length).toBeGreaterThan(300);
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by migrate.test.ts from migrate.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './migrate.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(scene, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./migrate.art.ts');
	});
});
