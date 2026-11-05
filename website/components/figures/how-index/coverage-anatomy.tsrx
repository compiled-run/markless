// A docs home page beside a DevTools Coverage panel. Flip between work done in the browser and work done at compile time; the measured JavaScript executed at load redraws.
import { computed, state } from '@markless/core';
import { AFTER_KB, BEFORE_KB, CLICK_ROW, describeCoverage, ROWS, type Side } from './model.ts';
import { art } from './coverage.art.ts';

export default function CoverageAnatomy() @{
	let side = state<Side>('browser');
	let clicked = state(false);
	let hover = state('');
	let touched = state(false);
	let note = state('');
	const rows = computed(() => (side === 'browser' ? [...ROWS.browser] : clicked ? [...ROWS.compile, CLICK_ROW] : [...ROWS.compile]));
	const kb = computed(() => (side === 'browser' ? BEFORE_KB : AFTER_KB));
	const fill = computed(() => 'transform:scaleX(' + (kb / BEFORE_KB).toFixed(3) + ')');
	const total = computed(() => kb.toLocaleString('en-US') + ' kB executed at load');
	const said = computed(() => note || describeCoverage(side, clicked));
	const caption = computed(() => {
		if (hover.startsWith('row')) {
			const row = rows[Number(hover.slice(3))];
			return row ? row.name + ': ' + row.work : '';
		}
		if (hover === 'go') return side === 'compile' ? 'press it: only its handler loads and runs' : 'its code already ran at load';
		if (hover === 'browse') return 'a link: no code runs for it';
		if (hover === 'browser' || hover === 'compile') return 'flip it: same page, measured both ways';
		return 'Flip the switch, hover a row, then press Get Started.';
	});
	const choose = (next: Side) => {
		side = next;
		note = '';
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

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
				hover = hover === 'compile' ? '' : 'compile';
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
			aria-label="A docs home page and its Coverage panel. Press the switch to flip between work done in the browser and worked out at compile time, or press Get Started. Arrow keys flip the switch, G presses Get Started, Escape starts again."
			onClick={(event) => {
				touched = true;
				const key = keyOf(event.target);
				if (key === 'browser' || key === 'compile') choose(key);
				else if (key === 'go') {
					if (side === 'compile') {
						clicked = true;
						note = '';
					} else note = 'In the browser version, the Get Started code already ran at load, with everything else.';
				} else choose(side === 'browser' ? 'compile' : 'browser');
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 'ArrowRight') choose('compile');
				if (event.key === 'ArrowLeft') choose('browser');
				if ((event.key === 'g' || event.key === 'G') && side === 'compile') clicked = true;
				if (event.key === 'Escape') {
					side = 'browser';
					clicked = false;
					note = '';
				}
			}}
		>
			<svg
				class="scene"
				data-side={side}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerleave={(event) => {
					if (event.pointerType !== 'touch') hover = '';
				}}
			>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<path class="wash yellow switch-on" data-on={side === 'browser' ? 'yes' : 'no'} d={art.switches[0]!.wash} />
				<path class="wash yellow switch-on" data-on={side === 'compile' ? 'yes' : 'no'} d={art.switches[1]!.wash} />
				<text class="label" x={art.switches[0]!.x} y={art.switches[0]!.y}>work done in the browser</text>
				<text class="label" x={art.switches[1]!.x} y={art.switches[1]!.y}>worked out at compile time</text>
				<g class="row" data-hover={hover === 'row0' ? 'yes' : 'no'} data-fresh={rows[0]?.key === 'click' ? 'yes' : 'no'} data-shown={rows[0] ? 'yes' : 'no'}>
					<text class="code" x="346" y="116">{rows[0]?.name ?? ''}</text>
					<text class="hand ran" x="560" y="116">{rows[0]?.key === 'click' ? 'ran on click' : 'ran at load'}</text>
				</g>
				<g class="row" data-hover={hover === 'row1' ? 'yes' : 'no'} data-fresh={rows[1]?.key === 'click' ? 'yes' : 'no'} data-shown={rows[1] ? 'yes' : 'no'}>
					<text class="code" x="346" y="156">{rows[1]?.name ?? ''}</text>
					<text class="hand ran" x="560" y="156">{rows[1]?.key === 'click' ? 'ran on click' : 'ran at load'}</text>
				</g>
				<g class="row" data-hover={hover === 'row2' ? 'yes' : 'no'} data-fresh={rows[2]?.key === 'click' ? 'yes' : 'no'} data-shown={rows[2] ? 'yes' : 'no'}>
					<text class="code" x="346" y="196">{rows[2]?.name ?? ''}</text>
					<text class="hand ran" x="560" y="196">{rows[2]?.key === 'click' ? 'ran on click' : 'ran at load'}</text>
				</g>
				<rect class="bar-fill" x={art.bar.x} y={art.bar.y} width={art.bar.w} height={art.bar.h} style={fill} />
				<path class="ink" d={art.bar.frame} />
				<text class="print total" x={art.total.x} y={art.total.y}>{total}</text>
				<path class="hit" data-key="browser" d={art.hits.browser} />
				<path class="hit" data-key="compile" d={art.hits.compile} />
				<path class="hit" data-key="go" d={art.hits.go} />
				<path class="hit" data-key="browse" d={art.hits.browse} />
				<path class="hit" data-key="row0" d={art.hits.rows[0]!} />
				<path class="hit" data-key="row1" d={art.hits.rows[1]!} />
				<path class="hit" data-key="row2" d={art.hits.rows[2]!} />
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of the shadcn/ui docs home page in a browser, beside a DevTools Coverage panel. A switch above reads work
			done in the browser, or worked out at compile time. With the browser side on, the panel lists the framework runtime, the
			components run again, and the event setup, and the bar reads 1,403 kB executed at load. Flip the switch and the rows shrink to the
			page's own code and the bar to 131 kB executed at load. On that side, press Get Started and one row appears: its handler, loaded
			and run only on the click. The numbers are the measured figures for this page in the Markless README.
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

			.hover-caption {
				margin: 0.3rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.url {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 9px;
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.scene .print,
			.scene .label {
				font-size: 13px;
			}

			.scene .big {
				font-size: 20px;
			}

			.scene .title {
				font-size: 14px;
			}

			.scene .code {
				font-size: 12px;
			}

			.scene .hand {
				font-size: 14px;
			}

			.scene .pencil-text {
				font-size: 12px;
			}

			.glow,
			.spot-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.spot-on[data-on='yes'] {
				opacity: 0.8;
			}

			.switch-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.switch-on[data-on='yes'] {
				opacity: 0.85;
			}

			.row[data-shown='no'] {
				opacity: 0;
			}

			.row {
				transition: opacity 300ms ease;
			}

			.row[data-hover='yes'] .code {
				text-decoration: underline;
			}

			.row[data-fresh='yes'] .ran {
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.ran {
				fill: var(--sheet-ink);
			}

			.bar-fill {
				fill: color-mix(in srgb, var(--pink) 55%, #e0603c);
				transform-box: fill-box;
				transform-origin: left center;
				transition: transform 700ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene[data-side='compile'] .bar-fill {
				fill: var(--yellow);
			}

			.total {
				font-weight: 800;
			}

			.button-label {
				font-size: 12px;
			}
		</style>
	</figure>
}
