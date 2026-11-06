// Specs and rules in four steps: open a real spec, staple a code change to its spec change, watch pnpm rules write the agent files from .ruler/, then try writing on a generated file and see the check go red.
import { computed, state } from '@markless/core';
import InkButton from '../ink/ink-button.tsrx';
import InkScreen from '../ink/ink-screen.tsrx';
import { COMMAND, OPENED, OUTPUTS, RAIL, SAME_PR, SOURCE, SPECS, STAMP, STEPS } from './explorer.ts';

const LAST = STEPS.length - 1;

export default function ExplorerFigure() @{
	let step = state(0);
	let opened = state(false);
	let hand = state(false);
	let synced = state(false);
	let downX = state(-1);
	const caption = computed(() => STEPS[step]!);
	const nextLabel = computed(() => (step === LAST ? 'Start over' : 'Next'));
	const check = computed(() => (hand ? 'red' : synced ? 'green' : 'idle'));
	const go = (to: number) => {
		step = Math.max(0, Math.min(LAST, to));
		hand = false;
		synced = false;
	};
	const next = () => {
		if (step === LAST) {
			opened = false;
			go(0);
		} else go(step + 1);
	};
	const write = () => {
		if (step !== LAST) go(LAST);
		hand = true;
		synced = false;
	};
	const rules = () => {
		hand = false;
		synced = true;
	};

	<figure
		class="specs-steps"
		tabindex={0}
		aria-label="Specs and rules, step by step. Next or the right arrow moves on, the left arrow goes back, Home or Escape starts over."
		onKeyDown={(event) => {
			if ((event.target as Element).tagName === 'INPUT') return;
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				go(step + 1);
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				go(step - 1);
			} else if (event.key === 'Home' || event.key === 'Escape') {
				opened = false;
				go(0);
			} else if (event.key === 'End') go(LAST);
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
		<div class="stage" data-step={step} data-open={opened ? 'yes' : 'no'} data-check={check}>
			<div class="pane specs">
				<InkScreen url="specs/" label="The specs folder">
					<div class="drawer">
						<ul class="files">
							<li><span class="file">{SPECS[0]}</span></li>
							<li>
								<button type="button" class="file open-spec" onClick={() => (opened = true)}>
									{SPECS[1]}
								</button>
							</li>
							<li><span class="file">{SPECS[2]}</span></li>
							<li><span class="file">{SPECS[3]}</span></li>
						</ul>
						<div class="page">
							<p class="h">{OPENED.title}</p>
							<p class="dim">{OPENED.line}</p>
						</div>
					</div>
				</InkScreen>
			</div>
			<div class="pane pr">
				<InkScreen url="pull request #490" label="One pull request">
					<div class="stapled">
						<p class="slip">{SAME_PR.code}</p>
						<span class="staple" aria-hidden="true"></span>
						<p class="slip">{SAME_PR.spec}</p>
					</div>
				</InkScreen>
			</div>
			<div class="pane rules">
				<InkScreen url="markless/" label="Agent rule files">
					<div class="flow">
						<p class="src">
							{SOURCE}
							<button type="button" class="edit-src" onClick={() => rules()}>
								✎ edit, then {COMMAND}
							</button>
						</p>
						<p class="cmd">↓ {COMMAND}</p>
						<div class="outs">
							<div class="out">
								<p class="name">{OUTPUTS[0]}</p>
								<p class="stamp">{STAMP}</p>
								<p class="scrawl">+ my own rule</p>
								<button type="button" class="write" aria-label={'Write on ' + OUTPUTS[0]} onClick={() => write()}>✎</button>
							</div>
							<div class="out">
								<p class="name">{OUTPUTS[1]}</p>
								<p class="stamp">{STAMP}</p>
							</div>
						</div>
						<p class="check">
							<span class="mark" aria-hidden="true"></span>
							agent-files
						</p>
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
			.specs-steps {
				margin: var(--space-m) 0;
				border-radius: 12px;
				touch-action: pan-y;
			}

			.specs-steps:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.pane {
				display: none;
			}

			.stage[data-step='0'] .specs,
			.stage[data-step='1'] .pr,
			.stage[data-step='2'] .rules,
			.stage[data-step='3'] .rules {
				display: block;
				animation: arrive 260ms ease both;
			}

			@keyframes arrive {
				from {
					opacity: 0;
					transform: translateY(4px);
				}
			}

			.drawer,
			.stapled,
			.flow {
				padding: 0.8rem 1rem 1rem;
				min-height: 11rem;
				font-family: var(--font-mono);
				font-size: 0.9rem;
				line-height: 1.5;
				font-weight: 500;
			}

			.drawer {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
				gap: 1rem;
			}

			.files {
				margin: 0;
				padding: 0;
				list-style: none;
				display: grid;
				gap: 0.3rem;
			}

			.file {
				font: inherit;
				color: inherit;
			}

			.open-spec {
				all: unset;
				cursor: pointer;
				background: color-mix(in oklch, var(--yellow) 45%, transparent);
				border-radius: 4px;
				padding: 0 0.2rem;
			}

			.open-spec:hover,
			.open-spec:focus-visible {
				outline: 1.5px solid currentColor;
			}

			.page {
				padding: 0.6rem 0.8rem;
				border: 1.5px solid currentColor;
				border-radius: 6px 9px 7px 8px;
				opacity: 0;
				transform: translateX(-6px);
				transition: opacity 260ms ease, transform 260ms ease;
			}

			.stage[data-open='yes'] .page {
				opacity: 1;
				transform: none;
			}

			.page p,
			.flow p,
			.stapled p,
			.files li {
				margin: 0;
				font-family: var(--font-mono);
				font-size: 0.9rem;
			}

			.h {
				font-weight: 800;
			}

			.dim {
				opacity: 0.6;
			}

			.stapled {
				display: grid;
				justify-items: start;
				align-content: center;
				gap: 0;
			}

			.slip {
				padding: 0.5rem 0.8rem;
				border: 1.5px solid currentColor;
				border-radius: 4px 7px 5px 6px;
				background: var(--screen-paper);
			}

			.slip:last-of-type {
				transform: rotate(-1.2deg) translateX(0.6rem);
			}

			.staple {
				width: 2.2rem;
				height: 1.1rem;
				margin: -0.45rem 0 -0.45rem 1.4rem;
				border: 2.5px solid currentColor;
				border-bottom: 0;
				border-radius: 3px 3px 0 0;
				position: relative;
				z-index: 1;
			}

			.flow {
				display: grid;
				justify-items: start;
				align-content: start;
				gap: 0.5rem;
			}

			.src {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.6rem;
				font-weight: 800;
			}

			.edit-src,
			.write {
				font: 700 0.85rem/1 'Shantell Sans', system-ui, sans-serif;
				color: inherit;
				padding: 0.35rem 0.6rem;
				border: 1.5px solid currentColor;
				border-radius: 8px 11px 7px 10px;
				background: transparent;
				cursor: pointer;
				display: none;
			}

			.stage[data-step='3'] .edit-src,
			.stage[data-step='3'] .write {
				display: inline-block;
			}

			.edit-src:hover,
			.write:hover {
				background: color-mix(in oklch, var(--pink) 30%, transparent);
			}

			.cmd {
				padding-left: 1rem;
				font-weight: 700;
			}

			.outs {
				display: flex;
				flex-wrap: wrap;
				gap: 0.8rem;
			}

			.out {
				position: relative;
				min-width: 12rem;
				padding: 0.5rem 0.7rem;
				border: 1.5px solid currentColor;
				border-radius: 6px 9px 7px 8px;
			}

			.name {
				font-weight: 800;
			}

			.stamp {
				display: inline-block;
				margin-top: 0.3rem;
				padding: 0.1rem 0.35rem;
				border: 1.5px solid currentColor;
				border-radius: 3px;
				font-size: 0.75rem;
				opacity: 0.75;
				transform: rotate(-2deg);
			}

			.scrawl {
				font-family: 'Joy Elia', system-ui, sans-serif;
				color: oklch(55% 0.19 25);
				opacity: 0;
				filter: blur(0.6px);
				transition: opacity 300ms ease;
			}

			.stage[data-check='red'] .scrawl {
				opacity: 0.55;
			}

			.write {
				position: absolute;
				top: 0.35rem;
				right: 0.35rem;
			}

			.check {
				display: none;
				align-items: center;
				gap: 0.45rem;
				font-weight: 700;
			}

			.stage[data-step='3'] .check {
				display: flex;
			}

			.mark {
				width: 1rem;
				height: 1rem;
				border: 2px solid currentColor;
				border-radius: 50%;
				opacity: 0.4;
			}

			.stage[data-check='red'] .mark {
				border-color: oklch(55% 0.19 25);
				background: color-mix(in oklch, oklch(55% 0.19 25) 45%, transparent);
				opacity: 1;
			}

			.stage[data-check='green'] .mark {
				border-color: oklch(52% 0.13 150);
				background: color-mix(in oklch, oklch(52% 0.13 150) 45%, transparent);
				opacity: 1;
			}

			.stage[data-check='red'] .check {
				color: oklch(55% 0.19 25);
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
			}

			.caption {
				min-height: 2.8em;
				margin: 0.6rem auto 0;
				max-width: 34rem;
				text-align: center;
				font-size: 1rem;
			}

			@media (max-width: 600px) {
				.drawer {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.specs-steps * {
					animation: none !important;
					transition: none !important;
				}
			}
		</style>
	</figure>
}
