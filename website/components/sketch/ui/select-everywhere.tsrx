// "Is it the same select everywhere?" Three copies of one real select, framed
// as the three places a family can render. The tags are CSS reading the live
// ui-* attributes, so each copy shows exactly what it carries.
import { state } from '@markless/core';
import { select } from '@markless/ui';
import MugArt from '../../mascot/mug-art.tsrx';
import SketchAsk from '../start/sketch-ask.tsrx';

export default function SelectEverywhere() @{
	let alone = state(false);
	let served = state(false);
	let tested = state(false);
	let say = state('open any copy');

	<figure class="sketch">
		<SketchAsk text="Is it the same select everywhere?" />

		<div class="board">
			<div class="frame" data-tried={alone ? 'true' : 'false'}>
				<p class="chrome tab-bar" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>browser alone<span class="check">✓</span></p>
				<div class="stage">
					<select.root
						class="picker"
						value="ink"
						onOpenChange={(open: boolean) => {
							if (!open) return;
							alone = true;
							say = served && tested ? 'same parts, same tags, all three' : 'same tags. Try another copy';
						}}
					>
						<select.label class="label">Theme, browser alone</select.label>
						<select.trigger class="trigger">Theme</select.trigger>
						<select.content class="list">
							<select.item class="option" value="paper"><select.itemlabel>Paper</select.itemlabel></select.item>
							<select.item class="option" value="ink"><select.itemlabel>Ink</select.itemlabel></select.item>
						</select.content>
					</select.root>
				</div>
			</div>

			<div class="frame" data-tried={served ? 'true' : 'false'}>
				<p class="chrome server-bar" aria-hidden="true"><svg class="rack" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="18" height="7" rx="1.5" /><circle cx="7" cy="6.5" r="1" /><circle cx="7" cy="17.5" r="1" /></svg>from a server<span class="check">✓</span></p>
				<div class="stage">
					<select.root
						class="picker"
						value="ink"
						onOpenChange={(open: boolean) => {
							if (!open) return;
							served = true;
							say = alone && tested ? 'same parts, same tags, all three' : 'same tags. Try another copy';
						}}
					>
						<select.label class="label">Theme, from a server</select.label>
						<select.trigger class="trigger">Theme</select.trigger>
						<select.content class="list">
							<select.item class="option" value="paper"><select.itemlabel>Paper</select.itemlabel></select.item>
							<select.item class="option" value="ink"><select.itemlabel>Ink</select.itemlabel></select.item>
						</select.content>
					</select.root>
				</div>
			</div>

			<div class="frame" data-tried={tested ? 'true' : 'false'}>
				<p class="chrome test-bar" aria-hidden="true"><span class="tick">✓</span>in a test<span class="check">✓</span></p>
				<div class="stage">
					<select.root
						class="picker"
						value="ink"
						onOpenChange={(open: boolean) => {
							if (!open) return;
							tested = true;
							say = alone && served ? 'same parts, same tags, all three' : 'same tags. Try another copy';
						}}
					>
						<select.label class="label">Theme, in a test</select.label>
						<select.trigger class="trigger">Theme</select.trigger>
						<select.content class="list">
							<select.item class="option" value="paper"><select.itemlabel>Paper</select.itemlabel></select.item>
							<select.item class="option" value="ink"><select.itemlabel>Ink</select.itemlabel></select.item>
						</select.content>
					</select.root>
				</div>
			</div>
		</div>

		<div class="footer">
			<p class="note" aria-live="polite">{say}</p>
			<span class="mug-spot">
				<MugArt
					variant="toc"
					mood={alone && served && tested ? 'wiggle' : alone || served || tested ? 'wide' : 'idle'}
					face="neutral"
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={alone || served || tested ? 'true' : 'false'}
					reaction="rest"
				/>
			</span>
		</div>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 1rem;
				align-items: start;
			}

			.frame {
				border: 2px solid var(--ink);
				border-radius: 6px 9px 7px 5px;
				background: var(--raised);
				box-shadow: -3px 5px 0 color-mix(in oklch, var(--ink) 18%, transparent);
			}

			.frame:nth-child(1) {
				rotate: -1deg;
			}

			.frame:nth-child(2) {
				rotate: 0.6deg;
			}

			.frame:nth-child(3) {
				rotate: -0.4deg;
			}

			.chrome {
				display: flex;
				align-items: center;
				gap: 0.45rem;
				margin: 0;
				padding: 0.35rem 0.6rem;
				border-bottom: 2px solid var(--ink);
				border-radius: 4px 7px 0 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
			}

			.tab-bar {
				background: color-mix(in oklch, var(--pink) 30%, var(--raised));
			}

			.server-bar {
				background: color-mix(in oklch, var(--purple) 30%, var(--raised));
			}

			.test-bar {
				background: color-mix(in oklch, var(--green-star) 30%, var(--raised));
			}

			.dots {
				display: inline-flex;
				gap: 0.2rem;
			}

			.dots i {
				width: 0.5rem;
				height: 0.5rem;
				border: 1.5px solid var(--ink);
				border-radius: 50%;
				background: var(--paper);
			}

			.rack {
				width: 1rem;
				height: 1rem;
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.8;
			}

			.tick {
				display: inline-grid;
				place-items: center;
				width: 1rem;
				height: 1rem;
				border-radius: 50%;
				background: var(--green-star);
				color: var(--on-accent);
				font-size: 0.7rem;
				font-weight: 700;
			}

			.check {
				margin-left: auto;
				font-size: var(--step-0);
				color: oklch(55% 0.2 0);
				visibility: hidden;

				html.dark & {
					color: var(--pink);
				}
			}

			.frame[data-tried='true'] .check {
				visibility: visible;
			}

			.stage {
				padding: 1.4rem 0.8rem 0.9rem;
			}

			.picker {
				position: relative;
				display: grid;
				gap: 0.9rem;
			}

			.label {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}

			.trigger {
				position: relative;
				padding: 0.4em 0.8em;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				text-align: start;
				cursor: pointer;
			}

			.trigger::after {
				content: '▾' / '';
				float: right;
			}

			.trigger:focus-visible,
			.option:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 2px;
			}

			.trigger[ui-open]::before {
				content: 'ui-open' / '';
				position: absolute;
				top: -0.9rem;
				right: 0.4rem;
			}

			.trigger[ui-open] {
				background: color-mix(in oklch, var(--yellow) 55%, var(--paper));
				color: var(--on-accent);
			}

			.list:not([hidden]) {
				display: grid;
				border: 2px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
			}

			.option {
				position: relative;
				padding: 0.4em 0.8em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				cursor: pointer;
			}

			.option + .option {
				border-top: 1.5px dashed color-mix(in oklch, var(--ink) 35%, transparent);
			}

			.trigger[ui-open]::before,
			.option[ui-selected]::after,
			.list[ui-open]::before {
				padding: 0.05rem 0.35rem;
				border: 1.5px solid var(--ink);
				border-radius: 3px;
				background: var(--yellow);
				color: var(--on-accent);
				font-family: var(--font-mono);
				font-size: 0.66rem;
				line-height: 1.3;
				rotate: 4deg;
				box-shadow: 1px 2px 0 var(--ink);
				animation: tag-in 260ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
				z-index: 1;
			}

			.option[ui-selected] {
				font-weight: 700;
			}

			.option[ui-selected]::after {
				content: 'ui-selected' / '';
				position: absolute;
				top: 50%;
				right: 0.4rem;
				translate: 0 -50%;
				background: var(--green-star);
			}

			.list[ui-open] {
				position: relative;
			}

			.list[ui-open]::before {
				content: 'ui-open' / '';
				position: absolute;
				top: -0.85rem;
				right: 0.4rem;
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

			.footer {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 1rem;
				margin-top: 0.8rem;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				line-height: 1.15;
				color: var(--ink);
				rotate: -1.2deg;
			}

			.mug-spot {
				zoom: 0.4;
				--gaze-x: -6px;
				--gaze-y: -4px;
			}

			@media (prefers-reduced-motion: reduce) {
				.trigger[ui-open]::before,
				.option[ui-selected]::after,
				.list[ui-open]::before {
					animation: none;
				}
			}

			@container (max-width: 36rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					gap: 1.2rem;
				}

				.note {
					font-size: var(--step-0);
				}
			}
		</style>
	</figure>
}
