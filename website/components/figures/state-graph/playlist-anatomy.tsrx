// A playlist page with the `playing` value beside it, ruled to the only two spots that read it. Pick a song and the write reaches those two; the title reads nothing.
import { computed, state } from '@markless/core';
import { describePlay, SONGS, START } from './model.ts';
import { art } from './playlist.art.ts';

export default function PlaylistAnatomy() @{
	let playing = state<string>(START);
	let changed = state(false);
	let beat = state('rest');
	let hoverRow = state(-1);
	let hoverTag = state(false);
	let hoverTitle = state(false);
	let touched = state(false);
	const said = computed(() => describePlay(playing, changed));
	const play = (song: string) => {
		playing = song;
		changed = true;
		beat = beat === 'odd' ? 'even' : 'odd';
	};
	const next = (step: number) => {
		const at = SONGS.indexOf(playing as (typeof SONGS)[number]);
		play(SONGS[(at + step + SONGS.length) % SONGS.length]!);
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
				hoverRow = hoverRow === 1 ? -1 : 1;
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
			aria-label="A playlist. Press to play a song: the one under the pointer, or the next one. Arrow keys move up and down the list."
			onClick={() => {
				touched = true;
				if (hoverRow >= 0) play(SONGS[hoverRow]!);
				else next(1);
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
					next(event.key === 'ArrowDown' ? 1 : -1);
				}
				if (event.key === 'Escape') {
					playing = START;
					changed = false;
				}
			}}
		>
			<svg class="scene" data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<g class="headline">
					<path class="wash yellow" d={art.headerSpot.wash} />
				</g>
				<text class="print now" transform={art.headerText}>{playing}</text>
				<path class="rule header-rule" d={art.headerRule} />
				<g
					class="title"
					data-hover={hoverTitle ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hoverTitle = true;
					}}
					onPointerleave={() => (hoverTitle = false)}
				>
					<path class="hit" d={art.titleHit} />
					<text class="pencil-text title-note" transform={art.titleNote}>reads nothing</text>
				</g>
				<g
					class="row"
					data-hover={hoverRow === 0 ? 'yes' : 'no'}
					data-on={playing === SONGS[0] ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hoverRow = 0;
					}}
					onPointerleave={() => (hoverRow = -1)}
				>
					<path class="hit" d={art.rows[0]!.hit} />
					<g class="mark">
						<path class="wash yellow" d={art.rows[0]!.marker.wash} />
						<path class="wash yellow pool" d={art.rows[0]!.marker.pool} />
					</g>
					<path class="ink" d={art.rows[0]!.markerInk} />
				</g>
				<g
					class="row"
					data-hover={hoverRow === 1 ? 'yes' : 'no'}
					data-on={playing === SONGS[1] ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hoverRow = 1;
					}}
					onPointerleave={() => (hoverRow = -1)}
				>
					<path class="hit" d={art.rows[1]!.hit} />
					<g class="mark">
						<path class="wash yellow" d={art.rows[1]!.marker.wash} />
						<path class="wash yellow pool" d={art.rows[1]!.marker.pool} />
					</g>
					<path class="ink" d={art.rows[1]!.markerInk} />
				</g>
				<g
					class="row"
					data-hover={hoverRow === 2 ? 'yes' : 'no'}
					data-on={playing === SONGS[2] ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hoverRow = 2;
					}}
					onPointerleave={() => (hoverRow = -1)}
				>
					<path class="hit" d={art.rows[2]!.hit} />
					<g class="mark">
						<path class="wash yellow" d={art.rows[2]!.marker.wash} />
						<path class="wash yellow pool" d={art.rows[2]!.marker.pool} />
					</g>
					<path class="ink" d={art.rows[2]!.markerInk} />
				</g>
				<path class="rule row-rule" data-on={playing === SONGS[0] ? 'yes' : 'no'} d={art.rows[0]!.rule} />
				<path class="rule row-rule" data-on={playing === SONGS[1] ? 'yes' : 'no'} d={art.rows[1]!.rule} />
				<path class="rule row-rule" data-on={playing === SONGS[2] ? 'yes' : 'no'} d={art.rows[2]!.rule} />
				<g
					class="obj"
					data-hover={hoverTag ? 'yes' : 'no'}
					onPointerenter={() => {
						touched = true;
						hoverTag = true;
					}}
					onPointerleave={() => (hoverTag = false)}
				>
					<g class="lift">
						@for (const layer of art.objects.tag.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.objects.tag.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
					<text class="obj-label" x={art.objects.tag.label[0]} y={art.objects.tag.label[1]}>= {playing}</text>
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>ONLY ITS READERS</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a playlist page called Road trip, with a header that says Now playing and three songs, and beside it a tag
			for the value playing. Two ruled lines run from the tag: one to the header and one to the marked row. The title has no line. Pick a
			song by pressing its row, or press anywhere, or use the arrow keys: the header and the marked row change, and the title does not.
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

			.hit {
				fill: transparent;
			}

			.row {
				cursor: pointer;
			}

			.row[data-hover='yes'] .hit {
				fill: color-mix(in oklch, var(--yellow) 25%, transparent);
			}

			.mark,
			.rule {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.row[data-on='yes'] .mark,
			.row-rule[data-on='yes'] {
				opacity: 1;
			}

			.rule {
				fill: var(--ink);
			}

			.header-rule {
				opacity: 1;
			}

			.headline {
				opacity: 0.55;
			}

			.big {
				font-size: 7px;
			}

			.now {
				font-weight: 800;
			}

			.tag-code {
				font-size: 6px;
			}

			.title-note {
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.title[data-hover='yes'] .title-note {
				opacity: 1;
			}

			.lift {
				transition: transform 180ms ease;
			}

			.obj[data-hover='yes'] .lift {
				transform: translate(-2px, -7px) rotate(-0.6deg);
			}

			.obj-label {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 15px;
				fill: var(--ink);
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.obj[data-hover='yes'] .obj-label {
				opacity: 1;
			}

			.scene[data-beat='odd'] .row-rule[data-on='yes'],
			.scene[data-beat='odd'] .header-rule {
				animation: flash-a 700ms ease;
			}

			.scene[data-beat='even'] .row-rule[data-on='yes'],
			.scene[data-beat='even'] .header-rule {
				animation: flash-b 700ms ease;
			}

			@keyframes flash-a {
				40% {
					fill: var(--pink);
				}
			}

			@keyframes flash-b {
				40% {
					fill: var(--pink);
				}
			}
		</style>
	</figure>
}
