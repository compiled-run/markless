// A terminal session of npm create markless: bare, it asks and waits; press the flags and the same session runs with no questions; tear off the -- and npm keeps the flags.
import { computed, state } from '@markless/core';
import { art } from './session.art.ts';

export default function SessionFigure() @{
	let mode = state(0);
	let dash = state(true);
	let beat = state('rest');
	let touched = state(false);
	let said = state('');
	let hovered = state(-1);
	const hint = computed(() => (hovered >= 0 ? art.chips[hovered]!.flag + ': ' + art.chips[hovered]!.answers : 'Hover a flag to see the question it answers.'));
	const dials = computed(() => '--mode:' + mode + ';--dash:' + (dash ? 1 : 0));
	const play = (next: number) => {
		mode = next;
		beat = beat === 'a' ? 'b' : 'a';
		said =
			next === 0
				? 'The CLI asks: What are you building today? It waits for an answer.'
				: next === 1
					? 'With the flags after --, it asks nothing: Created my-app. Markless app ready.'
					: 'Without --, npm keeps the flags for itself, and the CLI still asks its questions.';
	};
	const attach = () => play(dash ? 1 : 2);

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="A terminal running npm create markless, and a strip of flags. Enter adds the flags, D tears the -- off or puts it back, Backspace runs the command bare, Escape resets."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const idle = setTimeout(() => {
				if (!touched) attach();
			}, 1400);
			return () => clearTimeout(idle);
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				attach();
			} else if (event.key === 'd' || event.key === 'D') {
				dash = !dash;
				said = dash ? 'The -- is back.' : 'The -- is torn off.';
			} else if (event.key === 'Backspace') play(0);
			else if (event.key === 'Escape') {
				dash = true;
				play(0);
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
				const chip = target.closest('[data-chip]');
				if (chip) {
					if (chip.getAttribute('data-chip') === '0') {
						dash = !dash;
						said = dash ? 'The -- is back.' : 'The -- is torn off.';
						return;
					}
					return attach();
				}
				if (target.closest('.run')) play(0);
			}}
			onPointerOver={(event) => {
				const chip = (event.target as Element).closest('[data-chip]');
				hovered = chip ? Number(chip.getAttribute('data-chip')) : -1;
			}}
			onPointerLeave={() => {
				hovered = -1;
			}}
		>
			<g>
				<g>
					@for (const item of art.base.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.base.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<path class="hit run" d={art.run} />
			<g class="cmd-ok fade overlay">
				@for (const text of art.cmdOk.texts; key text.key) {
					<text class={text.cls} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g class="cmd-gone fade overlay">
				<g>
					@for (const item of art.cmdSwallowed.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
				<g>
					@for (const text of art.cmdSwallowed.texts; key text.key) {
						<text class={text.cls} transform={text.matrix}>{text.text}</text>
					}
				</g>
			</g>
			<g class="asking out overlay">
				<g>
					@for (const text of art.asking.texts; key text.key) {
						<text class={text.cls + ' line'} style={'--l:' + text.key} transform={text.matrix}>{text.text}</text>
					}
				</g>
				<g class="caret-wrap">
					@for (const item of art.caret.paths; key item.key) {
						<path class={item.cls} d={item.d} />
					}
				</g>
			</g>
			<g class="done out overlay">
				@for (const text of art.done.texts; key text.key) {
					<text class={text.cls + ' line'} style={'--l:' + text.key} transform={text.matrix}>{text.text}</text>
				}
			</g>
			<g>
				@for (const chip of art.chips; key chip.key) {
					<g class="chip" data-chip={chip.key} style={'--c:' + chip.key}>
						<g class="lift">
							<g>
								@for (const item of chip.ink.paths; key item.key) {
									<path class={item.cls} d={item.d} />
								}
							</g>
							<g>
								@for (const text of chip.ink.texts; key text.key) {
									<text class={text.cls} transform={text.matrix}>{text.text}</text>
								}
							</g>
							<g class="torn fade overlay">
								@for (const item of chip.torn.paths; key item.key) {
									<path class={item.cls} d={item.d} />
								}
							</g>
						</g>
						<path class="hit" d={chip.hit} />
					</g>
				}
			</g>
		</svg>
		<p class="hint" aria-hidden="true">{hint}</p>
		<figcaption class="sr">
			A pen-and-ink terminal runs npm create markless@latest my-app. Bare, the CLI prints Welcome to Markless and asks What are you building today?, then waits. Below, a strip of flags: --, --yes, --starter app and --no-git. Add them after the -- and the same session prints Created my-app and Markless app ready with no questions. Tear off the -- and npm keeps the flags, so the CLI asks again.
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
				--kraft: color-mix(in oklch, oklch(78% 0.06 70) 70%, var(--paper));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
					--kraft: oklch(70% 0.05 70);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.kraft {
				fill: var(--kraft);
			}

			.kraft-wash {
				fill: oklch(60% 0.08 60);
				opacity: 0.18;
			}

			.folder-fill {
				fill: color-mix(in oklch, var(--yellow) 45%, var(--sheet));
			}

			.faint {
				opacity: 0.35;
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

			.pen {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.halo {
				stroke: var(--sheet);
				stroke-width: 3.4;
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

			.small {
				font-size: 8px;
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

			.bold-ui {
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 10px;
				letter-spacing: 0.06em;
			}

			.ok-ink {
				fill: var(--ok);
			}

			.ok-wash {
				fill: var(--ok);
				opacity: 0.18;
			}

			.bad-ink,
			.bad-pen-fill {
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

			.hover-wash {
				fill: var(--yellow);
				opacity: 0.35;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.4;
				}
			}

			.swipe {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;

				html.dark & {
					opacity: 0.5;
					mix-blend-mode: normal;
				}
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.fade {
				transition: opacity 160ms ease;
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

			.cmd-ok {
				opacity: max(0, 1 - max(var(--mode) - 1, 1 - var(--mode)));
			}

			.cmd-gone {
				opacity: max(0, var(--mode) - 1);
			}

			.asking {
				opacity: calc(1 - max(0, 1 - max(var(--mode) - 1, 1 - var(--mode))));
			}

			.done {
				opacity: max(0, 1 - max(var(--mode) - 1, 1 - var(--mode)));
			}

			.caret {
				fill: var(--sheet-ink);
				animation: blink 1s steps(2) infinite;
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

			.bad-hand {
				fill: var(--bad);
			}

			.scene[data-beat='a'] .line {
				animation: type-a 240ms calc(var(--l) * 110ms) both;
			}

			.scene[data-beat='b'] .line {
				animation: type-b 240ms calc(var(--l) * 110ms) both;
			}

			@keyframes type-a {
				from {
					opacity: 0;
				}
			}

			@keyframes type-b {
				from {
					opacity: 0;
				}
			}

			.chip {
				cursor: pointer;
			}

			.lift {
				transition: transform 140ms ease;
			}

			.chip:hover .lift {
				transform: translateY(-3px) rotate(-0.6deg);
			}

			.torn {
				opacity: 0;
			}

			.chip[data-chip='0'] .torn {
				opacity: calc(1 - var(--dash));
			}

			.chip[data-chip='0'] .lift {
				opacity: calc(0.45 + 0.55 * var(--dash));
			}

			.hint {
				margin: 0.4rem 0 0;
				min-height: 1.5em;
				font-family: var(--font-mono);
				font-size: var(--step--1, 0.85rem);
				color: color-mix(in oklch, var(--ink) 70%, transparent);
				text-align: center;
			}

			.overlay {
				pointer-events: none;
			}
		</style>
	</figure>
}
