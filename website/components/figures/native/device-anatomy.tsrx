// An iPhone running the early Markless proof beside Xcode's view debugger: pull the screen apart into its real UIKit layers and search them for a web view.
import { computed, state } from '@markless/core';
import { describeSearch, EXPLODED, LAYERS, search, START_SAID, TAPPED } from './model.ts';
import { art } from './device.art.ts';

export default function DeviceAnatomy() @{
	let exploded = state(false);
	let taps = state(0);
	let query = state('');
	let said = state(START_SAID);
	let hover = state('');
	let touched = state(false);
	const title = computed(() => 'Count ' + taps);
	const found = computed(() => search(query));
	const caption = computed(() => {
		const layer = LAYERS.find((l) => l.key === hover);
		if (layer) return layer.name + ': ' + layer.what;
		if (hover === 'button') return 'a native UIButton: tap it';
		if (hover === 'label') return 'a native UILabel';
		if (hover === 'debug') return exploded ? 'put the layers back' : 'pull the screen apart into its layers';
		if (hover === 'phone') return 'the early iOS proof, running natively';
		return 'Tap the button, press Debug View Hierarchy, then search the layers.';
	});
	const toggle = () => {
		exploded = !exploded;
		said = exploded ? EXPLODED : 'The layers are back together on the screen.';
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
				hover = hover === 'debug' ? '' : 'debug';
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
			aria-label="An iPhone running the Markless proof. Press Debug View Hierarchy to pull the screen into its layers, or the button on the phone. Enter or D toggles the debugger, T taps the button, Escape starts again."
			onClick={(event) => {
				touched = true;
				const key = keyOf(event.target);
				if (key === 'debug') toggle();
				else if (key === 'button') {
					taps = taps + 1;
					said = TAPPED;
				} else if (key) said = caption;
				else toggle();
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 'd' || event.key === 'D') toggle();
				if (event.key === 't' || event.key === 'T') {
					taps = taps + 1;
					said = TAPPED;
				}
				if (event.key === 'Escape') {
					exploded = false;
					taps = 0;
					query = '';
					said = START_SAID;
				}
			}}
		>
			<svg
				class="scene"
				data-exploded={exploded ? 'yes' : 'no'}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
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
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<path class="hit" data-key="phone" d={art.hits.phone} />
				<g class="screen">
					<text class="print heading" x={art.phone.label.x} y={art.phone.label.y}>{art.phone.heading}</text>
					<path class="hit" data-key="label" d={art.hits.label} />
					<path class="paper" d={art.phone.button} />
					<path class="wash pink" d={art.phone.buttonWash} />
					<path class="ink" d={art.phone.buttonInk} />
					<text class="print" x={art.phone.title.x} y={art.phone.title.y}>{title}</text>
					<path class="hit" data-key="button" d={art.hits.button} />
				</g>
				<g class="debug" data-on={exploded ? 'yes' : 'no'}>
					<path class="wash yellow" d={art.debug.wash} />
				</g>
				<path class="hit" data-key="debug" d={art.debug.hit} />
				<text class="pencil-text empty" x={art.empty.x} y={art.empty.y}>press Debug View Hierarchy</text>
				@for (const layer of art.stack; key layer.key) {
					<g
						class="layer"
						data-key={layer.key}
						data-hover={hover === layer.key ? 'yes' : 'no'}
						data-found={found.includes(layer.name) ? 'yes' : 'no'}
					>
						<path class="paper" d={layer.poly} />
						<path class="wash yellow glow" d={layer.spot} />
						<path class="ink" d={layer.ink} />
						<path class="ink" d={layer.content} />
						<text class="code layer-name" x={layer.label.x} y={layer.label.y}>{layer.name}</text>
					</g>
				}
			</svg>
		</button>
		<label class="search">
			<span>Search the layers</span>
			<input
				type="search"
				placeholder="try WebView"
				value={query}
				onInput={(event) => {
					touched = true;
					query = event.currentTarget.value;
					if (!exploded && query.trim()) exploded = true;
					said = describeSearch(query, search(query));
				}}
			/>
			<output>{query.trim() ? found.length + (found.length === 1 ? ' result' : ' results') : ''}</output>
		</label>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of an iPhone running the early Markless proof, showing a native label, Markless iOS Proof, and a native
			button. Beside it is Xcode's Debug View Hierarchy button. Press it, or D, and the screen comes apart into its real layers from the
			proof's code: UIWindow, UIView, UIStackView, UILabel and UIButton, each named beside it. Type in the search box to find a layer;
			WebView finds 0 results, because there is no web view. Tap the phone's button, or press T, and the native button sets its own
			title. Three greyed outlines, Android, Windows and Linux, are marked not started. Escape starts again.
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

			.ghost {
				fill: color-mix(in oklch, var(--ink) 12%, transparent);
			}

			.scene .desk-label {
				fill: var(--ink);
			}

			.scene .heading {
				font-size: 12px;
				font-weight: 800;
			}

			.layer {
				opacity: 0;
				transform: translate(-150px, 40px) scale(0.6);
				transform-box: view-box;
				transition:
					opacity 400ms ease,
					transform 500ms cubic-bezier(0.3, 0.7, 0.4, 1);
				pointer-events: none;
			}

			.scene[data-exploded='yes'] .layer {
				opacity: 1;
				transform: none;
				pointer-events: auto;
			}

			.glow {
				opacity: 0;
				transition: opacity 200ms ease;
			}

			.layer[data-hover='yes'] .glow,
			.layer[data-found='yes'] .glow {
				opacity: 1;
			}

			.scene .layer-name {
				font-size: 12px;
				fill: var(--ink);
			}

			.empty {
				transition: opacity 300ms ease;
			}

			.scene[data-exploded='yes'] .empty {
				opacity: 0;
			}

			.debug {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.debug[data-on='yes'] {
				opacity: 1;
			}

			.search {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem;
				align-items: center;
				justify-content: center;
				margin-top: 0.3rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.9rem;
			}

			.search input {
				width: 11rem;
				padding: 0.2rem 0.6rem;
				border: 1.5px solid var(--ink);
				border-radius: 0.6rem;
				background: color-mix(in oklch, var(--paper) 50%, white);
				color: var(--ink);
				font: inherit;

				html.dark & {
					background: color-mix(in oklch, var(--ink) 15%, var(--paper));
				}
			}

			.search output {
				min-width: 5rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
			}
		</style>
	</figure>
}
