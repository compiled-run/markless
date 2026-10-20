// The screen you wrote, Markless reading it, the plan it makes, and each device drawing that plan with its own word for the press.
import { computed, state } from '@markless/core';
import { ACTION, ADAPTER_NOTE, CODE_TAG, describe, flip, ORDER_FOR, PLAN_NOTE, SHOP, spoken, START, STATUS, toggle, WROTE } from './model.ts';
import { art } from './wired.art.ts';

export default function DevicesAnatomy() @{
	const said = describe();
	let order = state(START);
	let was = state('none');
	let beat = state('rest');
	const live = computed(() => spoken(order, beat !== 'rest'));

	<figure class="anatomy">
		<button
			type="button"
			class="stage"
			data-beat={beat}
			data-order={order}
			data-was={was}
			aria-label="Mark ready"
			onClick={() => {
				was = order;
				order = toggle(order);
				beat = flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					order = START;
					was = 'none';
					beat = 'rest';
				}
			}}
		>
		@for (const view of art.views; key view.key) {
			<svg class={'scene ' + view.key} viewBox={'0 0 ' + view.width + ' ' + view.height} style={'--f-finding:' + view.fonts.finding + 'px;--f-press:' + view.fonts.press + 'px;--f-name:' + view.fonts.name + 'px;--f-caption:' + view.fonts.caption + 'px'} aria-hidden="true">
				<path class="shadow-wash" d={view.shadow.wash} />
				<path class="hatch deep light" d={view.shadow.hatch} />
				<path class="hatch deep" d={view.shadow.core} />

				@for (const arrow of view.arrows; key arrow.key) {
					<path class={'arrow ' + arrow.status} d={arrow.d} />
				}

				<g class="card press-sink">
					<path class="paper" d={view.card.paper} />
					<path class="paper" d={view.card.face} />
					<path class="wash pink" d={view.card.pink} />
					<path class="wash yellow" d={view.card.yellow} />
					<path class="wash yellow pool" d={view.card.pool} />
					<path class="wash-edge" d={view.card.edge} />
					<g class="words" transform={view.card.matrix}>
						<text class="title" x="4" y="11.5" style="font-size:7.6px">{SHOP}</text>
						<text x="4" y="22" style="font-size:3.8px">{ORDER_FOR}</text>
						<text class="status now" data-s="brewing" x="4.5" y="32.4" style="font-size:5.4px">{STATUS.brewing[0]}</text>
						<text class="status now" data-s="ready" style="font-size:5px"><tspan x="4" y="29.8">{STATUS.ready[0]}</tspan><tspan x="4" y="35.6">{STATUS.ready[1]}</tspan></text>
						<text class="action" x="22" y="46.3" style="font-size:4.4px">{ACTION}</text>
						<text class="code" x="22.4" y="62.6" style="font-size:4.4px">{CODE_TAG}</text>
					</g>
					<path class="ink" d={view.card.ink} />
				</g>

				<g class="glass">
					<path class="hatch light" d={view.glass.shadow} />
					<path class="ink faint" d={view.glass.ringShadow} />
					<path class="lens" d={view.glass.lens} />
					<path class="paper" d={view.glass.band} />
					<path class="shell" d={view.glass.handle} />
					<path class="hatch" d={view.glass.tone} />
					<path class="ink" d={view.glass.ink} />
				</g>

				@for (const note of view.findings; key note.key) {
					<>
						<path class="ink" d={note.lead} />
						<text class={'finding ' + note.key} x={note.x} y={note.y}>{note.text}</text>
					</>
				}

				@for (const part of view.parts; key part.key) {
					<g class={'part ' + part.tier + ' ' + part.key}>
						<path class="shell" d={part.shell} />
						<path class="paper" d={part.paper} />
						<path class="hatch" d={part.tone} />
						<path class="hatch deep" d={part.deep} />
						<path class="paper" d={part.face} />
						<path class="hatch" d={part.fine} />
						<path class="sketch" d={part.pencil} />
						<path class="wash pink" d={part.pink} />
						<path class="wash yellow" d={part.yellow} />
						<path class="wash yellow pool" d={part.pool} />
						<path class="wash-edge" d={part.edge} />
						@for (const word of part.texts; key word.key) {
							<text class={'printed ' + word.kind} transform={word.m} style={'font-size:' + word.size + 'px'}>{word.text}</text>
						}
						<path class="ink" d={part.ink} />
						@for (const screen of part.screens; key screen.key) {
							@if (part.key === 'plan') {
								<g class="printed state" transform={screen.m}>
									<text class="now" data-s="brewing" y="22" style="font-size:4.2px">{STATUS.brewing[0]}</text>
									<text class="now" data-s="ready" style="font-size:3.6px"><tspan x="0" y="19">{STATUS.ready[0]}</tspan><tspan x="0" y="24.2">{STATUS.ready[1]}</tspan></text>
								</g>
							} @else {
								<g class="printed state" transform={screen.m}>
									<g class="crossed old" data-s="brewing">
										<text x="42" y="7.6" style="font-size:7px">{STATUS.brewing[0]}</text>
										<path class="strike" d="M24 6.2L60 4.6" />
									</g>
									<g class="crossed old" data-s="ready">
										<text style="font-size:7.2px"><tspan x="42" y="7">{STATUS.ready[0]}</tspan><tspan x="42" y="13.6">{STATUS.ready[1]}</tspan></text>
										<path class="strike" d="M25 5.8L59 4.6M29 12.4L55 11.4" />
									</g>
									<text class="now" data-s="brewing" x="42" y="22.6" style="font-size:8.6px">{STATUS.brewing[0]}</text>
									<text class="now" data-s="ready" style="font-size:8.2px"><tspan x="41" y="16.6">{STATUS.ready[0]}</tspan><tspan x="41" y="24.6">{STATUS.ready[1]}</tspan></text>
									<path class="tick" d="M58 21L60.6 23.8L65.4 17" />
								</g>
							}
						}
					</g>
				}
				<g class="tag-swing" style={'transform-origin:' + view.planTag.origin[0] + 'px ' + view.planTag.origin[1] + 'px'}>
					<path class="paper" d={view.planTag.paper} />
					<path class="hatch" d={view.planTag.tone} />
					<path class="ink" d={view.planTag.ink} />
					@for (const word of view.planTag.texts; key word.key) {
						<text class={'printed ' + word.kind} transform={word.m} style={'font-size:' + word.size + 'px'}>{word.text}</text>
					}
				</g>
				<path class="pulse plan-pulse" d={view.planWire.d} style={'--l:' + view.planWire.length} />
				@for (const arrow of view.arrows; key arrow.key) {
					<path class={'pulse arrow-pulse ' + arrow.status} d={arrow.path} style={'--l:' + arrow.length} />
				}
				<text class="caption" x={view.planNote.x} y={view.planNote.y}>{PLAN_NOTE}</text>

				@for (const arrow of view.arrows; key arrow.key) {
					@if (arrow.stack) {
						<>
							<text class={'press ' + arrow.status} x={arrow.x} y={arrow.top}><tspan class="wrote">{WROTE}</tspan></text>
							<text class={'press ' + arrow.status} x={arrow.x} y={arrow.y}><tspan class="said">{'→ ' + arrow.word}</tspan></text>
						</>
					} @else {
						<text class={'press ' + arrow.status} x={arrow.x} y={arrow.y}><tspan class="wrote">{WROTE + ' '}</tspan><tspan class="said">{'→ ' + arrow.word}</tspan></text>
					}
				}
				@for (const label of view.labels; key label.key) {
					<text class="name" x={label.x} y={label.y}>{label.name}</text>
				}
				<text class="caption side" x={view.adapter.x} y={view.adapter.y}>{ADAPTER_NOTE}</text>
			</svg>
		}
		</button>
		<figcaption class="sr">{said}</figcaption>
		<p class="sr" aria-live="polite">{live}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				border-radius: 12px;
			}

			.stage {
				display: block;
				width: 100%;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				cursor: pointer;
				border-radius: 12px;
			}

			.stage:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--shell: color-mix(in oklch, var(--paper) 72%, oklch(80% 0.012 75));
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--shade-ink: var(--ink);
				--sheet-ink: var(--ink);
				--pencil: color-mix(in srgb, var(--pink) 70%, #e0603c);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--shell: oklch(34% 0.012 75);
					--shade: rgb(0 0 0 / 0.5);
					--shade-ink: rgb(0 0 0 / 0.85);
					--sheet-ink: var(--paper);
				}
			}

			.scene.tall {
				display: none;
			}

			@media (max-width: 560px) {
				.scene.wide {
					display: none;
				}

				.scene.tall {
					display: block;
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.shell {
				fill: var(--shell);
			}

			.lens {
				fill: white;
				opacity: 0.12;
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.4;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.light {
				opacity: 0.5;
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.wash {
				stroke-width: 1;
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.75;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.wash-edge {
				fill: none;
				stroke: oklch(72% 0.15 75);
				stroke-width: 0.8;
				opacity: 0.5;
				mix-blend-mode: multiply;
			}

			.words text,
			.printed {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
				font-weight: 600;
			}

			.words .title,
			.status,
			.state .now {
				font-weight: 800;
			}

			.action,
			.state {
				text-anchor: middle;
			}

			.action {
				font-weight: 700;
			}

			.tag {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 400;
			}

			.words .code {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 400;
				text-anchor: middle;
			}

			.sketched {
				fill: var(--pencil);
				font-weight: 400;
				opacity: 0.8;
			}

			.arrow.native {
				fill: var(--ink);
			}

			.arrow.wanted,
			.sketch,
			.pencil {
				fill: none;
				stroke: var(--pencil);
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.pencil {
				stroke-width: 0.7;
				opacity: 0.4;

				html.dark & {
					opacity: 0.28;
				}
			}

			.arrow.wanted,
			.sketch {
				stroke-width: 0.8;
				opacity: 0.85;

				html.dark & {
					opacity: 0.65;
				}
			}

			.finding,
			.press,
			.name,
			.caption {
				text-anchor: middle;
			}

			.finding {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--f-finding);
				font-weight: 600;
				fill: var(--ink);
			}

			.press {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--f-press);
				fill: var(--ink);
			}

			.name {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--f-name);
				letter-spacing: 0.14em;
				fill: var(--ink);
				opacity: 0.8;
			}

			.press.wanted,
			.caption {
				fill: var(--pencil);
			}

			.press .wrote {
				fill: var(--ink);
			}

			.press .said {
				stroke: var(--ink);
				stroke-width: 0.75px;
			}

			.press.wanted .said {
				stroke: var(--pencil);
			}

			.caption {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--f-caption);
				font-style: italic;
			}

			.old text {
				font-weight: 600;
				opacity: 0.6;
			}

			.strike,
			.tick {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-dasharray: 60;
			}

			.tick {
				stroke-width: 1.1;
			}

			.now,
			.old,
			.tick {
				display: none;
			}

			.stage[data-order='brewing'] .now[data-s='brewing'],
			.stage[data-order='ready'] .now[data-s='ready'],
			.stage[data-order='ready'] .tick,
			.stage[data-was='brewing'] .old[data-s='brewing'],
			.stage[data-was='ready'] .old[data-s='ready'] {
				display: inline;
			}

			.pulse {
				fill: none;
				stroke: var(--ink);
				stroke-width: 3.2;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			.pulse.wanted {
				stroke: var(--pencil);
				stroke-width: 2.4;
			}

			.stage[data-beat='odd'] .scene {
				--sink: sink-a;
				--flash: flash-a;
				--run: run-a;
				--word: word-a;
				--strike: strike-a;
				--swing: swing-a;
				--ink-in: ink-in-a;
			}

			.stage[data-beat='even'] .scene {
				--sink: sink-b;
				--flash: flash-b;
				--run: run-b;
				--word: word-b;
				--strike: strike-b;
				--swing: swing-b;
				--ink-in: ink-in-b;
			}

			.press-sink {
				animation: var(--sink) 320ms ease-out;
			}

			.finding-2 {
				animation: var(--flash) 700ms 80ms ease-out;
			}

			.tag-swing {
				transform-box: view-box;
				animation: var(--swing) 900ms 200ms ease-out;
			}

			.plan-pulse {
				animation: var(--run) 520ms 700ms ease-in-out both;
			}

			.arrow-pulse {
				animation: var(--run) 820ms 1200ms ease-in-out both;
			}

			.press.native .said {
				animation: var(--word) 600ms 1500ms ease-out;
			}

			.crossed .strike,
			.tick {
				animation: var(--strike) 240ms 2050ms ease-out both;
			}

			.crossed {
				animation: var(--ink-in) 300ms 2000ms ease-out both;
			}

			.now {
				stroke: var(--sheet-ink);
				stroke-width: 0.3;
				stroke-dasharray: 40;
				animation: var(--ink-in) 520ms 2250ms ease-out both;
			}

			.words .now {
				animation-delay: 150ms;
			}

			@keyframes sink-a { 35% { transform: translateY(1.5px); } }
			@keyframes sink-b { 35% { transform: translateY(1.5px); } }
			@keyframes flash-a { 20% { fill: var(--pink); } }
			@keyframes flash-b { 20% { fill: var(--pink); } }
			@keyframes swing-a { 25% { transform: rotate(9deg); } 55% { transform: rotate(-5deg); } 80% { transform: rotate(2deg); } }
			@keyframes swing-b { 25% { transform: rotate(9deg); } 55% { transform: rotate(-5deg); } 80% { transform: rotate(2deg); } }
			@keyframes run-a { from { opacity: 1; stroke-dashoffset: 0; } 92% { opacity: 1; } to { opacity: 0; stroke-dashoffset: calc(var(--l) * -1); } }
			@keyframes run-b { from { opacity: 1; stroke-dashoffset: 0; } 92% { opacity: 1; } to { opacity: 0; stroke-dashoffset: calc(var(--l) * -1); } }
			@keyframes word-a { 40% { font-weight: 700; fill: var(--pink); } }
			@keyframes word-b { 40% { font-weight: 700; fill: var(--pink); } }
			@keyframes strike-a { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
			@keyframes strike-b { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
			@keyframes ink-in-a { from { opacity: 0; stroke-dashoffset: 40; } }
			@keyframes ink-in-b { from { opacity: 0; stroke-dashoffset: 40; } }

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
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
