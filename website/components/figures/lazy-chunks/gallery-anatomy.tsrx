// A photo gallery in a browser beside its network panel: both click files arrived with the page, and each runs only when its button is pressed.
import { computed, state } from '@markless/core';
import { describeGallery } from './model.ts';
import { art } from './gallery.art.ts';

export default function GalleryAnatomy() @{
	let shown = state(-1);
	let picked = state(0);
	let ranOpen = state(false);
	let ranShare = state(false);
	let fresh = state('');
	let last = state('');
	let hover = state('');
	let pointed = state('');
	let touched = state(false);
	const caption = computed(() =>
		pointed === 'share'
			? (ranShare ? 'share.js: downloaded at load, ran on this click' : 'share.js: downloaded at load, not run yet')
			: pointed.startsWith('p')
				? (ranOpen ? 'open-photo.js: downloaded at load, ran on click' : 'open-photo.js: downloaded at load, not run yet')
				: 'Hover a photo or Share, then press it.',
	);
	const said = computed(() => describeGallery({ open: ranOpen, share: ranShare }, shown, last));
	const open = (i: number) => {
		shown = i;
		picked = i;
		ranOpen = true;
		fresh = 'open';
		last = 'open';
	};
	const doShare = () => {
		ranShare = true;
		fresh = 'share';
		last = 'share';
	};
	const reset = () => {
		shown = -1;
		ranOpen = false;
		ranShare = false;
		fresh = '';
		last = '';
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
				hover = hover === 'p1' ? '' : 'p1';
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
			aria-label="A photo gallery and its network panel. Press a photo to open it, or press Share. Arrow keys pick a photo, Enter opens it, S shares."
			onClick={() => {
				touched = true;
				if (hover === 'share') doShare();
				else if (hover.startsWith('p')) open(Number(hover.slice(1)));
				else open(picked);
			}}
			onKeyDown={(event) => {
				touched = true;
				hover = '';
				if (event.key === 'ArrowRight') picked = (picked + 1) % 3;
				if (event.key === 'ArrowLeft') picked = (picked + 2) % 3;
				if (event.key === 's' || event.key === 'S') doShare();
				if (event.key === 'Escape') reset();
			}}
		>
			<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true" onPointerleave={(event) => {
				if (event.pointerType === 'touch') return;
				hover = '';
				pointed = '';
			}}>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<text class="pencil-text empty" data-shown={shown < 0 ? 'yes' : 'no'} x={art.empty.x} y={art.empty.y}>press a photo</text>
				<g
					class="obj thumb"
					data-hover={hover === 'p0' ? 'yes' : 'no'}
					data-picked={picked === 0 ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hover = 'p0';
						pointed = 'p0';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="hit" d={art.thumbs[0]!.hit} />
					<g class="lift">
						@for (const layer of art.thumbs[0]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.thumbs[0]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
				</g>
				<g class="large" data-shown={shown === 0 ? 'yes' : 'no'}>
					@for (const layer of art.large[0]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.large[0]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
				</g>
				<g
					class="obj thumb"
					data-hover={hover === 'p1' ? 'yes' : 'no'}
					data-picked={picked === 1 ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hover = 'p1';
						pointed = 'p1';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="hit" d={art.thumbs[1]!.hit} />
					<g class="lift">
						@for (const layer of art.thumbs[1]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.thumbs[1]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
				</g>
				<g class="large" data-shown={shown === 1 ? 'yes' : 'no'}>
					@for (const layer of art.large[1]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.large[1]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
				</g>
				<g
					class="obj thumb"
					data-hover={hover === 'p2' ? 'yes' : 'no'}
					data-picked={picked === 2 ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hover = 'p2';
						pointed = 'p2';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="hit" d={art.thumbs[2]!.hit} />
					<g class="lift">
						@for (const layer of art.thumbs[2]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.thumbs[2]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
				</g>
				<g class="large" data-shown={shown === 2 ? 'yes' : 'no'}>
					@for (const layer of art.large[2]!.art.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.large[2]!.art.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
				</g>
				<g
					class="obj"
					data-hover={hover === 'share' ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hover = 'share';
						pointed = 'share';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="hit" d={art.share.hit} />
					<g class="lift">
						@for (const layer of art.share.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.share.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
				</g>
				<g class="row" data-ran={'yes'} data-fresh={fresh === 'page' ? 'yes' : 'no'}>
					<g class="row-spot">
						<path class="wash yellow" d={art.rows[0]!.spot.wash} />
						<path class="wash yellow pool" d={art.rows[0]!.spot.pool} />
					</g>
					<text class="hand ran" x="560" y={art.rows[0]!.y}>{'✓'}</text>
				</g>
				<g class="row" data-ran={ranOpen ? 'yes' : 'no'} data-fresh={fresh === 'open' ? 'yes' : 'no'}>
					<g class="row-spot">
						<path class="wash yellow" d={art.rows[1]!.spot.wash} />
						<path class="wash yellow pool" d={art.rows[1]!.spot.pool} />
					</g>
					<text class="hand ran" x="560" y={art.rows[1]!.y}>{ranOpen ? '✓ on click' : 'not yet'}</text>
				</g>
				<g class="row" data-ran={ranShare ? 'yes' : 'no'} data-fresh={fresh === 'share' ? 'yes' : 'no'}>
					<g class="row-spot">
						<path class="wash yellow" d={art.rows[2]!.spot.wash} />
						<path class="wash yellow pool" d={art.rows[2]!.spot.pool} />
					</g>
					<text class="hand ran" x="560" y={art.rows[2]!.y}>{ranShare ? '✓ on click' : 'not yet'}</text>
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>DOWNLOADED EARLY, RUN ON CLICK</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a photo gallery in a browser window, with three photos and a Share button, beside a network panel. The
			panel lists photos.html, open-photo.js and share.js: all three arrived when the page loaded, and only the page has run. Press a
			photo, or pick one with the arrow keys and press Enter, to open it large: open-photo.js is marked as run on that click, and nothing
			new downloads. Press Share, or S, and share.js runs the same way. Escape closes the photo and starts again.
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
			}

			.small-print {
				font-size: 11px;
			}

			.button-label {
				font-size: 12px;
			}

			.url {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 9px;
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.scene .print,
			.scene .label {
				font-size: 12px;
			}

			.scene .title {
				font-size: 14px;
			}

			.scene .code {
				font-size: 11px;
			}

			.scene .hand {
				font-size: 14px;
			}

			.scene .pencil-text {
				font-size: 13px;
			}

			.empty[data-shown='no'] {
				opacity: 0;
			}

			.large {
				opacity: 0;
				transform: scale(0.94);
				transform-origin: 160px 270px;
				transition:
					opacity 260ms ease,
					transform 260ms ease;
			}

			.large[data-shown='yes'] {
				opacity: 1;
				transform: none;
			}

			.obj {
				cursor: pointer;
			}

			.lift {
				transition: transform 180ms ease;
			}

			.obj[data-hover='yes'] .lift {
				transform: translate(-2px, -6px) rotate(-0.8deg);
			}

			.thumb[data-picked='yes'] .lift {
				filter: drop-shadow(0 0 0.5px var(--ink));
			}

			.obj-label {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 14px;
				fill: var(--ink);
				opacity: 0;
				transition: opacity 160ms ease;
				pointer-events: none;
			}

			.obj[data-hover='yes'] .obj-label {
				opacity: 1;
			}

			.row-spot {
				opacity: 0;
				transition: opacity 300ms ease;
			}

			.row[data-ran='yes'] .row-spot {
				opacity: 0.55;
			}

			.row[data-fresh='yes'] .row-spot {
				opacity: 1;
			}

			.ran {
				fill: var(--sheet-ink);
			}

			.row[data-ran='no'] .ran {
				opacity: 0.45;
			}
		</style>
	</figure>
}
