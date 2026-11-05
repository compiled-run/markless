// The accordion pulled apart into its parts like an exploded drawing: press, drag or arrow to snap it together, and the panel springs back if you pull it from its item.
import { computed, state } from '@markless/core';
import { art } from './accordion-anatomy.art.ts';

export default function AccordionAnatomy() @{
	let together = state(false);
	let open = state(true);
	let dragX = state(0);
	let dragY = state(0);
	let dragging = state(false);
	let grabbed = state('');
	let startX = state(0);
	let startY = state(0);
	let moved = state(false);
	let spring = state('');
	let said = state('');
	const mode = computed(() => (together ? 'together' : 'apart'));
	const shown = computed(() => (open ? 'open' : 'closed'));
	const pull = computed(() => '--drag-x:' + dragX + 'px;--drag-y:' + dragY + 'px');

	<figure class="accordion-anatomy" data-mode={mode} data-panel={shown} data-dragging={dragging ? '' : undefined} data-spring={spring} style={pull}>
		<div
			class="stage"
			tabindex={0}
			role="group"
			aria-label="The accordion's parts, pulled apart. Press, drag, or use the arrow keys to put them together."
			onPointerdown={(event: PointerEvent) => {
				const part = (event.target as Element).closest('[data-part]')?.getAttribute('data-part') ?? '';
				grabbed = part;
				startX = event.clientX;
				startY = event.clientY;
				moved = false;
			}}
			onPointermove={(event: PointerEvent) => {
				if (event.buttons !== 1 || grabbed !== 'itemcontent') return;
				const dx = event.clientX - startX;
				const dy = event.clientY - startY;
				if (dx * dx + dy * dy < 36) return;
				dragging = true;
				dragX = dx;
				dragY = dy;
			}}
			onPointerup={(event: PointerEvent) => {
				const dx = event.clientX - startX;
				const dy = event.clientY - startY;
				const far = dx * dx + dy * dy > 400;
				if (dragging) {
					dragging = false;
					dragX = 0;
					dragY = 0;
					moved = true;
					spring = spring === 'a' ? 'b' : 'a';
					said = 'The panel sprang back. A panel always belongs to its item.';
				} else if (far) {
					moved = true;
					together = dy > 0 ? true : dy < 0 ? false : !together;
					said = together ? 'The parts snapped together into a working accordion.' : 'The parts came apart.';
				}
				grabbed = '';
			}}
			onClick={(event: MouseEvent) => {
				if (moved) {
					moved = false;
					return;
				}
				const part = (event.target as Element).closest('[data-part]')?.getAttribute('data-part') ?? '';
				if (together && (part === 'itemtrigger' || part === 'itemlabel')) {
					open = !open;
					said = open ? 'The heading opened its panel.' : 'The heading closed its panel. It stays in the page, hidden.';
					return;
				}
				together = !together;
				said = together ? 'The parts snapped together into a working accordion.' : 'The parts came apart.';
			}}
			onKeydown={(event: KeyboardEvent) => {
				if (event.key === 'ArrowDown') {
					event.preventDefault();
					together = true;
					said = 'The parts snapped together into a working accordion.';
				} else if (event.key === 'ArrowUp' || event.key === 'Escape') {
					event.preventDefault();
					together = false;
					said = 'The parts came apart.';
				} else if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					if (together) {
						open = !open;
						said = open ? 'The heading opened its panel.' : 'The heading closed its panel. It stays in the page, hidden.';
					} else {
						together = true;
						said = 'The parts snapped together into a working accordion.';
					}
				}
			}}
		>
			<svg class="scene" viewBox="0 0 680 500" aria-hidden="true">
				<g class="plane">
					@for (const guide of art.guides; key guide.part) {
						<path class="guide" d={guide.d} />
					}
					@for (const layer of art.layers; key layer.part) {
						<g class="layer" data-part={layer.part} style={'--dx:' + layer.dx + 'px;--dy:' + layer.dy + 'px'}>
							<g class="lift">
								@for (const s of layer.shapes; key s.key) {
									<path class={s.cls} d={s.d} />
								}
								@for (const s of layer.strokes; key s.key) {
									<path class={s.cls} d={s.d} />
								}
								@for (const t of layer.texts; key t.key) {
									<text class={t.cls} x={t.x} y={t.y}>{t.text}</text>
								}
							</g>
						</g>
					}
				</g>
			</svg>
		</div>
		<figcaption class="sr">
			The parts nest like this: accordion.root holds each accordion.item; an item holds an accordion.itemlabel, which holds the accordion.itemtrigger, and an accordion.itemcontent panel.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.accordion-anatomy {
				margin: var(--space-m) 0;
			}

			.stage {
				width: min(100%, 40rem);
				border-radius: 12px;
				cursor: pointer;
				touch-action: none;
				user-select: none;
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
				--sheet: color-mix(in oklch, var(--paper) 45%, white);

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 88%, white);
				}
			}

			.plane {
				transform: translate(70px, 236px) skewX(-14deg) scale(0.95, 0.78);
				transition: transform 520ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
			}

			.accordion-anatomy[data-mode='together'] .plane {
				transform: translate(120px, 80px);
			}

			.layer {
				transform: translate(var(--dx), var(--dy));
				transition: transform 520ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
			}

			.accordion-anatomy[data-mode='together'] .layer {
				transform: none;
			}

			.layer[data-part='itemcontent'] .lift {
				transform: translate(var(--drag-x), var(--drag-y));
				transition: transform 420ms cubic-bezier(0.3, 1.6, 0.4, 1);
			}

			.accordion-anatomy[data-dragging] .layer[data-part='itemcontent'] .lift {
				transition: none;
			}

			.lift {
				transition: translate 160ms ease;
			}

			.layer:hover > .lift {
				translate: 0 -5px;
			}

			.guide {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-dasharray: 4 6;
				opacity: 0.7;
				transition: opacity 300ms ease;
			}

			.accordion-anatomy[data-mode='together'] .guide {
				opacity: 0;
			}

			.paper,
			.button-face {
				fill: var(--sheet);
			}

			.shade {
				fill: color-mix(in oklch, var(--ink) 18%, transparent);
			}

			.ink {
				fill: var(--ink);
			}

			.hatch,
			.faint {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.55;
			}

			.faint {
				opacity: 0.25;
			}

			.pen {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.5;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.ghost {
				stroke-dasharray: 4 5;
				opacity: 0.45;
			}

			.scribble {
				opacity: 0.55;
			}

			.wash {
				fill: var(--yellow);
				opacity: 0.6;
				mix-blend-mode: multiply;
				transition: opacity 200ms ease;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.4;
				}
			}

			.ui {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 17px;
				fill: #2d2a24;
			}

			.name {
				font-family: 'Recursive', ui-monospace, monospace;
				font-size: 18px;
				font-weight: 600;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
				opacity: 0;
				transition: opacity 150ms ease;
			}

			.layer:hover .name {
				opacity: 1;
			}

			.accordion-anatomy[data-mode='together'][data-panel='closed'] .layer[data-part='itemcontent'] {
				opacity: 0.25;
			}

			.accordion-anatomy[data-mode='together'][data-panel='closed'] .wash {
				opacity: 0;
			}

			.accordion-anatomy[data-spring='a'] .layer[data-part='itemcontent'] .lift {
				animation: settle-a 420ms ease-out;
			}

			.accordion-anatomy[data-spring='b'] .layer[data-part='itemcontent'] .lift {
				animation: settle-b 420ms ease-out;
			}

			@keyframes settle-a {
				30% {
					rotate: -1.5deg;
				}

				60% {
					rotate: 1deg;
				}
			}

			@keyframes settle-b {
				30% {
					rotate: -1.5deg;
				}

				60% {
					rotate: 1deg;
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
				.plane,
				.layer,
				.lift,
				.layer[data-part='itemcontent'] .lift {
					transition: none;
				}

				.accordion-anatomy[data-spring] .layer[data-part='itemcontent'] .lift {
					animation: none;
				}
			}
		</style>
	</figure>
}
