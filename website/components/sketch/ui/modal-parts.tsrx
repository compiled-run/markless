// "Which parts say the dialog is open?" A real modal drawn as nested, labelled
// boxes. Every label and ui-open tag comes from CSS reading the live attributes.
import { state } from '@markless/core';
import { modal } from '@markless/ui';
import MugArt from '../../mascot/mug-art.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import SketchAsk from '../start/sketch-ask.tsrx';

export default function ModalParts() @{
	let open = state(false);
	let say = state('Closed. Press the trigger.');

	<figure class="sketch">
		<SketchAsk text="Which parts say the dialog is open?" />

		<div class="board" data-open={open ? 'true' : 'false'}>
			<div class="parts">
				<modal.root
					class="box root"
					onChange={(next: boolean) => {
						open = next;
						say = next ? 'Open. root, trigger, backdrop and content have ui-open. title and close do not.' : 'Closed again. The ui-open tags are gone.';
					}}
				>
					<modal.trigger class="box trigger">Edit address</modal.trigger>
					<modal.backdrop class="box backdrop">
						<modal.content class="box content">
							<modal.title class="box title">Edit address</modal.title>
							<modal.close class="box close">Cancel</modal.close>
						</modal.content>
					</modal.backdrop>
				</modal.root>
			</div>

			<div class="aside">
				<div class="arrow">
					<InkArrow width={80} height={50} x1={76} y1={36} x2={6} y2={14} bend={8} seed={41} shown="true" />
				</div>
				<p class="note closed-note">press the trigger</p>
				<p class="note open-note">one switch, four <b>ui-open</b></p>
				<p class="note none-note">title and close: none</p>
				<span class="mug-spot">
					<MugArt
						variant="toc"
						mood={open ? 'wide' : 'idle'}
						face="neutral"
						glaze="cream"
						pour="rosetta"
						coaster="off"
						companion="off"
						paused="false"
						interacted={open ? 'true' : 'false'}
						reaction="rest"
					/>
				</span>
			</div>
			<p class="say" aria-live="polite">{say}</p>
		</div>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
				gap: 1.5rem;
				align-items: start;
			}

			.box {
				position: relative;
				box-sizing: border-box;
				margin: 0;
				border: 2px solid var(--ink);
				border-radius: 5px 9px 6px 8px;
				background: var(--raised);
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				transition: background-color 200ms ease;
			}

			.box::before {
				position: absolute;
				top: -0.75rem;
				left: 0.6rem;
				padding: 0 0.35rem;
				background: var(--paper);
				font-family: var(--font-mono);
				font-size: 0.7rem;
				line-height: 1.3;
				color: var(--ink);
				white-space: nowrap;
			}

			.root {
				display: grid;
				gap: 1.3rem;
				padding: 1.4rem 1rem 1rem;
			}

			.root::before {
				content: 'modal.root' / '';
			}

			.trigger {
				justify-self: start;
				padding: 0.5rem 0.9rem 0.4rem;
				font-size: var(--step-0);
				cursor: pointer;
				box-shadow: 2px 3px 0 var(--ink);
			}

			.trigger::before {
				content: 'modal.trigger' / '';
			}

			.trigger:focus-visible,
			.close:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.backdrop {
				display: block;
				padding: 1.3rem 0.8rem 0.8rem;
				border-style: dashed;
				background: color-mix(in oklch, var(--ink) 6%, transparent);
			}

			.backdrop[hidden] {
				display: block;
			}

			.backdrop[hidden] > .content {
				visibility: hidden;
			}

			.backdrop::before {
				content: 'modal.backdrop' / '';
			}

			.backdrop[hidden]::after {
				content: 'hidden until open' / '';
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				font-size: var(--step-0);
				color: color-mix(in oklch, var(--ink) 55%, transparent);
				rotate: -2deg;
			}

			.content {
				display: grid;
				gap: 1.1rem;
				justify-items: start;
				padding: 1.3rem 0.8rem 0.8rem;
			}

			.content::before {
				content: 'modal.content' / '';
			}

			.content:focus {
				outline: none;
			}

			.title {
				padding: 0.45rem 0.7rem 0.35rem;
				font-size: var(--step-0);
				font-weight: 700;
				text-shadow: none;
			}

			.title::before {
				content: 'modal.title' / '';
			}

			.close {
				padding: 0.4rem 0.8rem 0.3rem;
				font-size: var(--step--1);
				cursor: pointer;
			}

			.close::before {
				content: 'modal.close' / '';
			}

			.title,
			.close {
				border-color: color-mix(in oklch, var(--ink) 55%, transparent);
			}

			.box[ui-open] {
				background: color-mix(in oklch, var(--yellow) 45%, var(--raised));
			}

			.backdrop[ui-open] {
				background: color-mix(in oklch, var(--yellow) 22%, transparent);
			}

			.box[ui-open]::after {
				content: 'ui-open' / '';
				position: absolute;
				top: -0.8rem;
				right: 0.5rem;
				padding: 0.05rem 0.4rem;
				border: 1.5px solid var(--ink);
				border-radius: 3px;
				background: var(--yellow);
				color: var(--on-accent);
				font-family: var(--font-mono);
				font-size: 0.68rem;
				line-height: 1.3;
				rotate: 4deg;
				box-shadow: 1px 2px 0 var(--ink);
				animation: tag-in 260ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
			}

			.trigger[ui-open]::after {
				right: -3.4rem;
				top: -0.6rem;
			}

			@keyframes tag-in {
				from {
					scale: 0.3;
					opacity: 0;
				}
				to {
					scale: 1;
					opacity: 1;
				}
			}

			.aside {
				position: relative;
				display: grid;
				justify-items: start;
				gap: 0.5rem;
				padding-top: 1.6rem;
			}

			.arrow {
				width: 5rem;
				height: 3.1rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				line-height: 1.15;
				color: var(--ink);
				rotate: -1.5deg;
			}

			.note b {
				font-family: var(--font-mono);
				font-size: 0.8em;
				padding: 0 0.2em;
				background: var(--yellow);
				color: var(--on-accent);
			}

			.none-note {
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
				rotate: 1deg;

				html.dark & {
					color: var(--pink);
				}
			}

			.board[data-open='false'] .open-note,
			.board[data-open='false'] .none-note,
			.board[data-open='true'] .closed-note,
			.board[data-open='true'] .arrow {
				display: none;
			}

			.mug-spot {
				justify-self: end;
				zoom: 0.45;
				--gaze-x: -7px;
				--gaze-y: 2px;
			}

			.say {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}

				.box[ui-open]::after {
					animation: none;
				}
			}

			@container (max-width: 36rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}

				.aside {
					grid-template-columns: minmax(0, 1fr) auto;
					align-items: center;
					padding-top: 0;
				}

				.arrow {
					display: none;
				}

				.note {
					grid-column: 1;
				}

				.mug-spot {
					grid-column: 2;
					grid-row: 1 / span 3;
				}
			}
		</style>
	</figure>
}
