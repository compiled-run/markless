// A pull request's checks box in ink: run the checks and they tick in; click a check to make it fail; run any check at home and the same job runs in a terminal below; Merge refuses while any check is running or red, and points at it.
import { computed, state } from '@markless/core';
import { art } from './checks.art.ts';
import { FIXES } from './fixes.ts';

/** When each check finishes after a run starts, in ms; the gate, test, waits for the rest. */
const DONE_AT = [500, 1100, 2100, 2400];
const GATE = art.rows.length - 1;
const START = '00000';
/** What each check runs, shown under the box on hover; the same strings checks.ts prints. */
const RUNS = art.rows.map((row) => row.runs);

export default function ChecksFigure() @{
	let status = state(START);
	let fails = state('00000');
	let elapsed = state(-1);
	let merged = state(false);
	let point = state(-1);
	let beat = state('rest');
	let touched = state(false);
	let said = state('');
	let hovered = state(-1);
	let home = state(-1);
	let homeFail = state(false);
	let homeDone = state(false);
	let runBeat = state('rest');
	let sel = state(0);
	let ticket = state(0);
	const where = (i: number) => (art.rows[i]!.fast ? 'Also runs before every commit.' : 'Runs on GitHub; at home only when you ask.');
	const hint = computed(() => {
		if (hovered >= 0) return art.rows[hovered]!.job + ': ' + RUNS[hovered]!.replaceAll('`', '') + '. ' + where(hovered);
		if (home >= 0 && !homeDone) return 'Running ' + art.rows[home]!.job + ' at home, with the same command CI runs.';
		if (home === GATE) return homeFail ? FIXES[home] : 'At home, test only checks the analyzer receipts; on GitHub it also fails when any lane fails.';
		if (home >= 0) return homeFail ? FIXES[home] : art.rows[home]!.job + ' passed at home, so it passes in CI too.';
		return "Press a check's ›_ to run it at home.";
	});
	const phase = computed(() => (merged ? 3 : status.includes('0') ? 0 : status.includes('2') ? 2 : 1));
	const dials = computed(() => {
		return '--ph:' + phase + ';--merged:' + (merged ? 1 : 0);
	});

	const settle = (from: string, t: number) => {
		let next = '';
		for (let i = 0; i < GATE; i++) next += from[i] !== '0' ? from[i] : t >= DONE_AT[i]! ? (fails[i] === '1' ? '2' : '1') : '0';
		const rest = next.slice(0, GATE);
		next += rest.includes('0') ? '0' : rest.includes('2') || fails[GATE] === '1' ? '2' : '1';
		return next;
	};
	const run = () => {
		merged = false;
		point = -1;
		status = START;
		elapsed = 0;
		said = 'Checks running.';
		const timer = setInterval(() => {
			elapsed = elapsed + 100;
			status = settle(status, elapsed);
			if (!status.includes('0')) {
				clearInterval(timer);
				elapsed = -1;
				said = status.includes('2') ? 'A check failed. Merging is blocked.' : 'All checks have passed.';
			}
		}, 100);
	};
	const toggle = (i: number) => {
		fails = fails.slice(0, i) + (fails[i] === '1' ? '0' : '1') + fails.slice(i + 1);
		merged = false;
		point = -1;
		if (status[i] !== '0') {
			const flipped = status.slice(0, i) + (fails[i] === '1' ? '2' : '1') + status.slice(i + 1);
			status = settle(flipped.slice(0, GATE) + '0', Infinity);
		}
		said = fails[i] === '1' ? art.rows[i]!.job + ' will fail.' : art.rows[i]!.job + ' is fixed.';
	};
	const runHome = (i: number) => {
		const mine = ticket + 1;
		ticket = mine;
		sel = i;
		home = i;
		homeFail = fails[i] === '1';
		homeDone = false;
		runBeat = runBeat === 'a' ? 'b' : 'a';
		said = 'Running ' + art.rows[i]!.job + ' at home.';
		setTimeout(() => {
			if (ticket !== mine) return;
			homeDone = true;
			if (i !== GATE) {
				const next = status.slice(0, i) + (homeFail ? '2' : '1') + status.slice(i + 1, GATE);
				const gate = next.includes('0') ? '0' : next.includes('2') || fails[GATE] === '1' ? '2' : '1';
				status = next + gate;
			}
			merged = false;
			point = -1;
			said = art.rows[i]!.job + (homeFail ? ' failed at home. ' + FIXES[i] : ' passed at home.');
		}, homeFail ? art.rows[i]!.failMs : art.rows[i]!.passMs);
	};
	const merge = () => {
		const waiting = status.indexOf('0');
		const red = status.indexOf('2');
		const blocker = waiting >= 0 ? waiting : red;
		if (blocker >= 0) {
			point = blocker;
			beat = beat === 'a' ? 'b' : 'a';
			said = 'Merge refused: ' + art.rows[blocker]!.job + (waiting >= 0 ? ' is still running.' : ' failed.');
			return;
		}
		merged = true;
		point = -1;
		said = 'Queued to merge, then merged into main.';
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="A pull request's checks. Press Enter to run them, keys 1 to 5 make a check fail or pass, R runs the last check you picked at home, M presses Merge when ready, Escape resets."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const hint = setTimeout(() => {
				if (!touched) run();
			}, 1200);
			return () => clearTimeout(hint);
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				run();
			} else if (event.key === 'm' || event.key === 'M') merge();
			else if (event.key === 'r' || event.key === 'R') runHome(sel);
			else if (event.key === 'Escape') {
				status = START;
				fails = '00000';
				merged = false;
				point = -1;
				home = -1;
				ticket = ticket + 1;
				said = 'Reset.';
			} else {
				const n = Number(event.key);
				if (n >= 1 && n <= art.rows.length) {
					sel = n - 1;
					toggle(n - 1);
				}
			}
		}}
	>
		<svg
			class="scene"
			data-beat={beat}
			style={dials}
			viewBox={art.view}
			aria-hidden="true"
			onClick={(event) => {
				touched = true;
				const target = event.target as Element;
				const runAt = target.closest('[data-run]');
				if (runAt) return runHome(Number(runAt.getAttribute('data-run')));
				const row = target.closest('[data-row]');
				if (row) {
					sel = Number(row.getAttribute('data-row'));
					return toggle(sel);
				}
				if (target.closest('.press')) return merge();
				if (target.closest('.head-hit')) return run();
			}}
			onPointerOver={(event) => {
				const row = (event.target as Element).closest('[data-row]') ?? (event.target as Element).closest('[data-run]');
				hovered = row ? Number(row.getAttribute('data-row') ?? row.getAttribute('data-run')) : -1;
			}}
			onPointerLeave={() => {
				hovered = -1;
			}}
		>
			<g>
				@for (const item of art.base.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of art.base.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="head ph0">
				@for (const item of art.heads.running.paths; key item.key) {
					<path class={item.cls + ' spin'} d={item.d} />
				}
				@for (const text of art.heads.running.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="head ph1">
				@for (const item of art.heads.passed.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of art.heads.passed.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="head ph2">
				@for (const item of art.heads.failed.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of art.heads.failed.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="head ph3">
				@for (const item of art.heads.merged.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				@for (const text of art.heads.merged.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<path class="head-hit" d={art.hit} />
			<g>
				@for (const row of art.rows; key row.key) {
					<g class={'row s' + status[row.key] + (point === row.key ? ' blocking' : '')} data-row={row.key}>
						<path class="row-hit" d={row.hit} />
						<g class="hover">
							@for (const item of row.hover.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
						</g>
						<g class="state pending">
							@for (const item of row.pending.paths; key item.key) {
								<path class={item.cls + ' spin'} d={item.d} />
							}
							@for (const text of row.pending.texts; key text.key) {
								<text class={text.cls + ' desc'} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g class="state passed">
							@for (const item of row.passed.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
							@for (const text of row.passed.texts; key text.key) {
								<text class={text.cls + ' desc'} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g class="state failed">
							@for (const item of row.failed.paths; key item.key) {
								<path class={item.cls} d={item.d} />
							}
							@for (const text of row.failed.texts; key text.key) {
								<text class={text.cls + ' desc'} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g class="pointed">
							@for (const item of row.ring.paths; key item.key) {
								<path class={item.cls + ' bad-pen'} d={item.d} />
							}
							@for (const item of row.arrow.paths; key item.key) {
								<path class={item.cls + ' bad-pen'} d={item.d} />
							}
						</g>
					</g>
				}
			</g>
			<g class="press">
				<g class="wash">
					@for (const item of art.button.wash.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				@for (const item of art.button.ink.paths; key item.key) {
					<path class={item.cls} d={item.d} />
				}
				<g class="label ready">
					@for (const text of art.button.ready.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
				<g class="label queued">
					@for (const text of art.button.queued.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
				<path class="press-hit" d={art.pressAt} />
			</g>
			<g>
				@for (const row of art.rows; key row.key) {
					<path class={'run-hit' + (home === row.key ? ' active' : '')} data-run={row.key} d={row.runHit} />
				}
			</g>
			<g class={home < 0 ? 'idle on' : 'idle'}>
				@for (const text of art.prompt.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g data-run-beat={runBeat}>
				@for (const row of art.rows; key row.key) {
					<g class={'home' + (home === row.key ? ' on' : '')}>
						<g>
							@for (const text of row.home.cmd.texts; key text.key) {
								<text class={text.cls} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g>
							@for (const text of row.home.steps.texts; key text.key) {
								<text class={text.cls} style={text.style} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g class={homeFail ? 'result' : 'result on'}>
							@for (const text of row.home.pass.texts; key text.key) {
								<text class={text.cls} style={text.style} transform={text.matrix}>{text.text}</text>
							}
						</g>
						<g class={homeFail ? 'result on' : 'result'}>
							@for (const text of row.home.fail.texts; key text.key) {
								<text class={text.cls} style={text.style} transform={text.matrix}>{text.text}</text>
							}
						</g>
					</g>
				}
			</g>
		</svg>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			A pen-and-ink pull request checks box with five checks from CI: agent-files, typecheck, website-boxes, perf-guards and test. Run them and each spinner turns into a tick. Click a check to make it fail. Merge when ready refuses while a check is running or red, and points at it.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				border-radius: 12px;

				@media (max-width: 600px) {
					margin-inline: calc(50% - 50vw + 0.4rem);
				}
			}

			.toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--ok: oklch(52% 0.13 150);
				--bad: oklch(55% 0.19 25);
				--wait: oklch(68% 0.14 75);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.35;
			}

			.faint-strong {
				opacity: 0.6;
			}

			.light {
				opacity: 0.55;
			}

			.hatch,
			.sheet-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.sheet-hatch {
				stroke: var(--sheet-ink);
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			text {
				white-space: pre;
				fill: var(--sheet-ink);
			}

			.mono,
			.dim,
			.bold {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 0;
				font-size: 10px;
				font-weight: 500;
			}

			.dim {
				opacity: 0.6;
			}

			.bold {
				font-weight: 800;
			}

			.ui,
			.big {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 11px;
			}

			.big {
				font-size: 14px;
				font-weight: 700;
			}

			.small-ui {
				font-size: 9px;
			}

			.bold-ui {
				font-weight: 700;
			}

			.ok-ink {
				fill: var(--ok);
			}

			.ok-wash {
				fill: var(--ok);
				opacity: 0.18;
			}

			.bad-ink {
				fill: var(--bad);
			}

			.bad-wash {
				fill: var(--bad);
				opacity: 0.18;
			}

			.bad-text {
				font-family: var(--font-mono);
				font-size: 10px;
				fill: var(--bad);
			}

			.wait-ink {
				fill: var(--wait);
			}

			.wait-faint {
				fill: var(--wait);
				opacity: 0.35;
			}

			.spin {
				transform-box: fill-box;
				transform-origin: center;
				animation: spin 900ms linear infinite;
			}

			@keyframes spin {
				to {
					transform: rotate(360deg);
				}
			}

			.go-wash {
				fill: var(--ok);
				opacity: 0.5;
			}

			.head,
			.state,
			.label,
			.pointed {
				transition: opacity 160ms ease;
			}

			.ph0 {
				opacity: max(0, 1 - var(--ph));
			}

			.ph1 {
				opacity: max(0, 1 - max(var(--ph) - 1, 1 - var(--ph)));
			}

			.ph2 {
				opacity: max(0, 1 - max(var(--ph) - 2, 2 - var(--ph)));
			}

			.ph3 {
				opacity: max(0, var(--ph) - 2);
			}

			.state,
			.pointed {
				opacity: 0;
			}

			.s0 .pending,
			.s1 .passed,
			.s2 .failed,
			.blocking .pointed {
				opacity: 1;
			}

			.hover {
				opacity: 0;
				transition: opacity 140ms ease;
			}

			.row {
				cursor: pointer;
			}

			.row:hover .hover {
				opacity: 1;
			}

			.pointed,
			.hover,
			.state,
			.label,
			.head {
				pointer-events: none;
			}

			.hint {
				margin: 0.4rem 0 0;
				min-height: 1.5em;
				font-family: var(--font-mono);
				font-size: var(--step--1, 0.85rem);
				color: color-mix(in oklch, var(--ink) 70%, transparent);
				text-align: center;
			}

			.run-hit {
				fill: transparent;
				cursor: pointer;
			}

			.run-hit:hover,
			.run-hit.active {
				fill: color-mix(in oklch, var(--yellow) 40%, transparent);
			}

			.home,
			.idle,
			.result {
				opacity: 0;
				pointer-events: none;
			}

			.home.on,
			.idle.on,
			.result.on {
				opacity: 1;
			}

			.ok-text {
				fill: var(--ok);
				font-weight: 700;
			}

			[data-run-beat='a'] .home.on .show {
				animation: line-a 220ms var(--at) ease-out both;
			}

			[data-run-beat='b'] .home.on .show {
				animation: line-b 220ms var(--at) ease-out both;
			}

			@keyframes line-a {
				from {
					opacity: 0;
				}
			}

			@keyframes line-b {
				from {
					opacity: 0;
				}
			}

			.row-hit,
			.head-hit,
			.press-hit {
				fill: transparent;
			}

			.head-hit,
			.press {
				cursor: pointer;
			}

			.hover-wash {
				fill: var(--yellow);
				opacity: 0.35;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.4;
				}
			}

			.bad-pen {
				fill: none;
				stroke: var(--bad);
				stroke-width: 1.5;
				stroke-linecap: round;
			}

			.halo.bad-pen {
				stroke: var(--sheet);
				stroke-width: 3.4;
			}

			.press .wash {
				opacity: calc(0.25 + 0.75 * max(0, 1 - max(var(--ph) - 1, 1 - var(--ph))) + 0.75 * var(--merged));
				transition: opacity 200ms ease;
			}

			.press:hover .wash {
				opacity: 1;
			}

			.ready {
				opacity: calc(1 - var(--merged));
			}

			.queued {
				opacity: var(--merged);
			}

			.scene[data-beat='a'] .press {
				animation: refuse-a 360ms ease;
			}

			.scene[data-beat='b'] .press {
				animation: refuse-b 360ms ease;
			}

			@keyframes refuse-a {
				20%,
				60% {
					transform: translateX(-4px);
				}
				40%,
				80% {
					transform: translateX(4px);
				}
			}

			@keyframes refuse-b {
				20%,
				60% {
					transform: translateX(-4px);
				}
				40%,
				80% {
					transform: translateX(4px);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
