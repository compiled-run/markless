// The old app and the new one as two sheets on a desk, with a front door wired to each page: a press moves the next page, checks it against the old one, and re-wires it when everything matches.
import { computed, state } from '@markless/core';
import { buttonLabel, describe, flip, move, NEW, NOTE, OLD, PAGES, pageAt, SITE, TAG, TOUR, TOUR_MS } from './model.ts';
import { art } from './migrate.art.ts';

export default function MigrateAnatomy() @{
	let moved = state(0);
	let beat = state('rest');
	let touched = state(false);
	const now = computed(() => String(moved - 1));
	const late = computed(() => (moved > 0 && pageAt(moved - 1).miss !== '' ? 'yes' : 'no'));
	const vars = computed(() => '--moved:' + moved);
	const checked = computed(() => (moved > 0 ? pageAt(moved - 1).path : ''));
	const label = computed(() => buttonLabel(moved));
	const said = computed(() => describe(moved, beat !== 'rest'));

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = TOUR[step % TOUR.length];
				step++;
				if (next === 'move') {
					moved = move(moved);
					beat = moved === 0 ? 'rest' : flip(beat);
				} else if (next === 'reset') {
					moved = 0;
					beat = 'rest';
				}
			}, TOUR_MS);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Move the next page to the new app"
			onClick={() => {
				touched = true;
				moved = move(moved);
				beat = moved === 0 ? 'rest' : flip(beat);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					moved = 0;
					beat = 'rest';
				}
			}}
		>
			<svg class="scene" data-beat={beat} data-now={now} data-late={late} style={vars} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.old.pencil} />
				<path class="pencil" d={art.fresh.pencil} />
				<path class="pencil" d={art.door.pencil} />

				<path class="shadow-wash light" d={art.old.deskWash} />
				<path class="hatch deep light" d={art.old.desk} />
				<path class="shadow-wash light" d={art.fresh.deskWash} />
				<path class="hatch deep light" d={art.fresh.desk} />
				<path class="shadow-wash light" d={art.door.deskWash} />
				<path class="hatch deep light" d={art.door.desk} />
				<path class="shadow-wash" d={art.old.curl.shadow} />
				<path class="hatch deep" d={art.old.curl.hatch} />
				<path class="shadow-wash" d={art.fresh.curl.shadow} />
				<path class="hatch deep" d={art.fresh.curl.hatch} />
				<path class="shadow-wash" d={art.door.curl.shadow} />
				<path class="hatch deep" d={art.door.curl.hatch} />

				<path class="shadow-wash" d={art.parcels.old.shadow} />
				<path class="hatch deep" d={art.parcels.old.shadowHatch} />
				<path class="kraft" d={art.parcels.old.paper} />
				<path class="tape" d={art.parcels.old.tape} />
				<path class="hatch" d={art.parcels.old.tone} />
				<path class="jar-ink" d={art.parcels.old.ink} />
				<path class="shadow-wash light" d={art.parcels.old.tag.cast} />
				<path class="tag-paper" d={art.parcels.old.tag.paper} />
				<path class="sheet-ink" d={art.parcels.old.tag.ink} />
				<path class="jar-ink" d={art.parcels.old.tag.string} />
				<text class="tag-text" transform={art.parcels.old.tag.matrix}>{TAG}</text>
				<path class="shadow-wash" d={art.parcels.fresh.shadow} />
				<path class="hatch deep" d={art.parcels.fresh.shadowHatch} />
				<path class="kraft" d={art.parcels.fresh.paper} />
				<path class="tape" d={art.parcels.fresh.tape} />
				<path class="hatch" d={art.parcels.fresh.tone} />
				<path class="jar-ink" d={art.parcels.fresh.ink} />
				<path class="shadow-wash light" d={art.parcels.fresh.tag.cast} />
				<path class="tag-paper" d={art.parcels.fresh.tag.paper} />
				<path class="sheet-ink" d={art.parcels.fresh.tag.ink} />
				<path class="jar-ink" d={art.parcels.fresh.tag.string} />
				<text class="tag-text" transform={art.parcels.fresh.tag.matrix}>{TAG}</text>

				<g class="sheet">
					<path class="sheet-paper" d={art.old.paper} />
					<path class="sheet-hatch light" d={art.old.bar.tone} />
					<path class="sheet-ink" d={art.old.bar.ink} />
					<path class="sheet-paper" d={art.old.pill.paper} />
					<path class="sheet-ink" d={art.old.pill.ink} />
					<text class="url" transform={art.old.pill.matrix}>{SITE}</text>
					<text class="title" transform={art.old.title}>{OLD}</text>
					@for (const p of art.pages; key p.key) {
						<g class="tile">
							<path class="sheet-paper" d={p.oldTile.paper} />
							<path class="sheet-hatch" d={p.oldTile.tone} />
							<path class="sheet-hatch" d={p.oldTile.extraTone} />
							<path class="sheet-ink" d={p.oldTile.frame} />
							<path class="sheet-ink" d={p.oldTile.ink} />
							<path class="sheet-ink" d={p.oldTile.extra} />
						</g>
					}
					<path class="sheet-ink" d={art.old.curl.ink} />
					<path class="sheet-ink" d={art.old.ink} />
				</g>

				<g class="sheet">
					<path class="sheet-paper" d={art.fresh.paper} />
					<path class="sheet-hatch light" d={art.fresh.bar.tone} />
					<path class="sheet-ink" d={art.fresh.bar.ink} />
					<path class="sheet-paper" d={art.fresh.pill.paper} />
					<path class="sheet-ink" d={art.fresh.pill.ink} />
					<text class="url" transform={art.fresh.pill.matrix}>{SITE}</text>
					<text class="title" transform={art.fresh.title}>{NEW}</text>
					<path class="pencil" d={art.fresh.slots} />
					@for (const p of art.pages; key p.key) {
						<g class="pg" data-i={p.rank} style={'--i:' + p.rank}>
							<g class="tile-new">
								<path class="sheet-paper" d={p.newTile.paper} />
								<path class="sheet-hatch" d={p.newTile.tone} />
								<path class="sheet-ink" d={p.newTile.frame} />
								<path class="sheet-ink" d={p.newTile.ink} />
								<g class="fix">
									<path class="sheet-hatch" d={p.newTile.extraTone} />
									<path class="sheet-ink" d={p.newTile.extra} />
								</g>
							</g>
						</g>
					}
					<path class="sheet-ink" d={art.fresh.curl.ink} />
					<path class="sheet-ink" d={art.fresh.ink} />
				</g>

				@for (const c of art.cards; key c.key) {
					<g>
						<path class="shadow-wash" d={c.cast} />
						<path class="hatch deep light" d={c.castHatch} />
						<path class="sheet-paper" d={c.paper} />
						<path class="sheet-ink" d={c.ink} />
					</g>
				}
				<text class="card-label" transform={art.cards[0]!.label}>{checked}</text>
				<text class="card-label" transform={art.cards[1]!.label}>{checked}</text>
				@for (const p of art.pages; key p.key) {
					<g class="pg" data-i={p.rank} style={'--i:' + p.rank}>
						<g class="card-in">
							<path class="sheet-hatch" d={p.oldCard.tone} />
							<path class="sheet-hatch" d={p.oldCard.extraTone} />
							<path class="sheet-ink" d={p.oldCard.ink} />
							<path class="sheet-ink" d={p.oldCard.extra} />
							<path class="sheet-hatch" d={p.newCard.tone} />
							<path class="sheet-ink" d={p.newCard.ink} />
							<g class="fix">
								<path class="sheet-hatch" d={p.newCard.extraTone} />
								<path class="sheet-ink" d={p.newCard.extra} />
							</g>
							<path class="ring" d={p.ring} />
						</g>
					</g>
				}
				<g class="marks">
					@for (const m of art.marks; key m.key) {
						<g class="mark" data-row={m.key}>
							<path class="tick" d={m.tick.d} style={'--l:' + m.tick.length} />
							<path class="cross" d={m.cross} />
						</g>
					}
				</g>

				<g class="sheet">
					<path class="sheet-paper" d={art.door.paper} />
					@for (const p of art.pages; key p.key) {
						<g class="pg" data-i={p.rank} style={'--i:' + p.rank}>
							<g class="label-wash">
								<path class="wash yellow" d={art.door.sockets[p.key]!.wash} />
								<path class="wash yellow pool" d={art.door.sockets[p.key]!.pool} />
							</g>
						</g>
					}
					<text class="door-title" transform={art.door.title}>{SITE}</text>
					<path class="sheet-hatch" d={art.door.doorTone} />
					<path class="sheet-ink" d={art.door.doorway} />
					<path class="sheet-ink" d={art.door.rule} />
					@for (const s of art.door.sockets; key s.key) {
						<g>
							<path class="boot" d={s.paper} />
							<path class="hatch" d={s.tone} />
							<path class="jar-ink" d={s.ink} />
							<text class="path" transform={s.label}>{PAGES[s.key]!.path}</text>
						</g>
					}
					<g class="press" style={art.door.button.sink}>
						<path class="sheet-hatch" d={art.door.button.side} />
						<path class="sheet-paper" d={art.door.button.paper} />
						<path class="wash pink" d={art.door.button.wash} />
						<path class="wash pink pool" d={art.door.button.pool} />
						<path class="sheet-ink" d={art.door.button.ink} />
						<text class="button-text" transform={art.door.button.label}>{label}</text>
					</g>
					<path class="sheet-ink" d={art.door.curl.ink} />
					<path class="sheet-ink" d={art.door.ink} />
				</g>

				@for (const p of art.pages; key p.key) {
					<g class="pg" data-i={p.rank} style={'--i:' + p.rank}>
						<g class="wire-old">
							<path class="shadow-ink" d={p.oldWire.shadow} />
							<path class="cord" d={p.oldWire.paper} />
							<path class="jar-ink" d={p.oldWire.ink} />
							<path class="shadow-wash" d={p.oldWire.clip.cast} />
							<path class="boot" d={p.oldWire.clip.boot} />
							<path class="brass" d={p.oldWire.clip.paper} />
							<path class="wash brass-wash" d={p.oldWire.clip.wash} />
							<path class="hatch" d={p.oldWire.clip.side} />
							<path class="jar-ink" d={p.oldWire.clip.ink} />
						</g>
						<g class="wire-new">
							<path class="shadow-ink" d={p.newWire.shadow} />
							<path class="cord" d={p.newWire.paper} />
							<path class="jar-ink" d={p.newWire.ink} />
							<path class="shadow-wash" d={p.newWire.clip.cast} />
							<path class="boot" d={p.newWire.clip.boot} />
							<path class="brass" d={p.newWire.clip.paper} />
							<path class="wash brass-wash" d={p.newWire.clip.wash} />
							<path class="hatch" d={p.newWire.clip.side} />
							<path class="jar-ink" d={p.newWire.clip.ink} />
						</g>
						<path class="pulse" d={p.newWire.centre} style={'--len:' + p.newWire.length} />
					</g>
				}

				<path class="jar-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.at.x} y={art.note.at.y}>{NOTE}</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. At the back lie two browser sheets for {SITE}: the old app on the left with its four pages
			drawn as small tiles, and the new app on the right with four empty spots. Behind the old app sits a big heavy box tagged
			{TAG}; behind the new app, a tiny one with the same tag. In front, a card for the front door lists the pages /, /pricing,
			/account and /blog, each with a wire running back to that page's tile on the old app. Between the sheets lie two blank cards
			for the check. Press the drawing, or Enter or Space, to move the next page: its new version appears on the new app, the old
			and new versions are laid side by side and ticked part by part, and only when every part matches does its wire move to the
			new app. On /account the check first finds the settings button missing, and the wire moves only once it is fixed. Escape
			puts every page back on the old app.
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
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--card: oklch(76% 0.06 70);
				--t3: 2100ms;
				--sw: 2600ms;

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
					--card: oklch(52% 0.06 65);
				}
			}

			.scene[data-late='yes'] {
				--t3: 3300ms;
				--sw: 3800ms;
			}

			.sheet-paper,
			.tag-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.55;
				stroke-linecap: round;
				opacity: 0.75;
			}

			.jar-ink {
				fill: var(--ink);
			}

			.light {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.shadow-ink {
				fill: var(--shade);
				opacity: 0.9;
			}

			.cord,
			.brass {
				fill: var(--paper);
			}

			.kraft {
				fill: var(--card);
			}

			.tape {
				fill: color-mix(in oklch, var(--card) 70%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--card) 80%, black);
				}
			}

			.boot {
				fill: oklch(48% 0.15 25);

				html.dark & {
					fill: oklch(52% 0.15 25);
				}
			}

			.wash {
				stroke-width: 1.2;
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
				opacity: 0.6;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink.pool {
				fill: var(--pink);
				opacity: 0.45;
			}

			.brass-wash {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(60% 0.12 70));
				stroke: none;
				opacity: 0.8;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.title,
			.url,
			.door-title,
			.path,
			.button-text,
			.card-label,
			.tag-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 15px;
				font-weight: 800;
			}

			.url {
				font-size: 7px;
				opacity: 0.75;
			}

			.door-title {
				font-size: 12px;
				font-weight: 800;
			}

			.path {
				font-size: 13px;
				font-weight: 800;
				text-anchor: middle;
			}

			.button-text {
				font-size: 9.5px;
				font-weight: 700;
				text-anchor: middle;
			}

			.card-label {
				font-size: 9px;
				font-weight: 700;
				text-anchor: middle;
			}

			.tag-text {
				font-size: 9px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				text-anchor: middle;
				fill: var(--ink);
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

			.ring {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 1.4;
				stroke-linecap: round;
				opacity: 0;
			}

			.tick {
				fill: none;
				stroke: var(--ink);
				stroke-width: 2;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.cross {
				fill: var(--ink);
				opacity: 0;
			}

			.scene[data-now='-1'] .marks {
				display: none;
			}

			.pulse {
				fill: none;
				stroke: var(--ink);
				stroke-width: 7;
				stroke-linecap: round;
				stroke-dasharray: 3 100000;
				opacity: 0;
			}

			.pg {
				--on: clamp(0, calc(var(--moved) - var(--i)), 1);
				--shown: 0;
				--a-show: none;
				--a-out: none;
				--a-in: none;
				--a-travel: none;
				--a-flash: none;
			}

			.scene[data-now='0'] .pg[data-i='0'],
			.scene[data-now='1'] .pg[data-i='1'],
			.scene[data-now='2'] .pg[data-i='2'],
			.scene[data-now='3'] .pg[data-i='3'] {
				--shown: 1;
				--a-show: var(--k-show);
				--a-out: var(--k-out);
				--a-in: var(--k-in);
				--a-travel: var(--k-travel);
				--a-flash: var(--k-flash);
			}

			.scene[data-beat='odd'] {
				--k-show: show-a;
				--k-out: out-a;
				--k-in: in-a;
				--k-travel: travel-a;
				--k-flash: flash-a;
				--k-draw: draw-a;
				--k-sink: sink-a;
			}

			.scene[data-beat='even'] {
				--k-show: show-b;
				--k-out: out-b;
				--k-in: in-b;
				--k-travel: travel-b;
				--k-flash: flash-b;
				--k-draw: draw-b;
				--k-sink: sink-b;
			}

			.press {
				animation: var(--k-sink, none) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.tile-new {
				opacity: var(--on);
				animation: var(--a-show) 700ms 250ms ease-out both;
			}

			.card-in {
				opacity: var(--shown);
				animation: var(--a-show) 450ms 900ms ease-out both;
			}

			.scene[data-late='yes'] .fix {
				animation: var(--a-in) 500ms 2600ms ease-out both;
			}

			.scene[data-late='yes'] .ring {
				animation: var(--a-flash) 1100ms 2100ms both;
				animation-fill-mode: none;
			}

			.mark .tick {
				--d: 1400ms;
				animation: var(--k-draw, none) 320ms var(--d) ease-out both;
			}

			.mark[data-row='1'] .tick {
				--d: 1750ms;
			}

			.mark[data-row='2'] .tick {
				--d: var(--t3);
			}

			.scene[data-late='yes'] .mark[data-row='2'] .cross {
				animation: var(--k-flash, none) 1100ms 2100ms;
			}

			.wire-old {
				opacity: calc(1 - var(--on));
				animation: var(--a-out) 300ms var(--sw) ease-in both;
			}

			.wire-new {
				opacity: var(--on);
				animation: var(--a-in) 400ms calc(var(--sw) + 100ms) ease-out both;
			}

			.pg .pulse {
				animation: var(--a-travel) 800ms calc(var(--sw) + 200ms) ease-in-out both;
			}

			.label-wash {
				opacity: var(--on);
				animation: var(--a-in) 500ms calc(var(--sw) + 900ms) ease-out both;
			}

			@keyframes sink-a {
				35% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes sink-b {
				35% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes show-a {
				from {
					opacity: 0;
					transform: translateY(-8px);
				}
			}

			@keyframes show-b {
				from {
					opacity: 0;
					transform: translateY(-8px);
				}
			}

			@keyframes in-a {
				from {
					opacity: 0;
				}
			}

			@keyframes in-b {
				from {
					opacity: 0;
				}
			}

			@keyframes out-a {
				from {
					opacity: 1;
				}
			}

			@keyframes out-b {
				from {
					opacity: 1;
				}
			}

			@keyframes flash-a {
				from,
				to {
					opacity: 1;
				}
			}

			@keyframes flash-b {
				from,
				to {
					opacity: 1;
				}
			}

			@keyframes draw-a {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes draw-b {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes travel-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 2;
				}

				92% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1px);
				}
			}

			@keyframes travel-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 2;
				}

				92% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--len) * -1px);
				}
			}

			@container anatomy (max-width: 520px) {
				.hand {
					font-size: 20px;
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
		</style>
	</figure>
}
