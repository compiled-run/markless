// The glossary as a visual index: a card per word with its sketch or ink mark, its one meaning and the pages that teach it, under a sticky A to Z rail and a filter box.
import { computed, state } from '@markless/core';
import { asset } from '../../site-base.ts';
import { ENTRIES, type GlossaryEntry, LETTERS } from './glossary-entries.ts';
import { INK_MARKS } from './ink-marks.ts';
import { art } from './term-art.ts';

/** The sketch slot of a card that shows an ink mark instead: nothing to draw. */
const NO_SKETCH = { paper: '', pink: '', hatch: '', cover: '', fine: '', ink: '', labels: [] as (typeof art.events.labels)[number][] };

/** One of a sketch's handwritten labels as a text and its placement; a sketch has at most four, and an empty slot draws nothing. */
const labelAt = (entry: GlossaryEntry, n: number) => {
	const label = (entry.sketch === '' ? undefined : art[entry.sketch].labels[n]) ?? { x: 0, y: 0, tilt: 0, text: '' };
	return { text: label.text, transform: 'translate(' + label.x + ' ' + label.y + ') rotate(' + label.tilt + ')' };
};

const words = (entry: GlossaryEntry) => (entry.term + ' ' + entry.parts.map((part) => part.prose + part.code).join('')).toLowerCase();

export default function GlossaryIndex() @{
	const marks = asset(INK_MARKS) + '#';
	let query = state('');
	let here = state('');
	const needle = computed(() => query.trim().toLowerCase());
	const hidden = computed(() => '|' + ENTRIES.filter((entry) => needle !== '' && !words(entry).includes(needle)).map((entry) => entry.id).join('|') + '|');
	const shown = computed(() => ENTRIES.filter((entry) => needle === '' || words(entry).includes(needle)).length);
	const sketchOf = (entry: GlossaryEntry) => (entry.sketch === '' ? NO_SKETCH : art[entry.sketch]);

	<div
		class="glossary-index"
		onVisible={() => {
			const read = () => {
				here = decodeURIComponent(location.hash.slice(1));
			};
			read();
			addEventListener('hashchange', read);
			return () => removeEventListener('hashchange', read);
		}}
	>
		<div class="rail">
			<label class="filter">
				<span class="sr">Filter the glossary</span>
				<input
					type="search"
					placeholder="Filter words"
					value={query}
					onInput={(event) => {
						query = (event.target as HTMLInputElement).value;
					}}
				/>
			</label>
			<nav class="letters" aria-label="Jump to a letter">
				@for (const item of LETTERS; key item.letter) {
					@if (item.to) {
						<a class="letter" href={'#' + item.to}>
							{item.letter}
						</a>
					} @else {
						<span class="letter none" aria-hidden="true">{item.letter}</span>
					}
				}
			</nav>
		</div>
		<p class="status" role="status">{needle === '' ? '' : shown === 0 ? 'No words match.' : shown + (shown === 1 ? ' word matches.' : ' words match.')}</p>
		<ul class="cards">
			@for (const entry of ENTRIES; key entry.id) {
				<li class={'card ink-card' + (hidden.includes('|' + entry.id + '|') ? ' hidden' : '') + (here === entry.id ? ' here' : '')} id={entry.id}>
					<svg class={entry.sketch ? 'sketch' : 'sketch off'} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
						<path class="paper" d={sketchOf(entry).paper} />
						<path class="pink" d={sketchOf(entry).pink} />
						<path class="hatch" d={sketchOf(entry).hatch} />
						<path class="paper" d={sketchOf(entry).cover} />
						<path class="fine" d={sketchOf(entry).fine} />
						<path class="ink" d={sketchOf(entry).ink} />
						<text class="hand" transform={labelAt(entry, 0).transform}>{labelAt(entry, 0).text}</text>
						<text class="hand" transform={labelAt(entry, 1).transform}>{labelAt(entry, 1).text}</text>
						<text class="hand" transform={labelAt(entry, 2).transform}>{labelAt(entry, 2).text}</text>
						<text class="hand" transform={labelAt(entry, 3).transform}>{labelAt(entry, 3).text}</text>
					</svg>
					<svg class={entry.sketch ? 'mark off' : 'mark'} viewBox="0 0 108 108" aria-hidden="true">
						<use href={marks + entry.icon} />
					</svg>
					<p class="term">{entry.term}</p>
					<p class="meaning">
						@for (const part of entry.parts; key part.key) {
							<span>
								{part.prose}
								<code>{part.code}</code>
							</span>
						}
					</p>
					<p class="used">
						<span class="label">Used in</span>
						@for (const page of entry.usedIn; key page.href) {
							<a href={page.href}>{page.title}</a>
						}
					</p>
				</li>
			}
		</ul>
		<style>
			.glossary-index {
				margin: var(--space-m) 0;
			}

			.rail {
				position: sticky;
				top: var(--header-height);
				z-index: 5;
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem 0.9rem;
				align-items: center;
				padding: 0.6rem 0 0.7rem;
				background: var(--paper);
				border-bottom: 1.5px solid var(--ink);
			}

			.filter input {
				box-sizing: border-box;
				width: 11rem;
				padding: 0.3em 0.6em;
				border: 1.5px solid var(--ink);
				border-radius: 8px 11px 9px 10px;
				background: transparent;
				color: var(--ink);
				font: inherit;
			}

			.filter input::placeholder {
				color: color-mix(in oklch, var(--ink) 50%, transparent);
			}

			.letters {
				display: flex;
				flex-wrap: wrap;
				gap: 0.1rem 0.35rem;
			}

			.letter {
				min-width: 1.2em;
				text-align: center;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 1.05rem;
				color: var(--ink);
				text-decoration: none;
			}

			a.letter:hover,
			a.letter:focus-visible {
				text-decoration: underline;
				text-decoration-color: var(--link-underline);
				text-decoration-thickness: 0.15em;
			}

			.none {
				opacity: 0.3;
			}

			.status {
				min-height: 1.5em;
				margin: 0.4rem 0 0;
				color: color-mix(in oklch, var(--ink) 70%, transparent);
			}

			.cards {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
				gap: var(--space-m) var(--space-s);
				margin: var(--space-s) 0 0;
				padding: 0;
				list-style: none;
			}

			.card {
				margin: 0;
				scroll-margin-top: calc(var(--header-height) + 8.5rem);
			}

			.card:target,
			.card.here {
				outline: 3px solid color-mix(in oklch, var(--yellow) 90%, transparent);
				outline-offset: 6px;
				border-radius: 10px;
			}

			.hidden,
			.off {
				display: none;
			}

			.mark {
				width: 2.6rem;
				height: 2.6rem;
				color: var(--ink);
				overflow: visible;
			}

			.sketch {
				width: 9rem;
				height: auto;
				overflow: visible;
			}

			.sketch .paper {
				fill: var(--paper);
				stroke: var(--paper);
			}

			.sketch .pink {
				fill: var(--pink);
				stroke: var(--pink);
				stroke-width: 1.2;
				opacity: 0.55;

				html.dark & {
					opacity: 0.85;
				}
			}

			.sketch .hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.8;
				stroke-linecap: round;
			}

			.sketch .ink {
				fill: var(--ink);
			}

			.sketch .fine {
				fill: var(--ink);
				opacity: 0.75;
			}

			.sketch .hand {
				fill: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 12.5px;
				font-weight: 800;
			}

			.term {
				margin: 0.35rem 0 0;
				font-family: var(--font-mono);
				font-size: 1.05rem;
				font-weight: 700;
				line-height: 1.35;
			}

			.meaning {
				margin: 0.25rem 0 0;
			}

			.meaning code:empty {
				display: none;
			}

			.meaning code {
				padding: 0.05em 0.3em;
				border-radius: 4px;
				background: var(--code-surface);
				font-family: var(--font-mono);
				font-size: 0.9em;
			}

			.used {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 0.6rem;
				margin: 0.5rem 0 0;
				font-size: 0.9rem;
			}

			.label {
				color: color-mix(in oklch, var(--ink) 65%, transparent);
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
	</div>
}
