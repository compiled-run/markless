// A component, its browser test and Vitest's runner: Run renders TodoItem, presses its button and the row goes green; click the handler to break it and the same run goes red at the expect.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { COMPONENT, FAILURE, HANDLER, TEST } from './todo.ts';

const rows = (lines: readonly string[], from: number) => lines.map((text, i) => ({ key: from + i, text }));
const HEAD = rows(COMPONENT.slice(1, 6), 1);
const TAIL = rows(COMPONENT.slice(7), 7);
const EXPECT = TEST.findIndex((text) => text.includes('expect.element'));
const TEST_HEAD = rows(TEST.slice(1, EXPECT), 1);
const TEST_LINE = TEST[EXPECT]!;
const TEST_TAIL = rows(TEST.slice(EXPECT + 1), EXPECT + 1);
const LINE = COMPONENT[6]!;
const CUT = LINE.indexOf(HANDLER.ok);
const BEFORE = LINE.slice(0, CUT);
const AFTER = LINE.slice(CUT + HANDLER.ok.length);

export default function RunnerFigure() @{
	let broken = state(false);
	let phase = state('idle');
	let mounted = state(false);
	let done = state(false);
	let pressing = state(false);
	let runId = state(0);
	let said = state('');
	let tip = state('');
	const handler = computed(() => (broken ? HANDLER.broken : HANDLER.ok));
	const lineClass = computed(() => (broken ? 'line handler broken' : 'line handler'));
	const label = computed(() => 'Buy milk: ' + (done ? 'done' : 'to do'));
	const expectClass = computed(() => (phase === 'fail' ? 'line expect failing' : 'line expect'));
	const failClass = computed(() => (phase === 'fail' ? 'failure on' : 'failure'));
	const caption = computed(() => (tip === '' ? 'Press Run. Click the handler to break the component, then run it again.' : tip));
	const rowClass = computed(() => 'row ' + phase);
	const mark = computed(() => (phase === 'pass' ? '✓' : phase === 'fail' ? '×' : phase === 'running' ? '…' : '○'));
	const stage = computed(() => (mounted ? (pressing ? 'stage on pressing' : 'stage on') : 'stage'));

	const press = () => {
		done = broken ? false : !done;
	};
	const run = () => {
		runId = runId + 1;
		const id = runId;
		phase = 'running';
		mounted = true;
		done = false;
		pressing = false;
		said = 'Running: render(TodoItem), then a click.';
		setTimeout(() => {
			if (id === runId) pressing = true;
		}, 450);
		setTimeout(() => {
			if (id !== runId) return;
			pressing = false;
			press();
		}, 750);
		setTimeout(() => {
			if (id !== runId) return;
			phase = done ? 'pass' : 'fail';
			said = done ? 'Passed: the button reads Buy milk: done.' : 'Failed at the expect: ' + FAILURE;
		}, 1150);
	};
	const flip = () => {
		runId = runId + 1;
		pressing = false;
		broken = !broken;
		phase = 'idle';
		said = broken ? 'The handler now sets done = false. Run the test again.' : 'The handler flips done again.';
	};

	<figure
		class="runner-toy"
		tabindex={0}
		aria-label="A component, its test and the Vitest runner. Press Enter or Run to run the test. Press B, or click the handler line, to break or fix the component. Escape resets."
		onKeyDown={(event) => {
			if (event.target !== event.currentTarget) return;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				run();
			} else if (event.key === 'b' || event.key === 'B') {
				flip();
			} else if (event.key === 'Escape') {
				runId = runId + 1;
				pressing = false;
				broken = false;
				phase = 'idle';
				mounted = false;
				done = false;
				said = 'Back to the start.';
			}
		}}
	>
		<InkScreen url={COMPONENT[0]!} label="The component">
			<div class="code">
				<div>
					@for (const row of HEAD; key row.key) {
						<p class="line">{row.text}</p>
					}
				</div>
				<button
					type="button"
					class={lineClass}
					onClick={() => flip()}
					onPointerEnter={() => {
						tip = broken ? 'Click to fix the handler: done = !done' : 'Click to break the handler: done = false';
					}}
					onPointerLeave={() => {
						tip = '';
					}}
				>
					<span>{BEFORE}</span>
					<span class="hot">{handler}</span>
					<span>{AFTER}</span>
				</button>
				<div>
					@for (const row of TAIL; key row.key) {
						<p class="line">{row.text}</p>
					}
				</div>
			</div>
		</InkScreen>
		<div class="pair">
			<InkScreen url={TEST[0]!} label="The test">
				<div class="code">
					<div>
						@for (const row of TEST_HEAD; key row.key) {
							<p class="line">{row.text}</p>
						}
					</div>
					<p class={expectClass}>{TEST_LINE}</p>
					<div>
						@for (const row of TEST_TAIL; key row.key) {
							<p class="line">{row.text}</p>
						}
					</div>
				</div>
			</InkScreen>
			<InkScreen url="Vitest · chromium" label="The test runner">
				<div class="runner">
					<p class={rowClass}>
						<span class="mark">{mark}</span>
						<span class="name">a click marks it done</span>
					</p>
					<p class={failClass}>{FAILURE}</p>
					<div class={stage}>
						<button
							type="button"
							class="rendered"
							onClick={() => press()}
							onPointerEnter={() => {
								tip = 'TodoItem, mounted by render(TodoItem). Click it yourself.';
							}}
							onPointerLeave={() => {
								tip = '';
							}}
						>
							{label}
						</button>
						<span class="pointer" aria-hidden="true">
							<svg viewBox="0 0 20 28">
								<path d="M2 2 L2 22 L7 17 L11 26 L14 24 L10 16 L17 16 Z" />
							</svg>
						</span>
					</div>
					<p class="go">
						<InkButton onClick={() => run()}>Run</InkButton>
					</p>
				</div>
			</InkScreen>
		</div>
		<p class="caption">{caption}</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.runner-toy {
				margin: var(--space-m) 0;
				border-radius: 12px;
			}

			.runner-toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.pair {
				display: grid;
				gap: 0 0.6rem;
				container-type: inline-size;

				@container (min-width: 640px) {
					grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
				}
			}

			.code {
				padding: 0.5rem 0.6rem 0.8rem;
				overflow-x: auto;
			}

			.line {
				display: block;
				min-height: 1.4em;
				margin: 0;
				padding: 0 0.3rem;
				font-family: var(--font-mono);
				font-size: 0.74rem;
				line-height: 1.5;
				white-space: pre;
				tab-size: 2;
			}

			button.line {
				width: 100%;
				border: 0;
				border-radius: 5px;
				background: none;
				color: inherit;
				text-align: left;
				cursor: pointer;
				transition: background 160ms ease;
			}

			button.line span {
				font-family: var(--font-mono);
			}

			button.line:hover,
			button.line:focus-visible {
				background: color-mix(in oklch, var(--yellow) 30%, transparent);
			}

			button.line:focus-visible {
				outline: 2px dashed currentColor;
			}

			.hot {
				border-bottom: 1.5px dashed currentColor;
			}

			.broken .hot {
				color: #cb2431;
				text-decoration: underline wavy #cb2431;
				border-bottom: 0;
			}

			.caption {
				margin: 0.2rem 0.4rem 0;
				min-height: 1.5em;
				font-size: 0.9rem;
				opacity: 0.8;
			}

			.expect.failing {
				background: color-mix(in oklch, #cb2431 16%, transparent);
				box-shadow: inset 3px 0 0 #cb2431;
			}

			.runner {
				display: grid;
				gap: 0.5rem;
				padding: 0.6rem 0.9rem 0.9rem;
			}

			.row {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				margin: 0;
				padding: 0.2rem 0.5rem;
				border-radius: 6px;
				font-size: 0.95rem;
				transition: background 200ms ease;
			}

			.mark {
				width: 1.2rem;
				font-weight: 800;
				text-align: center;
			}

			.name {
				font-family: var(--font-mono);
				font-size: 0.85rem;
			}

			.row.pass {
				background: color-mix(in oklch, oklch(72% 0.14 150) 35%, transparent);
			}

			.row.fail {
				background: color-mix(in oklch, #cb2431 22%, transparent);
				animation: shake 360ms ease-in-out;
			}

			.row.fail .mark {
				color: #cb2431;
			}

			@keyframes shake {
				25% {
					transform: translateX(-3px);
				}
				75% {
					transform: translateX(3px);
				}
			}

			.failure {
				display: none;
				margin: 0;
				font-family: var(--font-mono);
				font-size: 0.75rem;
				line-height: 1.4;
				white-space: pre-wrap;
				color: #cb2431;
			}

			.failure.on {
				display: block;
			}

			.stage {
				position: relative;
				display: grid;
				place-items: center;
				min-height: 4.2rem;
				border: 1.5px dashed color-mix(in oklch, currentColor 40%, transparent);
				border-radius: 8px;
			}

			.rendered {
				visibility: hidden;
				padding: 0.3rem 0.9rem 0.35rem;
				border: 2px solid var(--screen-ink, var(--ink));
				border-radius: 14px 18px 12px 16px / 16px 12px 18px 14px;
				background: var(--screen-paper, var(--paper));
				box-shadow: 1px 2px 0 var(--screen-ink, var(--ink));
				color: var(--screen-ink, var(--ink));
				font: 700 0.95rem 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
				transition: transform 120ms ease;
			}

			.on .rendered {
				visibility: visible;
			}

			.rendered:hover {
				transform: translateY(-2px);
			}

			.pressing .rendered {
				transform: translateY(2px);
			}

			.pointer {
				position: absolute;
				left: calc(50% + 2.5rem);
				top: 60%;
				width: 1rem;
				opacity: 0;
				transition: opacity 120ms ease, transform 200ms ease;
				pointer-events: none;
			}

			.pointer path {
				fill: var(--paper);
				stroke: var(--ink);
				stroke-width: 1.6;
				stroke-linejoin: round;
			}

			.pressing .pointer {
				opacity: 1;
				transform: translate(-0.8rem, -0.6rem) scale(0.9);
			}

			.go {
				margin: 0;
			}

			@media (prefers-reduced-motion: reduce) {
				.runner-toy * {
					animation: none !important;
					transition: none !important;
				}
			}

			html.dark .runner-toy {
				button.line:hover,
				button.line:focus-visible {
					background: color-mix(in srgb, var(--yellow) 30%, var(--cream));
					color: var(--on-accent);
				}

				.broken .hot,
				.row.fail .mark,
				.failure {
					color: var(--figure-error);
					text-decoration-color: var(--figure-error);
				}

				.expect.failing {
					background: color-mix(in oklch, var(--figure-error) 16%, transparent);
					box-shadow: inset 3px 0 0 var(--figure-error);
				}

				.row.pass {
					background: color-mix(in oklch, var(--figure-ok) 22%, transparent);
				}

				.row.fail {
					background: color-mix(in oklch, var(--figure-error) 22%, transparent);
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
