// A workshop pegboard: pnpm install hangs each repo script on its outlined hook, and the hooks folder is a bell on the door that rings as a commit goes out.
import { ellipse } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, wash } from '../ink/ink.ts';
import { desk, type P } from '../ink/sheets.ts';

/** Root package.json scripts, in the order the page's table lists them. */
export const SCRIPTS = ['typecheck', 'ci:local', 'test', 'lint', 'build', 'rules', 'docs:dev'];

const MONO = 0.3;

export function drawing() {
	const k = desk(680, [
		{ key: 'slip', x: 0.4, y: 0, w: 8.4, h: 3.4, bar: 'terminal', curl: false },
		{ key: 'board', x: 0, y: 4.4, w: 14.6, h: 8.6, kraft: true, curl: false },
		{ key: 'door', x: 15.6, y: 2.6, w: 5.6, h: 10.8, curl: false },
	]);
	k.lay();
	for (let u = 0.8; u < 14.2; u += 0.9) for (let v = 0.8; v < 8.2; v += 0.9) k.raw.path(pathOf(k.raw.on('board', ellipse(u, v, 0.07, 0.07, 8)), true), 'sheet-ink faint');
	const row = (i: number) => (i < 4 ? 0 : 1);
	const spot = (i: number): P => {
		const before = SCRIPTS.slice(row(i) ? 4 : 0, i).reduce((sum, name) => sum + name.length * MONO + 1.8, 0);
		return [1.2 + before, 1.6 + row(i) * 3.6];
	};
	const tagOf = (u: number, v: number, name: string): P[] => {
		const w = name.length * MONO + 1.1;
		return [[u - 0.3, v + 0.5], [u - 0.3 + w, v + 0.5], [u - 0.3 + w, v + 1.9], [u - 0.3, v + 1.9]];
	};
	SCRIPTS.forEach((name, i) => {
		const [u, v] = spot(i);
		k.raw.path(line(k.raw.on('board', [[u - 0.15, v + 0.05], [u, v - 0.15], [u + 0.15, v + 0.05], [u + 0.15, v + 0.4]]), { w: 1.3, seed: 2400 + i }), 'sheet-ink');
		const [a, , c] = tagOf(u, v, name);
		k.box('board', a![0], a![1], c![0], c![1], '', undefined, 'pen faint');
	});
	const doorOutline = k.raw.on('door', [[0.5, 0.5], [5.1, 0.5], [5.1, 10.3], [0.5, 10.3]]);
	k.raw.path(outline(doorOutline, { w: 1, seed: 2420 }), 'sheet-ink');
	k.raw.path(hatch(k.raw.on('door', [[0.5, 0.5], [5.1, 0.5], [5.1, 1.4], [0.5, 1.4]]), 0.2, 2, 2421, { cluster: 4, skip: 0.3 }), 'sheet-hatch light');
	k.raw.path(outline(k.raw.on('door', ellipse(4.3, 6, 0.3, 0.3, 16)), { w: 1.2, seed: 2422 }), 'sheet-ink');
	k.row('slip', 0.9, 2.6, '$', 'dim');
	k.row('slip', 1.6, 2.6, 'pnpm install', 'bold');
	k.next();
	SCRIPTS.forEach((name, i) => {
		const [u, v] = spot(i);
		const tag = k.raw.on('board', tagOf(u, v, name), 0.08);
		const at = 500 + i * 260;
		const st = k.raw.motion('show', at);
		k.raw.path(line(k.raw.on('board', [[u, v + 0.05], [u + 0.25, v + 0.5]], 0.1), { w: 0.7, seed: 2440 + i }), 'sheet-ink show', st);
		k.raw.path(pathOf(tag, true), 'sheet-paper show', st);
		k.raw.path(outline(tag, { w: 1.1, heavy: 0.9, seed: 2450 + i }), 'sheet-ink show', st);
		k.row('board', u + 0.25, v + 1.5, name, 'mono', 'show', at);
	});
	const bell: P[] = [[2.1, 3.6], [2.4, 2.7], [2.8, 2.45], [3.2, 2.7], [3.5, 3.6], [3.7, 3.85], [1.9, 3.85]];
	k.raw.path(line(k.raw.on('door', [[2.8, 0.5], [2.8, 2.45]]), { w: 0.8, seed: 2460 }), 'sheet-ink');
	const bellPts = k.raw.on('door', bell, 0.1);
	k.raw.path(pathOf(bellPts, true), 'sheet-paper');
	k.raw.path(wash(bellPts, 2461, 0.3, 1), 'kraft-wash');
	k.raw.path(outline(bellPts, { w: 1.4, heavy: 1.2, seed: 2462 }), 'sheet-ink');
	k.raw.path(outline(k.raw.on('door', ellipse(2.8, 4.05, 0.16, 0.16, 12), 0.1), { w: 1, seed: 2463 }), 'sheet-ink');
	k.arrow(['slip', 8.6, 2.4], ['board', 10.6, -0.2], 'draw', 150, -0.5);
	const ring = 3000;
	for (const [i, s] of [-1, 1].entries()) {
		k.raw.path(line(k.raw.on('door', [[2.8 + s * 1.2, 2.7], [2.8 + s * 1.6, 2.4]]), { w: 0.9, seed: 2470 + i }) + line(k.raw.on('door', [[2.8 + s * 1.3, 3.3], [2.8 + s * 1.8, 3.2]]), { w: 0.9, seed: 2472 + i }), 'sheet-ink flash', k.raw.motion('flash', ring, '', ring + 1600));
	}
	k.hand('door', 1.2, 5.3, '.githooks', 'show', 2600, 'mono');
	k.hand('door', 0.9, 8.2, 'git commit', 'show', 2800, 'bold');
	k.hand('door', 0.9, 9.2, 'LINT, FAST JOBS', 'show', ring + 200);
	return k.build();
}
