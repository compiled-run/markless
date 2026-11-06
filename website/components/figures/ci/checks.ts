// A GitHub pull request's checks box drawn in ink: five real CI checks with their states, the merge-queue button, and the parts that change.
import { centreOf, ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, pathOf, stroke, wash } from '../ink/ink.ts';
import { desk, type DeskArt, type Item, type P, type SheetSpec, type TextItem } from '../ink/sheets.ts';

/** The checks as GitHub lists them for a website pull request on CI: job name, real duration on PR #471, whether branch protection requires it, and what it runs. */
export const CHECKS = [
	{ job: 'agent-files', took: '12s', required: true, fast: true, runs: '`ruler apply`, then fails if the agent files changed' },
	{ job: 'typecheck', took: '39s', required: true, fast: true, runs: '`pnpm typecheck` and `vp check --no-fmt`' },
	{ job: 'website-boxes', took: '6m 47s', required: false, fast: false, runs: "this site's tooling tests and `test:boxes`" },
	{ job: 'perf-guards', took: '6m 59s', required: false, fast: false, runs: '`pnpm perf:guard`: page weight and interaction budgets' },
	{ job: 'test', took: '4s', required: true, fast: false, runs: 'the gate: fails unless every lane passed or hit its cache' },
];

/**
 * What `pnpm ci:local --job <id>` prints for each job, abridged: the step header and command it echoes
 * (scripts/ci/local.mjs, from ci.yml), then how it ends, in its summary line format. The failure lines are
 * real messages: ci.yml's agent-files error, the typecheck error from the dev-setup page, a website tooling
 * test failure, the perf-guard G2 message format (scripts/benchmarks/perf-guards/evaluate.test.ts), and
 * packages/analyzer/test-support/receipt-set.ts. At home `test` runs only its receipt steps: its lane gate
 * reads GitHub's own job results.
 */
export const HOME = [
	{
		steps: ['=== agent-files :: Verify committed agent', '    files match .ruler/ sources', '$ pnpm dlx @intellectronica/ruler@0.3.44 apply'],
		pass: ['  passed  agent-files  0s'],
		fail: ['::error::Committed agent files are out of sync', "with .ruler/. Run 'pnpm rules' and commit the", 'result.', '  failed  agent-files  failed at agent-files …'],
	},
	{
		steps: ['=== typecheck :: Typecheck', '$ pnpm typecheck'],
		pass: ['  passed  typecheck  17s'],
		fail: ["app.tsrx(4,7): error TS2322: Type 'number' is not", "assignable to type 'string'.", '  failed  typecheck  failed at typecheck :: Typecheck'],
	},
	{
		steps: ['=== website-boxes :: Run website tooling tests', '$ pnpm --dir website exec vp test run \\', '    --config vitest.tooling.config.ts'],
		pass: ['  passed  website-boxes  …'],
		fail: [' FAIL  |website-tooling| tooling/code-block-', 'width.test.ts', '  failed  website-boxes  failed at website-boxes …'],
	},
	{
		steps: ['=== perf-guards :: Run the performance guards', '$ pnpm perf:guard'],
		pass: ['  passed  perf-guards  …'],
		fail: ['[G2] bench /records: first click on "sort-score"', 'fetched 1 JS file(s) after the input: /build/late.js', '  failed  perf-guards  failed at perf-guards …'],
	},
	{
		steps: ['=== test :: Generate analyzer unit-contract receipts', '$ pnpm receipts:generate', '=== test :: Validate required analyzer consumer receipts', '$ pnpm receipts:check'],
		pass: ['Validated 9 required analyzer receipt(s).', '  passed  test  …'],
		fail: ['Required receipt packages/web/.witness/receipts/', 'analyzer-debug-channel-contract.json has a failed', 'verdict', '  failed  test  failed at test :: Validate …'],
	},
];

const W = 19.8;
const TOP = 3.2;
const PITCH = 1.3;
const rowV = (i: number) => TOP + 0.9 + i * PITCH;
const END = rowV(CHECKS.length - 1) + 0.9;
const BTN = { u0: 1.1, u1: 7.9, v0: END + 0.9, v1: END + 2.5 };
const H = BTN.v1 + 1;
const PANEL: SheetSpec = { key: 'panel', x: 0, y: 0, w: W, h: H, turn: -0.012, curl: false };
const TERM_ROWS = 9;
const TERM_PITCH = 0.72;
const TERM: SheetSpec = { key: 'term', x: 0.5, y: H + 0.9, w: W - 1, h: 1.5 + 0.9 + TERM_ROWS * TERM_PITCH, turn: -0.008, bar: 'terminal', curl: false };
const WHERE = 17.75;
const RUN = { u0: 18.45, u1: 19.45 };
const ICON = 1.35;
const termV = (n: number) => 1.5 + 0.9 + n * TERM_PITCH;
const NAME = 2.3;
const DESC = 8.3;
const CHIP = 14.6;

const scene = () => desk(680, [PANEL, TERM], [[W + 0.6, -1.2, 0]], { elevation: 64 });
const on = (k: ReturnType<typeof scene>, pts: P[], lift = 0) => k.raw.on('panel', pts, lift);

type Kit = ReturnType<typeof scene>;

const circle = (cu: number, cv: number, r: number): P[] => ellipse(cu, cv, r, r, 28);

function tickIcon(k: Kit, cu: number, cv: number, seed: number) {
	k.raw.path(wash(on(k, circle(cu, cv, 0.42)), seed, 0.2, 0.8), 'ok-wash');
	k.raw.path(outline(on(k, circle(cu, cv, 0.42)), { w: 1, seed: seed + 1 }), 'ok-ink');
	k.raw.path(stroke(on(k, [[cu - 0.2, cv], [cu - 0.05, cv + 0.16], [cu + 0.22, cv - 0.18]]), { w: 1.4, seed: seed + 2, over: 0.3 }), 'ok-ink');
}

function failIcon(k: Kit, cu: number, cv: number, seed: number) {
	k.raw.path(wash(on(k, circle(cu, cv, 0.42)), seed, 0.2, 0.8), 'bad-wash');
	k.raw.path(outline(on(k, circle(cu, cv, 0.42)), { w: 1, seed: seed + 1 }), 'bad-ink');
	k.raw.path(stroke(on(k, [[cu - 0.17, cv - 0.17], [cu + 0.17, cv + 0.17]]), { w: 1.4, seed: seed + 2, over: 0.2 }) + stroke(on(k, [[cu + 0.17, cv - 0.17], [cu - 0.17, cv + 0.17]]), { w: 1.4, seed: seed + 3, over: 0.2 }), 'bad-ink');
}

/** A fish hook: this check also runs in the pre-commit hook, on your machine. */
function hookIcon(k: Kit, cu: number, cv: number, seed: number) {
	const shank: P[] = [[cu + 0.12, cv - 0.42], [cu + 0.12, cv + 0.14]];
	const bend: P[] = Array.from({ length: 12 }, (_, i) => {
		const a = (i / 11) * Math.PI;
		return [cu - 0.1 + Math.cos(a) * 0.22, cv + 0.14 + Math.sin(a) * 0.22];
	});
	k.raw.path(stroke(on(k, shank), { w: 1.2, seed, over: 0 }) + stroke(on(k, bend), { w: 1.2, seed: seed + 1, over: 0 }) + stroke(on(k, [[cu - 0.32, cv + 0.14], [cu - 0.2, cv - 0.04]]), { w: 1, seed: seed + 2, over: 0 }) + outline(on(k, circle(cu + 0.12, cv - 0.47, 0.07)), { w: 0.8, seed: seed + 3 }), 'sheet-ink');
}

/** A cloud: this check runs only on GitHub, not before a commit. */
function cloudIcon(k: Kit, cu: number, cv: number, seed: number) {
	const bumps: P[] = [];
	const lobes: [number, number, number, number, number][] = [[-0.22, 0.05, 0.17, 90, 250], [0, -0.06, 0.22, 180, 360], [0.24, 0.04, 0.16, 270, 450]];
	for (const [dx, dy, r, a0, a1] of lobes) for (let i = 0; i <= 8; i++) {
		const a = ((a0 + ((a1 - a0) * i) / 8) * Math.PI) / 180;
		bumps.push([cu + dx + Math.cos(a) * r, cv + dy + Math.sin(a) * r]);
	}
	bumps.push([cu - 0.22, cv + 0.22]);
	k.raw.path(outline(on(k, bumps), { w: 1, seed }), 'sheet-ink');
}

/** The small run-at-home button at the end of a row: a terminal prompt on a key. */
function runButton(k: Kit, v: number, seed: number) {
	const face = on(k, roundRect(RUN.u0, v - 0.4, RUN.u1, v + 0.4, 0.15, 3), 0.03);
	k.raw.path(pathOf(face, true), 'sheet-paper');
	k.raw.path(outline(face, { w: 0.9, heavy: 0.8, centre: centreOf(face), seed }), 'sheet-ink');
	const m = (RUN.u0 + RUN.u1) / 2;
	k.raw.path(stroke(on(k, [[m - 0.3, v - 0.17], [m - 0.12, v], [m - 0.3, v + 0.17]]), { w: 1, seed: seed + 1, over: 0 }) + stroke(on(k, [[m - 0.02, v + 0.18], [m + 0.3, v + 0.18]]), { w: 1, seed: seed + 2, over: 0 }), 'sheet-ink');
}

function spinIcon(k: Kit, cu: number, cv: number, seed: number) {
	const arc: P[] = Array.from({ length: 14 }, (_, i) => {
		const a = -Math.PI / 2 + (i / 13) * Math.PI * 1.45;
		return [cu + Math.cos(a) * 0.36, cv + Math.sin(a) * 0.36];
	});
	k.raw.path(outline(on(k, circle(cu, cv, 0.36)), { w: 0.6, seed: seed + 1 }), 'wait-faint');
	k.raw.path(stroke(on(k, arc), { w: 1.5, seed, over: 0 }), 'wait-ink');
}

/** The sheet with everything that never changes: the box's frame, check names, Required chips, rules and the button's outline. */
function base() {
	const k = scene();
	k.lay();
	k.raw.path(line(on(k, [[0, TOP], [W, TOP]]), { w: 0.8, seed: 2401 }), 'sheet-ink');
	k.raw.path(line(on(k, [[0, END], [W, END]]), { w: 0.8, seed: 2402 }), 'sheet-ink');
	CHECKS.forEach((check, i) => {
		const v = rowV(i);
		if (i) k.raw.path(line(on(k, [[0.6, v - PITCH / 2], [W - 0.6, v - PITCH / 2]]), { w: 0.4, seed: 2410 + i, over: 0 }), 'sheet-ink faint');
		k.print('panel', NAME, v + 0.18, [{ t: 'CI / ', c: 'dim' }, { t: check.job, c: 'bold' }]);
		if (check.fast) hookIcon(k, WHERE, v, 2450 + i * 5);
		else cloudIcon(k, WHERE, v, 2450 + i * 5);
		runButton(k, v, 2470 + i * 5);
		if (check.required) {
			const chip = on(k, roundRect(CHIP, v - 0.42, CHIP + 2.6, v + 0.38, 0.38, 3));
			k.raw.path(outline(chip, { w: 0.7, seed: 2420 + i }), 'sheet-ink faint-strong');
			k.row('panel', CHIP + 0.38, v + 0.16, 'Required', 'ui small-ui');
		}
	});
	const button = on(k, roundRect(BTN.u0, BTN.v0, BTN.u1, BTN.v1, 0.35, 4), 0.04);
	const side = on(k, [[BTN.u0 + 0.2, BTN.v1], [BTN.u1, BTN.v1], [BTN.u1, BTN.v0 + 0.25], [BTN.u1 + 0.14, BTN.v0 + 0.4], [BTN.u1 + 0.14, BTN.v1 + 0.14], [BTN.u0 + 0.3, BTN.v1 + 0.14]]);
	k.raw.path(hatch(side, 1.05, 1.1, 2430, { cluster: 3, trim: 0.15 }), 'sheet-hatch');
	k.raw.path(pathOf(button, true), 'sheet-paper');
	return { k, button };
}

/** One part of the drawing, built on the shared camera, as a flat list of paths and texts. */
export interface Part {
	readonly paths: Item[];
	readonly texts: TextItem[];
}

const flat = (art: DeskArt): Part => ({
	paths: art.layers.flatMap((l) => l.paths).map((p, key) => ({ ...p, key })),
	texts: art.layers.flatMap((l) => l.texts).map((t, key) => ({ ...t, key })),
});

function part(draw: (k: Kit) => void): Part {
	const k = scene();
	draw(k);
	return flat(k.build());
}

export function drawing() {
	const { k: baseKit, button } = base();
	const baseArt = baseKit.build();
	const geo = scene();
	const buttonInk = part((k) => k.raw.path(outline(button, { w: 1.4, heavy: 1.3, centre: centreOf(button), seed: 2440 }), 'sheet-ink'));
	const buttonWash = part((k) => k.raw.path(wash(on(k, roundRect(BTN.u0 + 0.2, BTN.v0 + 0.2, BTN.u1 - 0.2, BTN.v1 - 0.2, 0.3, 3), 0.05), 2441, 0.4, 1.4), 'go-wash'));
	const label = (text: string) => part((k) => k.row('panel', BTN.u0 + 0.7, BTN.v1 - 0.55, text, 'ui bold-ui'));
	const rows = CHECKS.map((check, i) => {
		const v = rowV(i);
		return {
			key: i,
			job: check.job,
			pending: part((k) => {
				spinIcon(k, ICON, v, 2500 + i * 10);
				k.row('panel', DESC, v + 0.18, 'In progress', 'dim');
			}),
			passed: part((k) => {
				tickIcon(k, ICON, v, 2600 + i * 10);
				k.row('panel', DESC, v + 0.18, 'Successful in ' + check.took, 'dim');
			}),
			failed: part((k) => {
				failIcon(k, ICON, v, 2700 + i * 10);
				k.row('panel', DESC, v + 0.18, 'Failing after ' + check.took, 'bad-text');
			}),
			runs: check.runs,
			hover: part((k) => k.raw.path(wash(on(k, roundRect(0.4, v - 0.6, W - 0.4, v + 0.6, 0.3, 3)), 2800 + i, 0.3, 1), 'hover-wash')),
			hit: pathOf(on(geo, [[0.3, v - PITCH / 2], [RUN.u0 - 0.15, v - PITCH / 2], [RUN.u0 - 0.15, v + PITCH / 2], [0.3, v + PITCH / 2]]), true),
			runHit: pathOf(on(geo, roundRect(RUN.u0 - 0.1, v - 0.5, RUN.u1 + 0.1, v + 0.5, 0.15, 3)), true),
			fast: check.fast,
			passMs: 450 + (HOME[i]!.steps.length + HOME[i]!.pass.length) * 160 + 200,
			failMs: 450 + (HOME[i]!.steps.length + HOME[i]!.fail.length) * 160 + 200,
			home: {
				cmd: part((k) => k.row('term', 1, termV(0), '$ pnpm ci:local --job ' + check.job, 'bold')),
				steps: part((k) => HOME[i]!.steps.forEach((t, n) => k.row('term', 1, termV(1 + n), t, 'mono', 'show', 150 + n * 160))),
				pass: part((k) => HOME[i]!.pass.forEach((t, n) => k.row('term', 1, termV(1 + HOME[i]!.steps.length + n), t, n === HOME[i]!.pass.length - 1 ? 'mono ok-text' : 'mono', 'show', 450 + (HOME[i]!.steps.length + n) * 160))),
				fail: part((k) => HOME[i]!.fail.forEach((t, n) => k.row('term', 1, termV(1 + HOME[i]!.steps.length + n), t, 'mono bad-text', 'show', 450 + (HOME[i]!.steps.length + n) * 160))),
			},
			ring: part((k) => k.ring('panel', NAME - 0.2, NAME + (5 + check.job.length) * 0.3, v + 0.1, '', undefined, 0.5)),
			arrow: part((k) => k.arrow(['panel', BTN.u1 + 0.3, BTN.v0 + 0.5], ['panel', NAME + (2.5 + check.job.length / 2) * 0.3, v + 0.6], '', undefined, 1.2)),
		};
	});
	const header = (title: string, sub: string, icon: (k: Kit) => void) =>
		part((k) => {
			icon(k);
			k.row('panel', 2.4, 1.45, title, 'big');
			k.row('panel', 2.4, 2.45, sub, 'dim');
		});
	return {
		view: baseArt.view,
		width: baseArt.width,
		base: flat(baseArt),
		heads: {
			running: header("Some checks haven't completed yet", '5 checks', (k) => spinIcon(k, 1.3, 1.3, 2900)),
			passed: header('All checks have passed', '5 successful checks', (k) => tickIcon(k, 1.3, 1.3, 2910)),
			failed: header('Some checks were not successful', 'Merging is blocked', (k) => failIcon(k, 1.3, 1.3, 2920)),
			merged: header('Merged by the merge queue', 'into main', (k) => tickIcon(k, 1.3, 1.3, 2930)),
		},
		button: { ink: buttonInk, wash: buttonWash, ready: label('Merge when ready'), queued: label('Queued to merge') },
		rows,
		hit: pathOf(on(geo, [[0, 0], [W, 0], [W, TOP], [0, TOP]]), true),
		pressAt: pathOf(on(geo, roundRect(BTN.u0, BTN.v0, BTN.u1, BTN.v1, 0.35, 4)), true),
		prompt: part((k) => k.row('term', 1, termV(0), '$', 'dim')),
	};
}
