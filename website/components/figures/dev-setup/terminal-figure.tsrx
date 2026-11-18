// A contributor's first hour as a step-through: a real terminal, and a file panel once there is a change. The hook stops a commit with an unused import; click the red line to remove it.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { FILE, LINES, PANEL, RAIL, STEPS } from './terminal.ts';

const LAST = STEPS.length - 1;
const REST = PANEL.slice(2);

export default function TerminalFigure() @{
	let step = state(0);
	let downX = state(-1);
	const caption = computed(() => STEPS[step]!.caption);
	const nextLabel = computed(() => (step === LAST ? 'Start over' : 'Next'));
	const go = (to: number) => {
		step = Math.max(0, Math.min(LAST, to));
	};
	const next = () => go(step === LAST ? 0 : step + 1);

	<figure
		class="first-hour"
		tabindex={0}
		aria-label="A contributor's first hour, step by step. Next or the right arrow moves on, the left arrow goes back, Home or Escape starts over."
		onKeyDown={(event) => {
			if ((event.target as Element).tagName === 'INPUT') return;
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				go(step + 1);
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				go(step - 1);
			} else if (event.key === 'Home' || event.key === 'Escape') go(0);
			else if (event.key === 'End') go(LAST);
		}}
		onPointerDown={(event) => {
			downX = (event.target as Element).closest('button') ? -1 : event.clientX;
		}}
		onPointerUp={(event) => {
			if (downX < 0) return;
			const dx = event.clientX - downX;
			downX = -1;
			if (dx < -40) go(step + 1);
			else if (dx > 40) go(step - 1);
		}}
	>
		<div class="stage" data-step={step}>
			<div class="term">
				<InkScreen url="~/markless" tone="dark" label="Terminal">
					<div class="lines">
						@for (const line of LINES; key line.key) {
							<p class={'ln s' + line.step + ' ' + line.kind}>{line.text}</p>
						}
					</div>
				</InkScreen>
			</div>
			<div class="file">
				<InkScreen url={FILE} label="The file you change">
					<div class="code">
						<p class="row">{PANEL[0]!.text}</p>
						<p class="row slip">
							<button type="button" class="slip-fix" aria-label="Remove the unused import" onClick={() => go(5)}>
								{PANEL[1]!.text}
							</button>
						</p>
						<div>
							@for (const row of REST; key row.key) {
								<p class={'row ' + row.kind}>{row.text}</p>
							}
						</div>
					</div>
				</InkScreen>
			</div>
		</div>
		<div class="controls">
			<ol class="rail">
				@for (const dot of RAIL; key dot.key) {
					<li>
						<button type="button" class={dot.key === step ? 'pip now' : dot.key < step ? 'pip past' : 'pip'} aria-label={'Step ' + dot.n + ': ' + dot.caption} aria-current={dot.key === step ? 'step' : 'false'} onClick={() => go(dot.key)}>
							{dot.n}
						</button>
					</li>
				}
			</ol>
			<InkButton onClick={() => next()}>{nextLabel}</InkButton>
		</div>
		<p class="caption" aria-live="polite">{caption}</p>
		<style>
			.first-hour {
				container-type: inline-size;
				margin: var(--space-m) 0;
				border-radius: 12px;
				touch-action: pan-y;
			}

			.first-hour:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.stage {
				display: grid;
				gap: 0.8rem;
				grid-template-columns: minmax(0, 1fr);
			}

			@container (min-width: 760px) {
				.stage:not([data-step='0']):not([data-step='1']):not([data-step='2']) {
					grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
				}
			}

			.lines,
			.code {
				padding: 0.6rem 0.9rem 0.9rem;
				min-height: 9.5em;
				font-family: var(--font-mono);
				font-size: 0.82rem;
				line-height: 1.55;
				font-weight: 500;
			}

			.lines p,
			.code p {
				font-family: var(--font-mono);
				font-size: 0.82rem;
				line-height: 1.55;
				margin: 0;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}

			.ln {
				display: none;
			}

			.stage[data-step='0'] .s0,
			.stage[data-step='1'] .s1,
			.stage[data-step='2'] .s2,
			.stage[data-step='3'] .s3,
			.stage[data-step='4'] .s4,
			.stage[data-step='5'] .s5,
			.stage[data-step='6'] .s6 {
				display: block;
				animation: type-in 260ms ease both;
			}

			@keyframes type-in {
				from {
					opacity: 0;
					transform: translateY(3px);
				}
			}

			.cmd {
				font-weight: 800;
			}

			.ok {
				color: oklch(78% 0.13 150);
			}

			.bad {
				color: oklch(72% 0.17 25);
			}

			.dim {
				opacity: 0.6;
			}

			.file {
				display: none;
			}

			.stage[data-step='3'] .file,
			.stage[data-step='4'] .file,
			.stage[data-step='5'] .file,
			.stage[data-step='6'] .file {
				display: block;
			}

			.row.added {
				background: color-mix(in oklch, oklch(70% 0.14 150) 22%, transparent);

				html.dark & {
					background: color-mix(in srgb, oklch(70% 0.14 150) 22%, var(--cream));
					color: var(--on-accent);
				}
			}

			.row.slip {
				background: color-mix(in oklch, var(--yellow) 45%, transparent);

				html.dark & {
					background: color-mix(in srgb, var(--yellow) 45%, var(--cream));
					color: var(--on-accent);
				}
			}

			.stage[data-step='5'] .row.slip,
			.stage[data-step='6'] .row.slip {
				display: none;
			}

			.slip-fix {
				all: unset;
				white-space: pre-wrap;
				cursor: pointer;
			}

			.stage[data-step='4'] .slip-fix {
				text-decoration: underline wavy oklch(55% 0.19 25);
				text-underline-offset: 3px;
			}

			.slip-fix:hover {
				text-decoration: line-through;
			}

			.slip-fix:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 2px;
			}

			.controls {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				justify-content: center;
				gap: 0.8rem 1.2rem;
				margin-top: 0.7rem;
			}

			.rail {
				display: flex;
				gap: 0.35rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.pip {
				width: 1.9rem;
				height: 1.9rem;
				border: 1.5px solid var(--ink);
				border-radius: 50% 46% 52% 48%;
				background: transparent;
				color: var(--ink);
				font: 700 0.85rem/1 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.pip.past {
				background: color-mix(in oklch, var(--ink) 12%, transparent);
			}

			.pip.now {
				background: var(--pink);
				color: oklch(28% 0.015 90);
			}

			.pip:hover {
				background: color-mix(in oklch, var(--pink) 40%, transparent);

				html.dark & {
					background: color-mix(in srgb, var(--pink) 40%, var(--cream));
					color: var(--on-accent);
				}
			}

			.caption {
				min-height: 2.8em;
				margin: 0.6rem auto 0;
				max-width: 34rem;
				text-align: center;
				font-size: 1rem;
			}

			@media (prefers-reduced-motion: reduce) {
				.first-hour * {
					animation: none !important;
					transition: none !important;
				}
			}
		</style>
	</figure>
}
