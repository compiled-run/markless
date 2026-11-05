// Two prep tubs that arrived with the page, and an order ticket: only the ordered tub is opened.
import { computed, state } from '@markless/core';
import { describePass, NO_TUB } from './model.ts';
import { nearestTarget } from '../how/toy.ts';
import { art } from './pass.art.ts';

export default function PassAnatomy() @{
	let on = state(false);
	let touched = state(false);
	let hover = state('');
	let note = state('');
	let openAdd = state(false);
	let openGift = state(false);
	let held = state('');
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let ratio = state(1);
	let dropped = state(0);
	const dragStyle = computed(() => 'transform:translate(' + (held ? dragX : 0) + 'px,' + (held ? dragY : 0) + 'px)');
	const lit = computed(() => (on ? 'yes' : 'no'));
	const said = computed(() => (note ? note : describePass(openAdd, openGift)));
	const press = () => {
		note = '';
		openAdd = !openAdd;
		on = openAdd || openGift;
	};
	const reset = () => {
		note = '';
		openAdd = false;
		openGift = false;
		on = false;
	};
	const dropOn = (target: string) => {
		if (target === 'add') openAdd = true;
		else if (target === 'gift') openGift = true;
		else note = NO_TUB;
		on = openAdd || openGift;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				hover = hover === 'ticket' ? '' : 'ticket';
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Send in the order for Add. You can also drag the ticket onto a tub."
			onClick={() => {
				if (Date.now() - dropped < 400) return;
				touched = true;
				press();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					reset();
				}
			}}
		>
			<svg
				class="scene"
				data-on={lit}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerdown={(event) => {
					if (hover !== 'ticket') return;
					touched = true;
					held = 'ticket';
					fromX = event.clientX;
					fromY = event.clientY;
					dragX = 0;
					dragY = 0;
					const box = (event.currentTarget as Element).getBoundingClientRect();
					ratio = box.width > 0 ? art.width / box.width : 1;
				}}
				onPointermove={(event) => {
					if (!held && event.buttons === 1 && hover === 'ticket') {
						held = 'ticket';
						fromX = event.clientX;
						fromY = event.clientY;
						const box = (event.currentTarget as Element).getBoundingClientRect();
						ratio = box.width > 0 ? art.width / box.width : 1;
					}
					if (!held) return;
					dragX = (event.clientX - fromX) * ratio;
					dragY = (event.clientY - fromY) * ratio;
				}}
				onPointerup={() => {
					if (!held) return;
					if (Math.hypot(dragX, dragY) > 6) {
						const target = nearestTarget(art.targets, art.objects.ticket.anchor[0] + dragX, art.objects.ticket.anchor[1] + dragY);
						dropOn(target);
						dropped = Date.now();
					}
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={() => {
					hover = '';
					held = '';
				}}
			>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<g
					class="obj"
					data-hover={hover === 'ticket' ? 'yes' : 'no'}
					data-held={held === 'ticket' ? 'yes' : 'no'}
					data-drag="yes" style={dragStyle}
					onPointerenter={() => {
						touched = true;
						hover = 'ticket';
					}}
					onPointerleave={() => (hover = '')}
				>
					<g class="lift">
						@for (const layer of art.objects.ticket.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.objects.ticket.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
					<text class="obj-label" x={art.objects.ticket.label[0]} y={art.objects.ticket.label[1]}>drag onto a tub</text>
				</g>
				<g
					class="obj"
					data-hover={hover === 'add' ? 'yes' : 'no'}
					data-held={held === 'add' ? 'yes' : 'no'}
					data-drag="no"
					onPointerenter={() => {
						touched = true;
						hover = 'add';
					}}
					onPointerleave={() => (hover = '')}
				>
					<g class="lift">
						@for (const layer of art.objects.add.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.objects.add.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
						<g class="lid" data-open={openAdd ? 'yes' : 'no'} style={art.lift}>
							@for (const layer of art.lids.add.layers; key layer.key) {
								<path class={layer.cls} d={layer.d} />
							}
						</g>
					</g>
					<text class="obj-label" x={art.objects.add.label[0]} y={art.objects.add.label[1]}>arrived with the page</text>
				</g>
				<g
					class="obj"
					data-hover={hover === 'gift' ? 'yes' : 'no'}
					data-held={held === 'gift' ? 'yes' : 'no'}
					data-drag="no"
					onPointerenter={() => {
						touched = true;
						hover = 'gift';
					}}
					onPointerleave={() => (hover = '')}
				>
					<g class="lift">
						@for (const layer of art.objects.gift.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.objects.gift.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
						<g class="lid" data-open={openGift ? 'yes' : 'no'} style={art.lift}>
							@for (const layer of art.lids.gift.layers; key layer.key) {
								<path class={layer.cls} d={layer.d} />
							}
						</g>
					</g>
					<text class="obj-label" x={art.objects.gift.label[0]} y={art.objects.gift.label[1]}>arrived too, still sealed</text>
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>ARRIVED EARLY, OPENED ON ORDER</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of two lidded prep tubs, labelled Add and Gift, which arrived with the page and stand sealed, and an order
			ticket for Add on the counter. Press the drawing, or Enter or Space, to send the order in: only the Add tub's lid lifts. The Gift
			tub stays sealed. You can drag the ticket onto either tub to open that one instead; dropped anywhere else it comes back. Escape
			closes the tubs.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
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
				--sheet-ink: var(--ink);
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
					font-size: 21px;
				}
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

			.code {
				font-family: var(--font-mono);
				font-size: 4.4px;
				font-variation-settings: 'MONO' 1;
				fill: var(--sheet-ink);
			}

			.obj {
				transition: transform 380ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.obj[data-drag='yes'] {
				cursor: grab;
			}

			.obj[data-held='yes'] {
				cursor: grabbing;
				transition: none;
			}

			.lift {
				transition: transform 180ms ease;
			}

			.obj[data-hover='yes'] .lift,
			.obj[data-held='yes'] .lift {
				transform: translate(-2px, -7px) rotate(-0.6deg);
			}

			.obj-label {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 15px;
				fill: var(--ink);
				opacity: 0;
				transition: opacity 160ms ease;
				pointer-events: none;
			}

			.obj[data-hover='yes'] .obj-label,
			.obj[data-held='yes'] .obj-label {
				opacity: 1;
			}

			.lid {
				transition: transform 500ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.lid[data-open='yes'] {
				transform: translateY(var(--lift)) rotate(-4deg);
			}

			.tub-label {
				font-size: 7px;
			}
		</style>
	</figure>
}
