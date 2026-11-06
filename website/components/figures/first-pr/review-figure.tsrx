// A pull request drawn in ink, stepped through from open to merged: checks start, Macroscope leaves a finding, it resolves, checks go green, the merge queue takes it. Merge pressed too early shakes and points at what blocks it.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { CHECKS, FINDING, RAIL, STEPS, TITLE } from './review.ts';

const LAST = STEPS.length - 1;

export default function ReviewFigure() @{
	let step = state(0);
	let blocker = state('');
	let beat = state(0);
	let downX = state(-1);
	const dials = computed(() => '--step:' + step);
	const caption = computed(() => STEPS[step]!);
	const nextLabel = computed(() => (step === LAST ? 'Start over' : 'Next'));
	const blockClass = computed(() => (blocker === '' ? 'pr' : 'pr blocked-' + blocker + (beat % 2 ? ' shake-a' : ' shake-b')));
	const go = (to: number) => {
		step = Math.max(0, Math.min(LAST, to));
		blocker = '';
	};
	const next = () => go(step === LAST ? 0 : step + 1);
	const merge = () => {
		if (step < 2) {
			blocker = step < 1 ? 'checks' : 'finding';
			beat = beat + 1;
			return;
		}
		if (step < 3) {
			blocker = 'checks';
			beat = beat + 1;
			return;
		}
		if (step === 3) go(4);
	};

	<figure
		class="pr-steps"
		tabindex={0}
		aria-label="A pull request, step by step. Next or the right arrow moves on, the left arrow goes back, Home or Escape starts over."
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
		<div class="stage" style={dials} data-step={step}>
			<InkScreen url="github.com/compiled-run/markless/pull/…" label="A pull request">
				<div class={blockClass}>
					<p class="head">
						<span class="status open">Open</span>
						<span class="status merged">Merged</span>
						<strong>{TITLE}</strong>
					</p>
					<ul class="checks">
						<li><span class="dot" aria-hidden="true"></span>{CHECKS[0]}</li>
						<li><span class="dot" aria-hidden="true"></span>{CHECKS[1]}</li>
						<li><span class="dot" aria-hidden="true"></span>{CHECKS[2]}</li>
						<li><span class="dot" aria-hidden="true"></span>{CHECKS[3]}</li>
					</ul>
					<div class="finding">
						<p class="who">
							<span class="avatar" aria-hidden="true">M</span>
							<span class="sev">🟠 {FINDING.severity}</span>
							<span class="where">{FINDING.where}</span>
							<span class="resolved">✓ Resolved</span>
						</p>
						<p class="body">{FINDING.text}</p>
						<p class="fixes">
							<button type="button" class="act" onClick={() => go(2)}>Fix it</button>
							<button type="button" class="act" onClick={() => go(2)}>Reply</button>
						</p>
					</div>
					<div class="mergebox">
						<button type="button" class="merge-button" onClick={() => merge()}>
							<span class="lbl-when">Merge when ready</span>
							<span class="lbl-queued">Queued to merge</span>
							<span class="lbl-merged">Merged</span>
						</button>
						<span class="arrow" aria-hidden="true">↑</span>
					</div>
				</div>
			</InkScreen>
		</div>
		<div class="controls">
			<ol class="rail">
				@for (const dot of RAIL; key dot.key) {
					<li>
						<button type="button" class={dot.key === step ? 'pip now' : dot.key < step ? 'pip done' : 'pip'} aria-label={'Step ' + dot.n + ': ' + dot.caption} aria-current={dot.key === step ? 'step' : 'false'} onClick={() => go(dot.key)}>
							{dot.n}
						</button>
					</li>
				}
			</ol>
			<InkButton onClick={() => next()}>{nextLabel}</InkButton>
		</div>
		<p class="caption" aria-live="polite">{caption}</p>
		<style>
			.pr-steps {
				margin: var(--space-m) 0;
				border-radius: 12px;
				touch-action: pan-y;
			}

			.pr-steps:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.pr {
				display: grid;
				gap: 0.7rem;
				padding: 0.7rem 1rem 1rem;
				font-size: 1rem;
			}

			.pr p,
			.pr ul {
				margin: 0;
			}

			.head {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.5rem;
				font-size: 1.1rem;
			}

			.status {
				padding: 0.05rem 0.55rem;
				border: 1.5px solid currentColor;
				border-radius: 999px 900px 999px 950px;
				font-size: 0.8rem;
				font-weight: 700;
			}

			.open {
				background: color-mix(in oklch, oklch(70% 0.14 150) 35%, transparent);
			}

			.merged {
				background: color-mix(in oklch, oklch(60% 0.16 300) 35%, transparent);
			}

			.stage[data-step='5'] .open,
			.stage:not([data-step='5']) .merged {
				display: none;
			}

			.checks {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem 1rem;
				padding: 0;
				list-style: none;
				font-family: var(--font-mono);
				font-size: 0.85rem;
				line-height: 1.3;
				font-weight: 500;
			}

			.checks li {
				font-family: var(--font-mono);
				font-size: 0.85rem;
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
			}

			.dot {
				width: 0.8rem;
				height: 0.8rem;
				border: 2px solid oklch(68% 0.14 75);
				border-right-color: transparent;
				border-radius: 50%;
				animation: spin 900ms linear infinite;
				transition: background 300ms ease, border-color 300ms ease;
			}

			.stage[data-step='3'] .dot,
			.stage[data-step='4'] .dot,
			.stage[data-step='5'] .dot {
				border-color: oklch(52% 0.13 150);
				background: color-mix(in oklch, oklch(52% 0.13 150) 45%, transparent);
				animation: none;
			}

			@keyframes spin {
				to {
					transform: rotate(360deg);
				}
			}

			.finding {
				display: grid;
				gap: 0.35rem;
				padding: 0.55rem 0.75rem;
				border: 1.5px solid currentColor;
				border-radius: 10px 14px 9px 12px;
				opacity: clamp(0, var(--step), 1);
				transform: translateY(calc((1 - clamp(0, var(--step), 1)) * 6px));
				transition: opacity 300ms ease, transform 300ms ease, background 300ms ease;
			}

			.who {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.45rem;
			}

			.avatar {
				display: inline-grid;
				place-items: center;
				width: 1.4rem;
				height: 1.4rem;
				border: 1.5px solid currentColor;
				border-radius: 50%;
				font-weight: 700;
				font-size: 0.8rem;
			}

			.sev {
				font-weight: 700;
			}

			.where {
				font-family: var(--font-mono);
				font-size: 0.85rem;
			}

			.resolved {
				margin-left: auto;
				font-weight: 700;
				color: oklch(48% 0.13 150);
				opacity: clamp(0, var(--step) - 1, 1);
			}

			.body,
			.fixes {
				transition: opacity 300ms ease;
			}

			.stage:not([data-step='1']) .fixes {
				display: none;
			}

			.stage:not([data-step='0']):not([data-step='1']) .body {
				opacity: 0.45;
				text-decoration: line-through;
			}

			.fixes {
				display: flex;
				gap: 0.5rem;
			}

			.act,
			.merge-button {
				font: 700 0.9rem/1 'Shantell Sans', system-ui, sans-serif;
				color: inherit;
				padding: 0.4rem 0.8rem;
				border: 1.5px solid currentColor;
				border-radius: 8px 11px 7px 10px;
				background: transparent;
				cursor: pointer;
			}

			.act:hover {
				background: color-mix(in oklch, var(--pink) 25%, transparent);
			}

			.mergebox {
				display: flex;
				align-items: center;
				gap: 0.6rem;
				padding-top: 0.6rem;
				border-top: 1.5px dashed color-mix(in oklch, currentColor 40%, transparent);
			}

			.merge-button {
				background: color-mix(in oklch, oklch(70% 0.14 150) calc(clamp(0, var(--step) - 2, 1) * 45%), transparent);
				transition: background 300ms ease;
			}

			.merge-button:hover {
				background: color-mix(in oklch, oklch(70% 0.14 150) 55%, transparent);
			}

			.lbl-queued,
			.lbl-merged {
				display: none;
			}

			.stage[data-step='4'] .lbl-when,
			.stage[data-step='5'] .lbl-when {
				display: none;
			}

			.stage[data-step='4'] .lbl-queued,
			.stage[data-step='5'] .lbl-merged {
				display: inline;
			}

			.arrow {
				font-size: 1.3rem;
				color: oklch(55% 0.19 25);
				opacity: 0;
			}

			.blocked-finding .finding,
			.blocked-checks .checks {
				outline: 2px solid oklch(55% 0.19 25);
				outline-offset: 4px;
				border-radius: 10px;
			}

			.blocked-finding .arrow,
			.blocked-checks .arrow {
				opacity: 1;
			}

			.shake-a .merge-button {
				animation: shake-a 360ms ease;
			}

			.shake-b .merge-button {
				animation: shake-b 360ms ease;
			}

			@keyframes shake-a {
				25%,
				75% {
					transform: translateX(-4px);
				}
				50% {
					transform: translateX(4px);
				}
			}

			@keyframes shake-b {
				25%,
				75% {
					transform: translateX(-4px);
				}
				50% {
					transform: translateX(4px);
				}
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

			.pip.done {
				background: color-mix(in oklch, var(--ink) 12%, transparent);
			}

			.pip.now {
				background: var(--pink);
				color: oklch(28% 0.015 90);
			}

			.pip:hover {
				background: color-mix(in oklch, var(--pink) 40%, transparent);
			}

			.caption {
				min-height: 2.8em;
				margin: 0.6rem auto 0;
				max-width: 34rem;
				text-align: center;
				font-size: 1rem;
			}

			@media (prefers-reduced-motion: reduce) {
				.pr-steps * {
					animation: none !important;
					transition: none !important;
				}
			}
		</style>
	</figure>
}
