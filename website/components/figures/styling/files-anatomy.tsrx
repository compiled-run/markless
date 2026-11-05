// Two components both styling .card from their own files: change one file's colour and only its card repaints; move the rule into global.css and one colour paints both.
import { computed, state } from '@markless/core';
import { capture } from '../ink/pointer.ts';
import { COLOURS, describeRepaint, NAMES, nextColour, SCOPES, scrub } from './files-model.ts';
import { art } from './files.art.ts';

export default function FilesAnatomy() @{
	let c0 = state(0);
	let c1 = state(1);
	let cg = state(3);
	let shared = state(false);
	let scrubbing = state(-1);
	let fromX = state(0);
	let fromColour = state(0);
	let moved = state(false);
	let hovered = state(-1);
	let said = state('');
	const paint0 = computed(() => 'fill: ' + COLOURS[shared ? cg : c0]);
	const paint1 = computed(() => 'fill: ' + COLOURS[shared ? cg : c1]);
	const hoverLine = computed(() => (hovered < 0 ? '' : 'class="card ' + SCOPES[hovered] + '"'));

	<figure class="anatomy files-fig">
		<div class="sources">
				<div class="file">
					<svg class="frame" viewBox="0 0 300 200" aria-hidden="true">
						<path class="shadow" d={art.files[0].shadow} />
						<path class="page" d={art.files[0].page} />
						<path class="hatch" d={art.files[0].fold} />
						<path class="ink" d={art.files[0].ink} />
						<path class="ink faint" d={art.files[0].rule} />
					</svg>
					<p class="file-name">ProfileCard.tsrx</p>
					<div class={shared ? 'code moved' : 'code'}>
						<div class="tag">&lt;style&gt;</div>
						<div class="in1">.card &#123;</div>
						<div class="in2">background: <span
							class="swatch"
							tabindex="0"
							role="slider"
							aria-label="ProfileCard.tsrx background"
							aria-valuetext={NAMES[c0]}
							style={'--paint: ' + COLOURS[c0]}
							onPointerDown={(event) => {
								capture(event);
								scrubbing = 0;
								fromX = event.clientX;
								fromColour = c0;
								moved = false;
							}}
							onPointerMove={(event) => {
								if (scrubbing !== 0) return;
								const next = scrub(fromColour, fromX, event.clientX);
								if (next !== c0) {
									moved = true;
									c0 = next;
									said = describeRepaint(0, next);
								}
							}}
							onPointerUp={() => {
								scrubbing = -1;
							}}
							onClick={() => {
								if (moved) return;
								c0 = nextColour(c0);
								said = describeRepaint(0, c0);
							}}
							onKeyDown={(event) => {
								if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') c0 = nextColour(c0);
								else if (event.key === 'ArrowLeft') c0 = (c0 + COLOURS.length - 1) % COLOURS.length;
								else return;
								said = describeRepaint(0, c0);
							}}
						><svg viewBox="0 0 26 20" aria-hidden="true"><path class="blob" d={art.swatches[0].blob} /><path class="ink" d={art.swatches[0].ink} /></svg>{NAMES[c0]}</span>;</div>
						<div class="in1">&#125;</div>
						<div class="tag">&lt;/style&gt;</div>
					</div>
				</div>
				<div class="file">
					<svg class="frame" viewBox="0 0 300 200" aria-hidden="true">
						<path class="shadow" d={art.files[1].shadow} />
						<path class="page" d={art.files[1].page} />
						<path class="hatch" d={art.files[1].fold} />
						<path class="ink" d={art.files[1].ink} />
						<path class="ink faint" d={art.files[1].rule} />
					</svg>
					<p class="file-name">ProductCard.tsrx</p>
					<div class={shared ? 'code moved' : 'code'}>
						<div class="tag">&lt;style&gt;</div>
						<div class="in1">.card &#123;</div>
						<div class="in2">background: <span
							class="swatch"
							tabindex="0"
							role="slider"
							aria-label="ProductCard.tsrx background"
							aria-valuetext={NAMES[c1]}
							style={'--paint: ' + COLOURS[c1]}
							onPointerDown={(event) => {
								capture(event);
								scrubbing = 1;
								fromX = event.clientX;
								fromColour = c1;
								moved = false;
							}}
							onPointerMove={(event) => {
								if (scrubbing !== 1) return;
								const next = scrub(fromColour, fromX, event.clientX);
								if (next !== c1) {
									moved = true;
									c1 = next;
									said = describeRepaint(1, next);
								}
							}}
							onPointerUp={() => {
								scrubbing = -1;
							}}
							onClick={() => {
								if (moved) return;
								c1 = nextColour(c1);
								said = describeRepaint(1, c1);
							}}
							onKeyDown={(event) => {
								if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') c1 = nextColour(c1);
								else if (event.key === 'ArrowLeft') c1 = (c1 + COLOURS.length - 1) % COLOURS.length;
								else return;
								said = describeRepaint(1, c1);
							}}
						><svg viewBox="0 0 26 20" aria-hidden="true"><path class="blob" d={art.swatches[1].blob} /><path class="ink" d={art.swatches[1].ink} /></svg>{NAMES[c1]}</span>;</div>
						<div class="in1">&#125;</div>
						<div class="tag">&lt;/style&gt;</div>
					</div>
				</div>
				<div class="file">
					<svg class="frame" viewBox="0 0 300 200" aria-hidden="true">
						<path class="shadow" d={art.files[2].shadow} />
						<path class="page" d={art.files[2].page} />
						<path class="hatch" d={art.files[2].fold} />
						<path class="ink" d={art.files[2].ink} />
						<path class="ink faint" d={art.files[2].rule} />
					</svg>
					<p class="file-name">global.css</p>
					@if (shared) {
						<div class="code">
							<div>.card &#123;</div>
							<div class="in1">background: <span
								class="swatch"
								tabindex="0"
								role="slider"
								aria-label="global.css background"
								aria-valuetext={NAMES[cg]}
								style={'--paint: ' + COLOURS[cg]}
								onClick={() => {
									cg = nextColour(cg);
									said = describeRepaint('global', cg);
								}}
								onKeyDown={(event) => {
									if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') cg = nextColour(cg);
									else if (event.key === 'ArrowLeft') cg = (cg + COLOURS.length - 1) % COLOURS.length;
									else return;
									said = describeRepaint('global', cg);
								}}
							><svg viewBox="0 0 26 20" aria-hidden="true"><path class="blob" d={art.swatches[2].blob} /><path class="ink" d={art.swatches[2].ink} /></svg>{NAMES[cg]}</span>;</div>
							<div>&#125;</div>
						</div>
					} @else {
						<p class="code empty">(empty)</p>
					}
					<button
						type="button"
						class="move"
						onClick={() => {
							shared = !shared;
							said = shared ? 'Both .card rules moved into global.css: one colour now paints both cards.' : 'Each file has its own .card rule again.';
						}}
					>
						{shared ? '← back to each file' : '← move .card here'}
					</button>
				</div>
		</div>

		<div class="page-out">
			<div
				class="card-out"
				onPointerOver={() => {
					hovered = 0;
				}}
				onPointerOut={() => {
					hovered = -1;
				}}
			>
				<svg viewBox="0 0 270 130" aria-hidden="true">
					<path class="shadow" d={art.cards[0].shadow} />
					<path class="hatch" d={art.cards[0].shadowHatch} />
					<path class="face" style={paint0} d={art.cards[0].face} />
					<path class="ink" d={art.cards[0].ink} />
					<path class="ink" d={art.cards[0].avatar} />
					<text class="card-title" x="84" y="56">Ada Lovelace</text>
					<text class="card-sub" x="84" y="84">profile</text>
				</svg>
			</div>
			<div
				class="card-out"
				onPointerOver={() => {
					hovered = 1;
				}}
				onPointerOut={() => {
					hovered = -1;
				}}
			>
				<svg viewBox="0 0 270 130" aria-hidden="true">
					<path class="shadow" d={art.cards[1].shadow} />
					<path class="hatch" d={art.cards[1].shadowHatch} />
					<path class="face" style={paint1} d={art.cards[1].face} />
					<path class="ink" d={art.cards[1].ink} />
					<text class="card-title" x="24" y="56">House blend</text>
					<text class="card-sub" x="24" y="84">$14 · product</text>
				</svg>
			</div>
		</div>
		<p class="hover-line" aria-hidden="true"><code>{hoverLine}</code></p>
		<figcaption class="sr">
			Two inked source files, ProfileCard.tsrx and ProductCard.tsrx, each with a style block that sets .card's background, and an empty
			global.css. Below them, the page shows a profile card and a product card, each in its own file's colour. Press or drag a file's
			colour swatch, or focus it and use the arrow keys: only that file's card repaints. Hover a card to see its real class pair, card and
			the file's own mk- class. Move the .card rule into global.css, and one colour paints both cards.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.files-fig {
				margin: var(--space-m) 0;
				user-select: none;
			}

			.sources {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 0.9rem;
			}

			@container (max-width: 560px) {
				.sources {
					grid-template-columns: 1fr;
				}
			}

			.file {
				position: relative;
				aspect-ratio: 300 / 200;
				padding: 0.4rem 0.9rem 0.5rem 0.7rem;
			}

			.frame {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.file-name,
			.code,
			.move {
				position: relative;
			}

			.file-name {
				margin: 0 0 0.35rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.95rem;
				font-weight: 800;
			}

			.code {
				margin: 0;
				font-family: ui-monospace, 'SFMono-Regular', monospace;
				font-size: 0.8rem;
				line-height: 1.55;
				white-space: nowrap;
			}

			.in1 {
				padding-inline-start: 1.2em;
			}

			.in2 {
				padding-inline-start: 1.8em;
			}

			.moved {
				opacity: 0.35;
				text-decoration: line-through;
			}

			.empty {
				font-style: italic;
				opacity: 0.5;
			}

			.tag {
				opacity: 0.6;
			}

			.swatch {
				display: inline-flex;
				align-items: center;
				gap: 0.2rem;
				touch-action: none;
				cursor: ew-resize;
				outline: none;
				border-radius: 4px;
			}

			.swatch:hover,
			.swatch:focus-visible {
				background: color-mix(in oklch, var(--ink) 8%, transparent);
			}

			.swatch svg {
				width: 1.5em;
				height: 1.15em;
				overflow: visible;
			}

			.blob {
				fill: var(--paint);
			}

			.move {
				margin-top: 0.3rem;
				padding: 0.1rem 0.5rem;
				border: 1.5px solid var(--ink);
				border-radius: 6px 9px 7px 8px;
				background: var(--paper);
				color: var(--ink);
				font: 700 0.75rem 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.page-out {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 1.4rem;
				margin-top: 1.2rem;
				padding: 0 1.5rem;
			}

			.card-out {
				transition: transform 160ms ease;
			}

			.card-out:hover {
				transform: translateY(-4px) rotate(-0.6deg);
			}

			.card-out svg {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
			}

			.face {
				transition: fill 250ms ease;
			}

			.shadow {
				fill: color-mix(in oklch, var(--ink) 18%, transparent);
			}

			.page {
				fill: color-mix(in oklch, var(--paper) 55%, white);

				html.dark & {
					fill: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.ink {
				fill: var(--ink);
			}

			.faint {
				opacity: 0.4;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.card-title,
			.card-sub {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: #2d2a24;
			}

			.card-title {
				font-size: 22px;
				font-weight: 800;
			}

			.card-sub {
				font-size: 15px;
				opacity: 0.7;
			}

			.hover-line {
				min-height: 1.6em;
				margin: 0.5rem 0 0;
				text-align: center;
			}

			@media (prefers-reduced-motion: reduce) {
				.files-fig * {
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
