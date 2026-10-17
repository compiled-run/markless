import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENTS, breaks, CHECKS, COLS, completesAt, describe as say, doneOf, FOOTERS, ghostFor, inputRows, interrupt, invalidAt, print, printAll, printing, reportOf, ROUTES, ROWS, runCommand, screen, servedBy, showsFooter, START, STEPS, submit, tour, tourAgent, TOUR_START, type Run, transcript } from './model.ts';
import { drawing } from './migrate.ts';

const scene = drawing();
const piece = readFileSync(new URL('./migrate-anatomy.tsrx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../pages/start/migrate.mdx', import.meta.url), 'utf8');

const finish = (run: Run) => {
	let r = run;
	while (printing(r)) r = print(r);
	return r;
};
const runTo = (n: number, agent = ''): Run => Array.from({ length: n }).reduce<Run>((run, _, i) => finish(submit(run, i === 1 && agent ? runCommand(agent) : '')), START);
const text = (run: Run) => transcript(run).map((r) => r.mark + ' ' + r.text + r.after + r.ghost + r.value).join('\n');

describe('the migrate run', () => {
	it('plans, runs the agent until the page is green, and switches, with the CLI’s own commands', () => {
		expect(STEPS.map((s) => s.commands('claude')[0])).toEqual([
			'markless-migrate plan --old $OLD --source ../shop',
			'markless-migrate run --agent claude --old $OLD --new $NEW --route /account',
			'markless-migrate switch /account',
		]);
		expect(ROUTES).toEqual(['/', '/pricing', '/account', '/blog']);
		expect(text(runTo(1))).toContain('4 routes on http://localhost:3000');
		const ran = text(runTo(2));
		for (const line of ['attempt 1/3  /account: running claude', 'Claude Code converted /account', 'every button works', 'attempt 2/3  /account: running claude', 'Claude Code fixed what check found', 'green          /account after 2 attempt(s)', '1 of 1 routes green.']) expect(ran).toContain(line);
		expect(text(runTo(3))).toContain('Switched /account to the new app.');
	});

	it('drives any of the six agents run knows, by the id the reader types, and names that agent in the output', () => {
		expect(AGENTS.map((a) => a.id)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode']);
		const codex = runTo(2, 'codex');
		expect(codex.agent).toBe('codex');
		expect(text(codex)).toContain('$ markless-migrate run --agent codex --old\n $OLD --new $NEW --route /account');
		expect(text(codex)).toContain('Codex converted /account');
		expect(text(codex)).toContain('Codex fixed what check found');
		expect(text(codex)).not.toContain('Claude');
		expect(text(runTo(2, 'cursor'))).toContain('running cursor-agent');
		const prefix = 'markless-migrate run --agent co';
		expect(ghostFor(runTo(1), prefix)).toBe('dex --old $OLD --new $NEW --route /account');
		expect(ghostFor(runTo(1), prefix + 'p')).toBe('ilot --old $OLD --new $NEW --route /account');
		expect(ghostFor(runTo(1), '')).toBe(runCommand('claude'));
		expect(invalidAt(runTo(1), 'markless-migrate run --agent devin')).toBe(true);
		expect(doneOf(submit(runTo(1), 'markless-migrate run --agent devin --old $OLD --new $NEW --route /account'))).toBe(1);
	});

	it('names the other agents in a footer on the empty run prompt, and nowhere else', () => {
		expect(FOOTERS.find((f) => f.agent === 'claude')!.others.map((o) => o.gap + o.id).join('')).toBe('codex · cursor · gemini · copilot · opencode');
		expect(screen(runTo(1)).at(-1)!.kind).toBe('footer');
		expect(showsFooter(runTo(1), 'm')).toBe(false);
		expect(showsFooter(START, '')).toBe(false);
		expect(showsFooter(runTo(2), '')).toBe(false);
	});

	it('ticks the checks in plain words, each with its report dimension, and fails only every button works the first time', () => {
		expect(CHECKS.map((c) => c.plain)).toEqual(['looks the same', 'every button works', 'same requests', 'same SEO', 'screen reader the same', 'every language', 'signed in and out']);
		const lines = STEPS[1]!.out('claude');
		expect(lines.filter((l) => l.mark === '✗').map((l) => l.value)).toEqual(['behaviour']);
		expect(lines.filter((l) => l.mark === '✓')).toHaveLength(CHECKS.length * 2 - 1);
	});

	it('prints a line at a time, with no prompt until the command is done, and the report follows what has printed', () => {
		let run = submit(runTo(1));
		expect(printing(run)).toBe(true);
		expect(transcript(run).some((r) => r.kind === 'input')).toBe(false);
		const seen: string[] = [];
		while (printing(run)) {
			run = print(run);
			seen.push(reportOf(run).check);
		}
		expect([...new Set(seen)]).toEqual(['none', 'red', 'green']);
		expect(transcript(run).some((r) => r.kind === 'input')).toBe(true);
		expect(printAll(submit(runTo(1))).shown).toBe(STEPS[1]!.out('claude').length);
		expect(submit(submit(runTo(1)))).toEqual(submit(runTo(1)));
	});

	it('prints only lines that fit the terminal, for every agent, and wraps long commands at a space', () => {
		for (const agent of AGENTS) for (const step of STEPS) for (const l of step.out(agent.id)) expect(l.value ? l.text.length <= 24 && l.value.length <= 10 : l.text.length <= COLS).toBe(true);
		expect(breaks(runCommand('claude')).length).toBe(2);
		for (let n = 0; n <= STEPS.length; n++) expect(screen(runTo(n))).toHaveLength(ROWS);
	});

	it('takes Enter on an empty line or the exact next command, and answers anything else with the command to try', () => {
		expect(doneOf(submit(START, '  markless-migrate   plan --old $OLD --source ../shop '))).toBe(1);
		const wrong = submit(START, 'markless-migrate switch /account');
		expect(doneOf(wrong)).toBe(0);
		expect(transcript(wrong).filter((r) => r.kind === 'try').map((r) => r.text).join(' ')).toBe('Try markless-migrate plan --old $OLD --source ../shop');
		expect(transcript(wrong).find((r) => r.kind === 'cmd')!.invalid).toBe('yes');
		expect(submit(runTo(STEPS.length))).toEqual(runTo(STEPS.length));
		expect(text(interrupt(START, 'markl'))).toContain('markl^C');
		expect(completesAt(START, 'mark', 4)).toBe(true);
		expect(completesAt(START, 'mark', 2)).toBe(false);
	});

	it('splits the typed line across its wrapped rows with the caret in the right piece', () => {
		const cmd = runCommand('codex');
		const rows = inputRows(cmd.slice(0, 50), 50, cmd.slice(50), false);
		expect(rows).toHaveLength(2);
		expect(rows[0]!.text + rows[1]!.text + rows[1]!.caret + rows[1]!.ghost).toBe(cmd.slice(0, 50) + '|' + cmd.slice(50));
		const mid = inputRows('abc def', 2, '', false);
		expect([mid[0]!.text, mid[0]!.caret, mid[0]!.after]).toEqual(['ab', '|', 'c def']);
	});

	it('fills the report as the run goes, and Markless serves the page only once switched', () => {
		expect([0, 1, 2, 3].map((n) => reportOf(runTo(n)).check)).toEqual(['none', 'none', 'green', 'green']);
		expect([0, 1].map((n) => reportOf(runTo(n)).listed)).toEqual(['no', 'yes']);
		expect(ROUTES.map((r) => servedBy(r, runTo(2)))).toEqual(['old app', 'old app', 'old app', 'old app']);
		expect(ROUTES.map((r) => servedBy(r, runTo(3)))).toEqual(['old app', 'old app', 'Markless', 'old app']);
	});

	it('speaks one plain sentence per command, naming the agent that ran', () => {
		expect(say(START)).toBe('');
		expect(say(runTo(2, 'gemini'))).toContain('Gemini CLI fixed it on the second attempt');
		expect(say(runTo(2))).toContain('84.0 kB to 1.1 kB');
		expect(say(runTo(3))).toBe('/account is live, served by Markless. /, /pricing and /blog are still served by the old app.');
	});

	it('tours by typing each command, letting it print, holding, then starting over with another agent', () => {
		let t = TOUR_START;
		const seen: string[] = [];
		for (let i = 0; i < 20000 && seen.length < 4; i++) {
			const before = doneOf(t.run);
			t = tour(t);
			if (t.entered) seen.push(String(doneOf(t.run)));
			if (before === STEPS.length && doneOf(t.run) === 0) seen.push('0');
		}
		expect(seen).toEqual(['1', '2', '3', '0']);
		expect([0, 1].map(tourAgent)).toEqual(['codex', 'cursor']);
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
