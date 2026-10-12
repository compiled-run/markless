// The order code on a sheet, buried under red framework marks that say what each costs; on a press an eraser rubs out the pencil, the tabs peel off, and the barista signs it "Markless".
import { computed, state } from '@markless/core';
import { BANNER_FS, CODE_FS, describe, FLAG_FS, NAME, NAME_FS, NOTE_FS, type Phase } from './model.ts';
import { art } from './name.art.ts';

export default function NameAnatomy() @{
	let phase = state('start');
	let spoken = state('');
	const label = computed(() => (phase === 'clean' ? '↺ show the marks' : '✎ erase the marks'));

	<figure class="anatomy">
		<svg class="scene" data-phase={phase} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true" style={'--code:' + CODE_FS + 'px;--flag:' + FLAG_FS + 'px;--name:' + NAME_FS + 'px;--note:' + NOTE_FS + 'px;--banner:' + BANNER_FS + 'px'}>
			<path class="pencil" d={art.sheet.pencil} />
			<path class="shadow-wash" d={art.sheet.shadow.wash} />
			<path class="hatch deep faint" d={art.sheet.shadow.far} />
			<path class="hatch deep light" d={art.sheet.shadow.mid} />
			<path class="hatch deep" d={art.sheet.shadow.near} />

			<path class="sheet" d={art.sheet.paper} />
			<path class="hatch faint" d={art.sheet.tone} />
			<path class="ink" d={art.sheet.edge} />
			<text class="file" transform={art.code.file.m}>{art.code.file.text}</text>
			<g class="code">
				@for (const tok of art.code.tokens; key tok.key) {
					<text class={'tok ' + tok.tone} transform={tok.m}>{tok.text}</text>
				}
			</g>

			<g class="marks">
				@for (const stop of art.scribbles.stops; key stop.key) {
					@for (const mark of stop.marks; key mark.key) {
						<path class="rub" d={mark.d} style={'--l:' + mark.length + ';--d:' + mark.from + 'ms;--t:' + (mark.to - mark.from) + 'ms'} />
					}
				}
				@for (const flag of art.flags; key flag.key) {
					<g class="peel" style={flag.peel.style}>
						<path class="hatch deep" d={flag.shadow} />
						<path class="tape" d={flag.tape} />
						<path class="hatch light" d={flag.tapeTone} />
						<path class="tab" d={flag.tab} />
						<path class="ink" d={flag.ink} />
						<text class="flag-text" transform={flag.m}>{flag.label}</text>
						<g class="grow" style={flag.cost.style}>
							@for (const row of flag.cost.lines; key row.key) {
								<text class="note" text-anchor={flag.cost.anchor} transform={row.m}>{row.text}</text>
							}
						</g>
					</g>
				}
				<g class="peel" style={art.card.peel.style}>
					<path class="hatch deep" d={art.card.shadow} />
					<path class="tab" d={art.card.paper} />
					<path class="ink thin" d={art.card.rule} />
					<path class="ink" d={art.card.ink} />
					@for (const row of art.card.lines; key row.key) {
						<text class={row.key === 0 ? 'card-text small' : 'card-text'} transform={row.m}>{row.text}</text>
					}
					<path class="tape" d={art.card.tape} />
					<path class="hatch light" d={art.card.tapeTone} />
					<path class="ink thin" d={art.card.tapeInk} />
				</g>
				<g class="peel" style={art.sticky.peel.style}>
					<path class="hatch deep" d={art.sticky.shadow} />
					<path class="tab" d={art.sticky.paper} />
					<path class="hatch light" d={art.sticky.curl} />
					<path class="ink" d={art.sticky.ink} />
					<text class="flag-text deps" transform={art.sticky.m}>{art.sticky.text}</text>
					<g class="grow" style={art.sticky.cost.style}>
						@for (const row of art.sticky.cost.lines; key row.key) {
							<text class="note" text-anchor={art.sticky.cost.anchor} transform={row.m}>{row.text}</text>
						}
					</g>
				</g>
				<g class="banner" style={'--d:' + art.banner.fade + 'ms'}>
					<g class="grow" style={art.banner.style}>
						@for (const row of art.banner.lines; key row.key) {
							<text class="banner-text" transform={row.m}>{row.text}</text>
						}
						<path class="red-line" d={art.banner.doodle} />
					</g>
				</g>
			</g>

			<g class="name">
				<g class="spot" style={'--w:' + art.name.washDelay + 'ms'}>
					<path class="wash yellow" d={art.name.spot.wash} />
					<path class="wash yellow pool" d={art.name.spot.pool} />
					<path class="wash-edge" d={art.name.spot.edge} />
				</g>
				@for (const glyph of art.name.glyphs; key glyph.key) {
					<text class="marker write" transform={glyph.m} style={'--d:' + glyph.delay + 'ms'}>{glyph.ch}</text>
				}
				<g class="after" style={'--w:' + art.name.washDelay + 'ms'}>
					<g class="grow" style={art.banner.style}>
						<path class="green-line" d={art.banner.clean.tick} />
						<text class="clean-text" transform={art.banner.clean.m}>{art.banner.clean.text}</text>
					</g>
				</g>
			</g>

			@for (const crumb of art.eraser.crumbs; key crumb.key) {
				<path class="crumb" d={crumb.d} style={crumb.style} />
			}
			<g class="eraser" style={art.eraser.style}>
				<path class="hatch deep" d={art.eraser.cast} />
				<path class="rubber" d={art.eraser.rubber} />
				<path class="hatch" d={art.eraser.side} />
				<path class="sleeve" d={art.eraser.sleeve} />
				<path class="hatch light" d={art.eraser.sleeveTone} />
				<path class="ink" d={art.eraser.ink} />
			</g>
		</svg>
		<p class="toggle-row">
			<button
				type="button"
				class="toggle"
				onClick={() => {
					const next: Phase = phase === 'clean' ? 'marks' : 'clean';
					phase = next;
					spoken = describe(next);
				}}
			>
				{label}
			</button>
		</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a sheet of paper on a desk with five lines of plain order code: let status equals state of Brewing, a
			paragraph showing status, and a button whose click sets status to Ready for pickup. At first the sheet is covered in red
			corrections, headed in red: other tools, rules on top of your code. Sticky tabs read dollar sign, mark it; use, call it first;
			dot value, unwrap it; set, can't just assign. A taped rule card says call me first, a sticky note listing status says list
			what it reads, and red pencil circles and arrows ring the code. A pink eraser rubs out the pencil, the tabs peel away, and the
			barista writes {NAME} across the top of the clean sheet, with a green tick and just your code where the red heading was. The
			code underneath never changes.
		</figcaption>
		<p class="sr" aria-live="polite">{spoken}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 45%, white);
				--tab: color-mix(in oklch, var(--paper) 25%, white);
				--shade: color-mix(in oklch, var(--ink) 16%, transparent);
				--shade-ink: var(--ink);
				--c-kw: #d73a49;
				--c-fn: #6f42c1;
				--c-str: #032f62;
				--c-tag: #22863a;
				--rubber: color-mix(in oklch, var(--pink) 75%, white);
				--crumb: color-mix(in oklch, var(--pink) 55%, var(--ink));
				--red: oklch(from var(--pink) calc(l - 0.22) calc(c + 0.05) calc(h + 25));
				--red-tab: color-mix(in oklch, var(--red) 10%, var(--tab));
				--green: oklch(from var(--green-star) calc(l - 0.3) c h);
				--halo: var(--paper);
				--blend: multiply;

				html.dark & {
					--sheet: oklch(27% 0.01 70);
					--tab: oklch(33% 0.01 70);
					--shade: rgb(0 0 0 / 0.5);
					--shade-ink: rgb(0 0 0 / 0.9);
					--c-kw: #f97583;
					--c-fn: #b392f0;
					--c-str: #9ecbff;
					--c-tag: #85e89d;
					--rubber: color-mix(in oklch, var(--pink) 80%, black);
					--crumb: color-mix(in oklch, var(--pink) 70%, white);
					--red: oklch(from var(--pink) calc(l - 0.04) calc(c + 0.02) calc(h + 22));
					--red-tab: color-mix(in oklch, var(--red) 14%, var(--tab));
					--green: var(--green-star);
					--blend: normal;
				}
			}

			.sheet {
				fill: var(--sheet);
			}

			.tab {
				fill: var(--tab);
			}

			.tape {
				fill: var(--tab);
				opacity: 0.6;
			}

			.ink {
				fill: var(--ink);
			}

			.thin {
				opacity: 0.7;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.3;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.tok,
			.file,
			.flag-text {
				font-family: var(--font-mono);
				font-variation-settings:
					'MONO' 1,
					'CASL' 1;
				font-weight: 600;
				white-space: pre;
				fill: var(--ink);
			}

			.tok {
				font-size: var(--code);
			}

			.file {
				font-size: 10px;
				opacity: 0.55;
			}

			.flag-text {
				font-size: var(--flag);
				font-weight: 700;
			}

			.deps {
				font-size: 13px;
			}

			.kw {
				fill: var(--c-kw);
			}

			.fn {
				fill: var(--c-fn);
			}

			.str {
				fill: var(--c-str);
			}

			.tag {
				fill: var(--c-tag);
			}

			.card-text,
			.marker {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.card-text {
				font-size: 15px;
				font-weight: 800;
			}

			.small {
				font-size: 10px;
				font-weight: 700;
				letter-spacing: 0.08em;
				opacity: 0.75;
			}

			.marker {
				font-size: var(--name);
				font-weight: 800;
			}

			.marks .tab {
				fill: var(--red-tab);
			}

			.marks .ink {
				fill: var(--red);
			}

			.marks :is(.flag-text, .card-text) {
				fill: var(--red);
			}

			.note,
			.banner-text,
			.clean-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 700;
				fill: var(--red);
				stroke: var(--halo);
				stroke-width: 3px;
				stroke-linejoin: round;
				paint-order: stroke;
			}

			.note {
				font-size: var(--note);
			}

			.banner-text,
			.clean-text {
				font-size: var(--banner);
				font-weight: 800;
			}

			.clean-text {
				fill: var(--green);
			}

			.red-line,
			.green-line {
				fill: none;
				stroke: var(--red);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.green-line {
				stroke: var(--green);
				stroke-width: 2.2;
			}

			@media (max-width: 560px) {
				.grow {
					scale: 1.35;
				}
			}

			.rub {
				fill: none;
				stroke: color-mix(in oklch, var(--red) 85%, transparent);
				stroke-width: 1.1;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: var(--blend);
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;

				html.dark & {
					opacity: 0.35;
				}
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.wash-edge {
				fill: none;
				stroke: oklch(72% 0.15 75);
				stroke-width: 1;
				opacity: 0.35;
				mix-blend-mode: var(--blend);
			}

			.rubber {
				fill: var(--rubber);
			}

			.sleeve {
				fill: var(--tab);
			}

			.crumb {
				fill: var(--crumb);
				opacity: 0;
				transform-box: fill-box;
				transform-origin: center;
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

			.scene[data-phase='clean'] :is(.peel, .rub, .banner) {
				opacity: 0;
			}

			.scene:not([data-phase='clean']) .name {
				opacity: 0;
			}

			.write {
				stroke: var(--ink);
				stroke-width: 0.3;
				stroke-dasharray: 60;
			}

			.toggle-row {
				display: flex;
				justify-content: flex-end;
				margin: 0;
			}

			.toggle {
				padding: 2px 6px;
				border: 0;
				background: none;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				font-weight: 600;
				text-decoration: underline wavy color-mix(in oklch, var(--ink) 35%, transparent);
				text-underline-offset: 4px;
				cursor: pointer;
				border-radius: 6px;
			}

			.toggle:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 3px;
			}

			@media (prefers-reduced-motion: no-preference) {
				.scene[data-phase='clean'] .rub {
					animation: rub-out var(--t) var(--d) linear both;
				}

				.scene[data-phase='clean'] .crumb {
					animation: blow 1700ms var(--d) ease-out both;
				}

				.scene[data-phase='clean'] .eraser {
					animation: rub 2500ms 300ms ease-in-out both;
				}

				.scene[data-phase='clean'] .peel {
					animation: peel 620ms var(--d) cubic-bezier(0.45, 0, 0.6, 1) both;
				}

				.scene[data-phase='clean'] .banner {
					animation: fade-out 400ms var(--d) ease-in both;
				}

				.scene[data-phase='clean'] .after {
					animation: wash-in 520ms var(--w) ease-out both;
				}

				.scene[data-phase='marks'] :is(.peel, .rub, .banner) {
					animation: stick-on 320ms ease-out both;
				}

				.scene[data-phase='clean'] .write {
					animation: write-in 420ms var(--d) ease-out both;
				}

				.scene[data-phase='clean'] .spot {
					animation: wash-in 520ms var(--w) ease-out both;
				}
			}

			@keyframes rub {
				0%,
				4% {
					transform: translate(0, 0);
				}

				14% {
					transform: translate(var(--s0x), var(--s0y));
				}

				16% {
					transform: translate(calc(var(--s0x) + 7px), calc(var(--s0y) - 2px));
				}

				18% {
					transform: translate(calc(var(--s0x) - 6px), calc(var(--s0y) + 2px));
				}

				20% {
					transform: translate(calc(var(--s0x) + 6px), calc(var(--s0y) - 1px));
				}

				22% {
					transform: translate(calc(var(--s0x) - 5px), calc(var(--s0y) + 2px));
				}

				24% {
					transform: translate(var(--s0x), var(--s0y));
				}

				32% {
					transform: translate(var(--s1x), var(--s1y));
				}

				34% {
					transform: translate(calc(var(--s1x) + 8px), calc(var(--s1y) - 1px));
				}

				36% {
					transform: translate(calc(var(--s1x) - 7px), calc(var(--s1y) + 1px));
				}

				38% {
					transform: translate(calc(var(--s1x) + 7px), var(--s1y));
				}

				40% {
					transform: translate(var(--s1x), var(--s1y));
				}

				48% {
					transform: translate(var(--s2x), var(--s2y));
				}

				50% {
					transform: translate(calc(var(--s2x) + 6px), calc(var(--s2y) - 2px));
				}

				52% {
					transform: translate(calc(var(--s2x) - 6px), calc(var(--s2y) + 2px));
				}

				54% {
					transform: translate(calc(var(--s2x) + 5px), var(--s2y));
				}

				56% {
					transform: translate(var(--s2x), var(--s2y));
				}

				64% {
					transform: translate(var(--s3x), var(--s3y));
				}

				66% {
					transform: translate(calc(var(--s3x) + 6px), calc(var(--s3y) - 2px));
				}

				68% {
					transform: translate(calc(var(--s3x) - 6px), calc(var(--s3y) + 1px));
				}

				70% {
					transform: translate(calc(var(--s3x) + 5px), var(--s3y));
				}

				72% {
					transform: translate(var(--s3x), var(--s3y));
				}

				86%,
				100% {
					transform: translate(0, 0);
				}
			}

			@keyframes rub-out {
				from {
					opacity: 1;
					stroke-dashoffset: 0;
				}

				to {
					stroke-dashoffset: calc(var(--l) * -1);
					opacity: 0;
				}
			}

			@keyframes blow {
				0% {
					opacity: 0;
					transform: none;
				}

				12%,
				40% {
					opacity: 1;
					transform: none;
				}

				100% {
					opacity: 0;
					transform: translate(var(--bx), var(--by)) rotate(var(--br));
				}
			}

			@keyframes peel {
				0% {
					opacity: 1;
					transform: none;
				}

				30% {
					opacity: 1;
					transform: translate(calc(var(--px) * 0.06), -3px) rotate(calc(var(--pr) * 0.15)) scale(1.04);
				}

				100% {
					opacity: 0;
					transform: translate(var(--px), var(--py)) rotate(var(--pr)) scale(1.08);
				}
			}

			@keyframes stick-on {
				from {
					opacity: 0;
					transform: translateY(-4px) scale(1.03);
				}
			}

			@keyframes write-in {
				from {
					stroke-dashoffset: 60;
					fill-opacity: 0;
					stroke-opacity: 0;
				}

				12% {
					stroke-opacity: 1;
				}

				60% {
					fill-opacity: 0;
				}

				to {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes fade-out {
				from {
					opacity: 1;
				}

				to {
					opacity: 0;
				}
			}

			@keyframes wash-in {
				from {
					opacity: 0;
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
