// The shadcn/ui docs home, original and Markless port, side by side: race them on a 3G phone and watch what each executes before its first click works.
import { computed, state } from '@markless/core';
import CoverageAnatomy from './coverage-anatomy.tsrx';
import { clock, describeRace, EXEC_KB, executedSoFar, FIRST_CLICK_S, fill, LIVE, ready, SOURCE, SPEED } from './race-model.ts';
import { art } from './race.art.ts';

const END_MS = Math.ceil(FIRST_CLICK_S.original * SPEED * 1000) + 200;

export default function RaceAnatomy() @{
	let ms = state(0);
	let running = state(false);
	let clickedPort = state(false);
	let clickedOriginal = state(false);
	let note = state('');
	let hover = state('');
	let mode = state('race');
	let timer = state(0);
	const origReady = computed(() => ready('original', ms));
	const portReady = computed(() => ready('port', ms));
	const origFill = computed(() => 'transform:scaleX(' + fill('original', ms).toFixed(3) + ')');
	const portFill = computed(() => 'transform:scaleX(' + fill('port', ms).toFixed(3) + ')');
	const origKb = computed(() => executedSoFar('original', ms).toLocaleString('en-US') + ' kB executed at load');
	const portKb = computed(() => executedSoFar('port', ms).toLocaleString('en-US') + ' kB executed at load');
	const origClock = computed(() => (ms === 0 ? 'first click: not loaded yet' : origReady ? 'first click answered at ' + FIRST_CLICK_S.original + ' s' : 'loading… ' + clock('original', ms)));
	const portClock = computed(() => (ms === 0 ? 'first click: not loaded yet' : portReady ? 'first click answered at ' + FIRST_CLICK_S.port + ' s' : 'loading… ' + clock('port', ms)));
	const said = computed(() => note || describeRace(ms, { port: clickedPort, original: clickedOriginal }));
	const caption = computed(() => {
		if (hover === 'go:port') return portReady ? 'press it: one small chunk loads and runs' : 'not ready yet: the page is still loading';
		if (hover === 'go:original') return origReady ? 'press it: its code already ran at load' : 'not ready yet: the page is still loading';
		if (hover === 'port') return 'Markless port: 131 kB executed at load';
		if (hover === 'original') return 'original (Next.js): 1,403 kB executed at load';
		return running ? 'Racing on a simulated 3G phone, ' + Math.round(1 / SPEED * 10) / 10 + '× speed. The numbers are the real ones.' : 'Press Load on a 3G phone, then Get Started on each page.';
	});
	const race = () => {
		if (running) return;
		window.clearInterval(timer);
		ms = 0;
		clickedPort = false;
		clickedOriginal = false;
		note = '';
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			ms = END_MS;
			return;
		}
		running = true;
		const start = performance.now();
		timer = window.setInterval(() => {
			ms = Math.min(END_MS, Math.round(performance.now() - start));
			if (ms >= END_MS) {
				window.clearInterval(timer);
				running = false;
			}
		}, 50);
	};
	const press = (side: string) => {
		if (side === 'port') {
			if (!portReady) note = 'The port is still loading. Wait for its Get Started to wake.';
			else {
				clickedPort = true;
				note = '';
			}
		}
		if (side === 'original') {
			if (!origReady) note = 'The original is still loading: it executes ' + EXEC_KB.original.toLocaleString('en-US') + ' kB before its first click works.';
			else {
				clickedOriginal = true;
				note = 'The original’s Get Started code already ran at load, with everything else.';
			}
		}
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure class="race" data-mode={mode}>
		<div class="controls">
			<button type="button" class="run" onClick={race}>{running ? 'Loading…' : ms ? 'Run it again' : 'Load on a 3G phone'}</button>
			<div class="modes" role="group" aria-label="View">
				<button type="button" aria-pressed={mode === 'race' ? 'true' : 'false'} onClick={() => (mode = 'race')}>Race</button>
				<button type="button" aria-pressed={mode === 'coverage' ? 'true' : 'false'} onClick={() => (mode = 'coverage')}>Coverage</button>
			</div>
		</div>
		<div class="race-view">
			<button
				type="button"
				class="stage"
				aria-label="The original and the Markless port of the shadcn/ui docs home. Press Get Started on either page; O presses the original's, P the port's."
				onClick={(event) => {
					const key = keyOf(event.target);
					if (key === 'go:port') press('port');
					else if (key === 'go:original') press('original');
					else if (!ms) race();
				}}
				onKeyDown={(event) => {
					if (event.key === 'p' || event.key === 'P') press('port');
					if (event.key === 'o' || event.key === 'O') press('original');
				}}
			>
				<svg
					class="scene"
					viewBox={'0 0 ' + art.width + ' ' + art.height}
					aria-hidden="true"
					onPointerover={(event) => {
						const key = keyOf(event.target);
						if (key) hover = key;
					}}
					onPointerdown={(event) => {
						const key = keyOf(event.target);
						if (key) hover = key;
					}}
					onPointerleave={(event) => {
						if (event.pointerType !== 'touch') hover = '';
					}}
				>
					<path class="hit" data-key="original" d="M6 34h324v292H6z" />
					<path class="hit" data-key="port" d="M350 34h324v292H350z" />
					@for (const layer of art.layers; key layer.key) {
						<path class={layer.cls} d={layer.d} />
					}
					@for (const words of art.words; key words.key) {
						<text class={words.cls} transform={words.matrix}>{words.text}</text>
					}
					<g class="go" data-ready={origReady ? 'yes' : 'no'} data-key="go:original">
						<path class="go-fill" d={art.original.go.poly} />
						<path class="ink" d={art.original.go.ink} />
						<text class="go-text" x={art.original.go.x} y={art.original.go.y}>Get Started</text>
						<path class="hit" d={art.original.go.hit} />
					</g>
					<g class="go" data-ready={portReady ? 'yes' : 'no'} data-key="go:port">
						<path class="go-fill" d={art.port.go.poly} />
						<path class="ink" d={art.port.go.ink} />
						<text class="go-text" x={art.port.go.x} y={art.port.go.y}>Get Started</text>
						<path class="hit" d={art.port.go.hit} />
					</g>
					<text class="print side" x={art.original.label.x} y={art.original.label.y}>original (Next.js)</text>
					<text class="print side" x={art.port.label.x} y={art.port.label.y}>Markless port</text>
					<rect class="bar orig-bar" x={art.original.meter.x} y={art.original.meter.y} width={art.original.meter.w} height={art.original.meter.h} style={origFill} />
					<rect class="bar port-bar" x={art.port.meter.x} y={art.port.meter.y} width={art.port.meter.w} height={art.port.meter.h} style={portFill} />
					<path class="ink" d={art.original.meter.frame} />
					<path class="ink" d={art.port.meter.frame} />
					<text class="print kb" x={art.original.figures.x} y={art.original.figures.y - 2}>{origKb}</text>
					<text class="print kb" x={art.port.figures.x} y={art.port.figures.y - 2}>{portKb}</text>
					<text class="hand clock" data-ready={origReady ? 'yes' : 'no'} x={art.original.chunk.x} y={art.original.chunk.y - 6}>{origClock}</text>
					<text class="hand clock" data-ready={portReady ? 'yes' : 'no'} x={art.port.chunk.x} y={art.port.chunk.y - 6}>{portClock}</text>
					<text class="code chunk" data-on={clickedPort ? 'yes' : 'no'} x={art.port.chunk.x + 190} y={art.port.chunk.y - 6}>+ 1 chunk on click</text>
				</svg>
			</button>
			<p class="hover-caption" aria-hidden="true">{caption}</p>
		</div>
		<div class="coverage-view">
			<CoverageAnatomy />
		</div>
		<p class="links">
			See it live: <a href={LIVE.port} rel="noopener" target="_blank">the Markless port</a> and <a href={LIVE.original} rel="noopener" target="_blank">the original</a>. Both are work-in-progress previews, not official shadcn/ui sites. Numbers: <a href={SOURCE}>the Markless README</a>, Chromium, both on Cloudflare, median of 3.
		</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>

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

			.race {
				margin: var(--space-m) 0;
			}

			.controls {
				display: flex;
				flex-wrap: wrap;
				gap: 0.6rem;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 0.4rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.controls button {
				padding: 0.2rem 0.75rem;
				font-size: 0.95rem;
				border: 1.5px solid var(--ink);
				border-radius: 0.7rem;
				background: color-mix(in oklch, var(--paper) 55%, white);
				color: var(--ink);
				font-family: inherit;
				font-weight: 700;
				cursor: pointer;

				html.dark & {
					background: color-mix(in oklch, var(--ink) 15%, var(--paper));
				}
			}

			.run {
				background: color-mix(in oklch, var(--pink) 55%, var(--paper)) !important;
			}

			.modes {
				display: flex;
				gap: 0.3rem;
			}

			.modes button[aria-pressed='true'] {
				background: var(--yellow);
			}

			.race[data-mode='race'] .coverage-view,
			.race[data-mode='coverage'] .race-view {
				display: none;
			}

			.scene .tiny {
				font-size: 7px;
			}

			.scene .tiny-bold {
				font-size: 7px;
				font-weight: 800;
			}

			.faint-text {
				opacity: 0.6;
			}

			.scene .hero {
				font-size: 15px;
				font-weight: 800;
			}

			.fill-ink {
				fill: var(--sheet-ink);
			}

			.go {
				cursor: pointer;
			}

			.go-fill {
				fill: color-mix(in oklch, var(--sheet-ink) 30%, var(--sheet));
				transition: fill 300ms ease;
			}

			.go[data-ready='yes'] .go-fill {
				fill: var(--sheet-ink);
			}

			.go-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 8px;
				font-weight: 800;
				fill: var(--sheet);
			}

			.scene .side {
				font-size: 14px;
				font-weight: 800;
				fill: var(--ink);
			}

			.bar {
				transform-box: fill-box;
				transform-origin: left center;
			}

			.orig-bar {
				fill: color-mix(in srgb, var(--pink) 60%, #e0603c);
			}

			.port-bar {
				fill: var(--yellow);
			}

			.scene .kb {
				font-size: 12px;
				font-weight: 700;
				fill: var(--ink);
			}

			.scene .clock {
				font-size: 14px;
				fill: var(--ink);
			}

			.clock[data-ready='yes'] {
				font-weight: 700;
			}

			.chunk {
				opacity: 0;
				transition: opacity 300ms ease;
			}

			.chunk[data-on='yes'] {
				opacity: 1;
			}

			.scene .chunk {
				font-size: 11px;
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.links {
				margin: 0.4rem 0 0;
				font-size: 0.85rem;
				text-align: center;
			}
		</style>
	</figure>
}
