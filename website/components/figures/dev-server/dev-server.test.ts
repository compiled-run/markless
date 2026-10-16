import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANAGERS, scriptCommand } from '../../docs/walkthrough/facts.ts';
import { completesAt, describe as say, DONE, enter, FOOTER, ghostFor, HEADING, interrupt, LABEL, OUTPUT, PAGE_FILE, press, print, screen, showsFooter, SLOTS, START, TARGET, URL_LINE, washFor } from './model.ts';
import { drawing } from './dev-server.ts';

const COMMAND = scriptCommand('npm', 'dev');
const ids = MANAGERS.map((m) => m.id);

const scene = drawing();
const starter = readFileSync(new URL('../../../../packages/cli/templates/starters/minimal/pages/index.tsrx', import.meta.url), 'utf8');
const cli = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./dev-server-anatomy.tsrx', import.meta.url), 'utf8');

describe('the dev server figure shows the real starter', () => {
	it('draws the starter page the CLI writes, and names its file', () => {
		expect(starter).toContain(`<h1>${HEADING}</h1>`);
		expect(starter).toContain(`<button onClick={() => count++}>${LABEL} {count}</button>`);
		expect(starter).toContain('let count = state(0);');
		expect(PAGE_FILE).toBe('pages/index.tsrx');
		expect(cli).toContain(`const DEFAULT_TARGET = '${TARGET}';`);
	});

	it('waits at a prompt for the command the CLI prints, then prints the lines the dev server prints', () => {
		expect(cli).toContain("`${options.packageManager} run dev`");
		expect(COMMAND).toBe('npm run dev');
		expect(DONE.text).toBe('cd my-markless-app');
		expect(OUTPUT.map((r) => r.text)).toEqual(['', 'VITE+ v0.3.1', '', `Local:   ${URL_LINE}`, 'Network: use --host to expose']);
		const blank = { mark: '', text: '', kind: 'blank', caret: '', after: '', ghost: '', invalid: 'no', wait0: '', wait1: '', wait2: '', wait3: '', wait4: '' };
		const waits = Object.fromEntries(ids.map((id, k) => [`wait${k}`, scriptCommand(id, 'dev')]));
		expect(screen(START)).toEqual([DONE, { ...blank, mark: '$', kind: 'prompt', caret: '|', ...waits }, { ...blank, text: '↵ Press Enter to run it', kind: 'start' }, ...Array(SLOTS - 4).fill(blank), FOOTER]);
		expect(screen(START, 'npm r')[1]).toMatchObject({ text: 'npm r', caret: '|', after: '', ghost: 'un dev' });
		expect(screen(START, 'npm r', 2)[1]).toMatchObject({ text: 'np', after: 'm r', ghost: '' });
		expect(screen(START, 'ls')[1]!.ghost).toBe('');
		expect([ghostFor(''), ghostFor('npm '), ghostFor('yarn')]).toEqual([COMMAND, 'run dev', ' run dev']);
	});

	it("runs on Enter with any package manager's dev command, typed or taken from the ghost", () => {
		expect(enter(START, '')).toEqual({ ...START, phase: 'starting', shown: 0, command: COMMAND, manager: 'npm' });
		expect(enter(START, '  npm   run dev ')).toEqual(enter(START, ''));
		for (const id of ids) {
			expect(enter(START, scriptCommand(id, 'dev'))).toMatchObject({ phase: 'starting', manager: id, command: scriptCommand(id, 'dev') });
			expect(enter(START, '', id)).toMatchObject({ phase: 'starting', manager: id, command: scriptCommand(id, 'dev') });
		}
		expect(scriptCommand('deno', 'dev')).toBe('deno task dev');
		expect(enter(START, 'deno run dev')).toMatchObject({ phase: 'starting', manager: 'deno' });
		const miss = enter(START, 'npm start');
		expect(miss.phase).toBe('off');
		expect(miss.history.slice(1).map((r) => r.text)).toEqual(['npm start', 'Try npm run dev']);
		expect(enter(START, 'bun dev', 'bun').history.slice(1).map((r) => r.text)).toEqual(['bun dev', 'Try bun run dev']);
		expect(screen(miss)[3]!.kind).toBe('prompt');
		expect(enter(enter(START, ''), 'ls')).toEqual(enter(START, ''));
		let stopped = enter(START, 'pnpm run dev');
		while (stopped.phase === 'starting') stopped = print(stopped);
		expect(interrupt(stopped, '').history.map((r) => r.text)).toContain('pnpm run dev');
		expect(screen(enter(START, 'yarn run dev'))[1]).toMatchObject({ kind: 'cmd', text: 'yarn run dev' });
	});

	it("completes whichever manager's dev command the text starts, the saved one first", () => {
		expect(ghostFor('', 'bun')).toBe('bun run dev');
		expect(ghostFor('', 'deno')).toBe('deno task dev');
		expect(ghostFor('p')).toBe('npm run dev');
		expect(ghostFor('b')).toBe('un run dev');
		expect(ghostFor('d')).toBe('eno task dev');
		expect(ghostFor('y', 'pnpm')).toBe('arn run dev');
		expect(ghostFor('n', 'bun')).toBe('pm run dev');
		expect(screen(START, 'pn', 2)[1]!.ghost).toBe('pm run dev');
	});

	it('keeps the bottom row for the footer while the prompt is empty, and leaves its names and the empty-line ghost to the saved manager on the page', () => {
		const rows = screen(START, '', 0);
		expect(rows.slice(0, 3).map((r) => r.kind)).toEqual(['cmd', 'prompt', 'start']);
		expect(rows).toHaveLength(SLOTS);
		expect(rows.at(-1)).toEqual(FOOTER);
		expect(rows[1]!.ghost).toBe('');
		expect(screen(START, 'p', 1).some((r) => r.kind === 'footer')).toBe(false);
		expect(showsFooter(enter(START, ''), '')).toBe(false);
		let crowded = START;
		for (const miss of ['a', 'b', 'c', 'd']) crowded = enter(crowded, miss);
		const scrolled = screen(crowded);
		expect(scrolled.at(-2)!.kind).toBe('prompt');
		expect(scrolled.at(-1)!.kind).toBe('footer');
		ids.forEach((id, k) => expect(piece).toContain(`data-pm="${id}">{slot.wait${k}}</tspan>`));
		for (const id of ids) expect(piece).toContain(`html[data-package-manager='${id}'] :is(.wait-ghost, .others)[data-pm='${id}']`);
		expect(piece).toContain("scriptCommand(managerOf(pick), 'dev')");
		expect(piece.match(/^\s+packageManager = /gm)).toHaveLength(1);
		expect(piece).toMatch(/\.desk \{[^}]*user-select: none;/);
	});

	it('lets Tab take the suggestion only while there is one at the caret, so Tab with nothing to complete leaves the terminal', () => {
		expect(completesAt(START, '', 0)).toBe(true);
		expect(completesAt(START, 'pn', 2)).toBe(true);
		expect(completesAt(START, 'pn', 1)).toBe(false);
		expect(completesAt(START, 'ls', 2)).toBe(false);
		expect(completesAt(START, COMMAND, COMMAND.length)).toBe(false);
		expect(completesAt(enter(START, ''), '', 0)).toBe(false);
		expect(piece).toContain("(event.key === 'Tab' && event.shiftKey === false && completes)) event.preventDefault();");
	});

	it('marks a line red once no dev command starts with it, and keeps a wrong command red above its hint', () => {
		expect(screen(START, 'npm r')[1]!.invalid).toBe('no');
		expect(screen(START, 'deno t')[1]!.invalid).toBe('no');
		expect(screen(START, 'npm s')[1]).toMatchObject({ invalid: 'yes', ghost: '' });
		const miss = enter(START, 'npm start');
		expect(miss.history.slice(1).map((r) => r.invalid)).toEqual(['yes', 'no']);
		expect(interrupt(START, 'npm s').history.at(-1)!.invalid).toBe('no');
		expect(piece).toContain('data-invalid={slot.invalid}');
	});

	it('prints one line per tick, scrolls the sheet, and serves the page after the last', () => {
		let desk = enter(START, '');
		const seen: string[] = [];
		while (desk.phase === 'starting') {
			desk = print(desk);
			seen.push(say(desk));
		}
		expect(desk).toEqual({ ...START, phase: 'on', shown: OUTPUT.length, command: COMMAND });
		expect(seen.slice(0, -1)).toEqual([COMMAND, 'VITE+ v0.3.1', 'VITE+ v0.3.1', `Local:   ${URL_LINE}`]);
		expect(screen(desk).map((r) => r.text)).toEqual(['cd my-markless-app', COMMAND, ...OUTPUT.map((r) => r.text)]);
		let late = enter(enter(START, 'x'), '');
		while (late.phase === 'starting') late = print(late);
		const scrolled = screen(late);
		expect(scrolled).toHaveLength(SLOTS);
		expect(scrolled.map((r) => r.text).slice(0, 2)).toEqual(['Try npm run dev', COMMAND]);
		expect(scrolled[1]!.invalid).toBe('no');
		expect(scrolled.at(-1)!.text).toBe('Network: use --host to expose');
	});

	it('counts like the page: nothing until the server runs, then one per press', () => {
		expect(press(START)).toEqual(START);
		let on = enter(START, '');
		while (on.phase === 'starting') on = print(on);
		expect(press(enter(START, ''))).toEqual(enter(START, ''));
		expect(press(press(press(on))).count).toBe(3);
		expect([washFor(0), washFor(9), washFor(10), washFor(999), washFor(12345)]).toEqual([0, 0, 1, 2, 2]);
	});

	it('speaks one plain line per change', () => {
		expect(say(enter(START, 'ls'))).toBe('Try npm run dev');
		let on = enter(START, '');
		while (on.phase === 'starting') on = print(on);
		expect(say(on)).toBe('The dev server is running at http://localhost:3000/. The browser shows pages/index.tsrx: a Markless Router heading and a Count 0 button. Press it to count.');
		expect(say(press(on), true)).toBe('Count 1. The button on the page counted the click.');
	});

	it('pins the markup: a labelled prompt input, one real button, one live region, one margin note, no tour, keyboard and reduced motion', () => {
		expect(piece.match(/<button/g)).toHaveLength(1);
		expect(piece.match(/<input/g)).toHaveLength(1);
		expect(piece).toContain("const label = 'Terminal in ' + TARGET");
		expect(piece).toContain('aria-label={label}');
		expect(piece).toContain('<tspan class="ghost">');
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece).toContain("event.key !== 'Enter'");
		expect(piece).toContain("event.key !== 'Escape'");
		expect(piece).toContain("import { recall, remember } from '../create/history.ts';");
		expect(piece).toContain('recall(ran, back, ');
		expect(piece).toContain('remember(ran, ');
		expect(piece).toContain('onSelectionChange');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).not.toContain('IntersectionObserver');
		expect(piece).not.toContain('setInterval');
		expect(piece).not.toMatch(/sink|fresh/);
		expect(piece).toContain('@media (prefers-reduced-motion: reduce)');
		expect(piece).toContain("import { art } from './dev-server.art.ts';");
		expect(piece).toContain('THIS PAGE IS');
	});

	it('inks every part fully enough not to look thin, and the same way every time', () => {
		expect(scene.terminal.rows).toHaveLength(SLOTS);
		expect(scene.browser.washes).toHaveLength(3);
		for (const part of [scene.terminal, scene.browser]) {
			expect(part.ink.length).toBeGreaterThan(500);
			expect(part.desk.length).toBeGreaterThan(200);
			expect(part.pencil.length).toBeGreaterThan(100);
		}
		expect(scene.browser.button.ink.length).toBeGreaterThan(200);
		expect(scene.note.arrow.length).toBeGreaterThan(200);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(scene));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by dev-server.test.ts from dev-server.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './dev-server.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(scene, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./dev-server.art.ts');
	});

	it('takes Ctrl+C like a terminal: a fresh prompt, and a running server stops', () => {
		expect(screen(interrupt(START, 'npm r')).map((r) => r.text).slice(0, 3)).toEqual([`cd ${TARGET}`, 'npm r^C', '']);
		let desk = enter(START, '');
		while (desk.phase === 'starting') desk = print(desk);
		const stopped = interrupt(press(desk), '');
		expect(stopped).toMatchObject({ phase: 'off', count: 0 });
		expect(stopped.history.map((r) => r.text)).toContain('^C');
	});
});
