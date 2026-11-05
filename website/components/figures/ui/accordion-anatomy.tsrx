// The accordion's one idea as a toy: press, drag or arrow the heading and its panel opens; the panel itself is not a button and rattles if you try.
import { computed, state } from '@markless/core';
import { art } from './accordion-anatomy.art.ts';

export default function AccordionAnatomy() @{
	let open = state(true);
	let rattle = state('');
	let said = state('');
	let start = state(0);
	let dragged = state(false);
	const scene = computed(() => (open ? 'yes' : 'no'));

	<figure class="accordion-anatomy" data-open={scene} data-rattle={rattle}>
		<div class="stage">
			<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const s of art.shapes; key s.key) {
					<path class={s.cls} d={s.d} />
				}
				@for (const s of art.strokes; key s.key) {
					<path class={s.cls} d={s.d} style={'--l:' + s.length + ';--at:' + s.at + 'ms'} />
				}
				@for (const t of art.texts; key t.key) {
					<text class={t.cls} x={t.x} y={t.y}>{t.text}</text>
				}
			</svg>
			<button
				type="button"
				class="hit hit-head"
				aria-expanded={open ? 'true' : 'false'}
				aria-label="Do you ship overseas? Press, drag down or up, or use the arrow keys."
				onPointerdown={(event: PointerEvent) => {
					start = event.clientY;
					dragged = false;
				}}
				onPointerup={(event: PointerEvent) => {
					const dy = event.clientY - start;
					if (dy > 14 || dy < -14) {
						dragged = true;
						open = dy > 0;
						said = open ? 'You pulled the panel open.' : 'You pushed the panel shut.';
					}
				}}
				onClick={() => {
					if (dragged) {
						dragged = false;
						return;
					}
					open = !open;
					said = open ? 'The panel opened under its heading.' : 'The panel closed. It stays in the page, hidden.';
				}}
				onKeydown={(event: KeyboardEvent) => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						open = true;
						said = 'The panel opened under its heading.';
					}
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						open = false;
						said = 'The panel closed. It stays in the page, hidden.';
					}
				}}
			>
				<span class="tag">accordion.itemtrigger</span>
			</button>
			<span
				class="hit hit-panel"
				aria-hidden="true"
				onClick={() => {
					rattle = rattle === 'a' ? 'b' : 'a';
					said = "The panel isn't a button. Only its heading opens and closes it.";
				}}
			>
				<span class="tag">accordion.itemcontent</span>
			</span>
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.accordion-anatomy {
				margin: var(--space-m) 0;
			}

			.stage {
				position: relative;
				width: min(100%, 38rem);
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 45%, white);

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 88%, white);
				}
			}

			.hit {
				position: absolute;
				left: 7.1%;
				width: 60.7%;
				padding: 0;
				border: 0;
				border-radius: 10px;
				background: none;
				cursor: pointer;
				touch-action: none;
			}

			.hit-head {
				top: 6%;
				height: 23%;
			}

			.hit-panel {
				top: 32%;
				height: 58%;
				cursor: not-allowed;
			}

			.accordion-anatomy[data-open='no'] .hit-panel {
				display: none;
			}

			.hit-head:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.tag {
				position: absolute;
				bottom: calc(100% + 0.2rem);
				left: 0.4rem;
				padding: 0 0.4rem;
				border-radius: 4px;
				background: var(--paper);
				color: var(--ink);
				font: 600 0.85rem 'Recursive', ui-monospace, monospace;
				opacity: 0;
				translate: 0 4px;
				transition: opacity 150ms ease, translate 150ms ease;
				pointer-events: none;
			}

			.hit-panel .tag {
				bottom: auto;
				top: calc(100% + 0.3rem);
			}

			.hit:hover .tag,
			.hit-head:focus-visible .tag {
				opacity: 1;
				translate: 0 0;
			}

			.head,
			.panel {
				transition: translate 160ms ease;
			}

			.accordion-anatomy:has(.hit-head:hover) .head {
				translate: 0 -3px;
			}

			.accordion-anatomy:has(.hit-panel:hover) .panel {
				translate: 0 -2px;
			}

			.accordion-anatomy:has(.hit-head:active) .head {
				translate: 0 2px;
			}

			.box {
				fill: var(--sheet);
			}

			.wash {
				fill: var(--yellow);
				opacity: 0;
				mix-blend-mode: multiply;
				transition: opacity 200ms ease;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.accordion-anatomy[data-open='yes'] .wash {
				opacity: 0.6;
			}

			.accordion-anatomy[data-open='no'] .panel,
			.accordion-anatomy[data-open='no'] .open-mark,
			.accordion-anatomy[data-open='yes'] .closed-mark {
				display: none;
			}

			.accordion-anatomy[data-rattle='a'] .panel {
				animation: rattle-a 360ms ease-in-out;
			}

			.accordion-anatomy[data-rattle='b'] .panel {
				animation: rattle-b 360ms ease-in-out;
			}

			@keyframes rattle-a {
				20%,
				60% {
					translate: -5px 0;
				}

				40%,
				80% {
					translate: 5px 0;
				}
			}

			@keyframes rattle-b {
				20%,
				60% {
					translate: -5px 0;
				}

				40%,
				80% {
					translate: 5px 0;
				}
			}

			.ui {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 18px;
				fill: var(--ink);
			}

			.code-label {
				font-family: 'Recursive', ui-monospace, monospace;
				font-size: 16px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.6;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.scribble {
				opacity: 0.6;
			}

			.names {
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.accordion-anatomy[data-open='yes'] .pen.panel {
				animation: draw 500ms var(--at) ease-out both;
			}

			@keyframes draw {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
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

			@media (prefers-reduced-motion: reduce) {
				.head,
				.panel,
				.tag,
				.wash {
					transition: none;
				}

				.accordion-anatomy[data-open='yes'] .pen.panel,
				.accordion-anatomy[data-rattle] .panel {
					animation: none;
				}
			}
		</style>
	</figure>
}
