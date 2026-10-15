import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMAND, describe as say, DONE, enter, ghostFor, HEADING, LABEL, OUTPUT, PAGE_FILE, press, print, screen, SLOTS, START, TARGET, URL_LINE, washFor } from './model.ts';
import { drawing } from './dev-server.ts';

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
		const blank = { mark: '', text: '', kind: 'blank', caret: '', after: '', ghost: '' };
		expect(screen(START)).toEqual([DONE, { mark: '$', text: '', kind: 'prompt', caret: '|', after: '', ghost: COMMAND }, ...Array(SLOTS - 2).fill(blank)]);
		expect(screen(START, 'npm r')[1]).toMatchObject({ text: 'npm r', caret: '|', after: '', ghost: 'un dev' });
		expect(screen(START, 'npm r', 2)[1]).toMatchObject({ text: 'np', after: 'm r', ghost: '' });
		expect(screen(START, 'ls')[1]!.ghost).toBe('');
		expect([ghostFor(''), ghostFor('npm '), ghostFor('yarn')]).toEqual([COMMAND, 'run dev', '']);
	});

	it('runs only on Enter with npm run dev, typed or taken from the ghost', () => {
		expect(enter(START, '')).toEqual({ ...START, phase: 'starting', shown: 0 });
		expect(enter(START, '  npm   run dev ')).toEqual(enter(START, ''));
		const miss = enter(START, 'npm start');
		expect(miss.phase).toBe('off');
		expect(miss.history.slice(1).map((r) => r.text)).toEqual(['npm start', 'Try npm run dev']);
		expect(screen(miss)[3]!.kind).toBe('prompt');
		expect(enter(enter(START, ''), 'ls')).toEqual(enter(START, ''));
	});

	it('prints one line per tick, scrolls the sheet, and serves the page after the last', () => {
		let desk = enter(START, '');
		const seen: string[] = [];
		while (desk.phase === 'starting') {
			desk = print(desk);
			seen.push(say(desk));
		}
		expect(desk).toEqual({ ...START, phase: 'on', shown: OUTPUT.length });
		expect(seen.slice(0, -1)).toEqual([COMMAND, 'VITE+ v0.3.1', 'VITE+ v0.3.1', `Local:   ${URL_LINE}`]);
		expect(screen(desk).map((r) => r.text)).toEqual(['cd my-markless-app', COMMAND, ...OUTPUT.map((r) => r.text)]);
		let late = enter(enter(START, 'x'), '');
		while (late.phase === 'starting') late = print(late);
		const scrolled = screen(late);
		expect(scrolled).toHaveLength(SLOTS);
		expect(scrolled.map((r) => r.text).slice(0, 2)).toEqual(['Try npm run dev', COMMAND]);
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
		expect(piece).toMatch(/aria-label=\{'Terminal in '/);
		expect(piece).toContain('<tspan class="ghost">');
		expect(piece.match(/aria-live="polite"/g)).toHaveLength(1);
		expect(piece.match(/class="hand"/g)).toHaveLength(1);
		expect(piece).toContain("event.key !== 'Enter'");
		expect(piece).toContain("event.key !== 'Escape'");
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
});
