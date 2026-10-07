// "What does one write wake?" as a zine page: a real mini page with two states
// and a computed, the graph drawn beside it, and marker ink only on the paths a
// write reaches.
import { computed, state } from '@markless/core';
import IndexCard from '../index-card.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import RoughBox from './rough-box.tsrx';
import Wire from './wire.tsrx';

export default function StateGraphSketch() @{
	let count = state(2);
	let label = state('Mugs');
	const doubled = computed(() => count * 2);
	let writes = state(0);
	let last = state('none');
	const beat = computed(() => (writes % 2 === 0 ? 'even' : 'odd'));
	const countBeat = computed(() => (last === 'count' ? beat : 'rest'));
	const labelBeat = computed(() => (last === 'label' ? beat : 'rest'));
	const sameBeat = computed(() => (last === 'same' ? beat : 'rest'));

	<figure class="sketch">
		<figcaption>
			<span class="ask">What does one write wake?</span>
			<svg class="underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
				<path d="M3 9.5 C 60 5.2 120 10.8 180 7.4 C 225 5 262 8.6 297 6.2" />
			</svg>
		</figcaption>

		<div class="board">
			<p class="head graph-head" aria-hidden="true">the graph</p>
			<p class="head page-head" aria-hidden="true"><span class="dots"><i></i><i></i><i></i></span>your page</p>

			<div class="node row-a" style="--circle-delay: 0ms">
				<RoughBox shape="b" />
				<span class="id">state:label</span>
				<MarkerCircle beat={labelBeat} tone="purple" />
			</div>
			<div class="node row-b" style="--circle-delay: 0ms">
				<RoughBox shape="a" />
				<span class="id">state:count</span>
				<MarkerCircle beat={countBeat} />
				<span class="same-note" data-beat={sameBeat} aria-hidden="true">same value: stop</span>
			</div>
			<div class="node row-c computed" style="--circle-delay: 420ms">
				<span class="down" style="--wire-delay: 150ms"><Wire beat={countBeat} way="down" /></span>
				<RoughBox shape="c" />
				<span class="id">computed:doubled</span>
				<MarkerCircle beat={countBeat} />
				<span class="stale" data-beat={countBeat} aria-hidden="true">stale, recomputed</span>
			</div>

			<span class="link row-a" style="--wire-delay: 180ms"><Wire beat={labelBeat} tone="purple" /></span>
			<span class="link row-b" style="--wire-delay: 180ms"><Wire beat={countBeat} /></span>
			<span class="link row-c" style="--wire-delay: 520ms"><Wire beat={countBeat} /></span>

			<div class="page">
				<RoughBox shape="a" />
				<p class="slot line-a title">
					<span class="spot" style="--sweep-delay: 480ms">{label}<MarkerSweep beat={labelBeat} tone="purple" place="" /></span>
				</p>
				<p class="slot line-b">
					count <span class="spot" style="--sweep-delay: 480ms">{count}<MarkerSweep beat={countBeat} place="" /></span>
				</p>
				<p class="slot line-c">
					doubled <span class="spot" style="--sweep-delay: 780ms">{doubled}<MarkerSweep beat={countBeat} place="" /></span>
				</p>
			</div>
		</div>

		<div class="writes">
			<p class="try" aria-hidden="true">try a write:</p>
			<button
				type="button"
				data-act="count"
				onClick={() => {
					count++;
					last = 'count';
					writes++;
				}}
			>
				count++
			</button>
			<button
				type="button"
				data-act="label"
				onClick={() => {
					label = label === 'Mugs' ? 'Cups' : 'Mugs';
					last = 'label';
					writes++;
				}}
			>
				{label === 'Mugs' ? "label = 'Cups'" : "label = 'Mugs'"}
			</button>
			<button
				type="button"
				data-act="same"
				onClick={() => {
					// oxlint-disable-next-line no-self-assign -- the figure writes the same value on purpose
					count = count;
					last = 'same';
					writes++;
				}}
			>
				count = {count}
			</button>
		</div>

		<div class="after">
			<div class="journal">
				<IndexCard label="journal for this flush" tilt="-1deg" pin="pin">
					<ul class="entries" data-last={last}>
						<li class="none">nothing written yet</li>
						<li class="on-count"><b>setText</b> count → {'"' + count + '"'}</li>
						<li class="on-count"><b>setText</b> doubled → {'"' + doubled + '"'}</li>
						<li class="on-label"><b>setText</b> label → {'"' + label + '"'}</li>
						<li class="on-same">empty: no flush ran</li>
					</ul>
				</IndexCard>
			</div>
			<p class="note" aria-live="polite">
				{last === 'count'
					? 'count changed, so doubled went stale and recomputed. Two text nodes changed. The label path stayed dark.'
					: last === 'label'
						? 'label changed. Only the heading reads it, so count and doubled stayed asleep.'
						: last === 'same'
							? 'Same value. Object.is says equal, so nothing is marked dirty and no flush runs.'
							: 'Each write lights only the paths that read it.'}
			</p>
		</div>

		<style>
			.sketch {
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0 0.4rem;
			}

			figcaption {
				position: relative;
				width: fit-content;
				margin: 0 auto var(--space-m);
				rotate: -1.5deg;
			}

			.ask {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				font-weight: 700;
				line-height: 1.15;
				color: var(--ink);
			}

			.underline {
				display: block;
				width: 100%;
				height: 0.55em;
				margin-top: -0.1em;
				fill: none;
				stroke: var(--pink);
				stroke-width: 4;
				stroke-linecap: round;
			}

			.board {
				display: grid;
				grid-template-columns: max-content minmax(2rem, 1fr) minmax(0, 15rem);
				grid-template-rows: auto repeat(3, 3.4rem);
				row-gap: 0.8rem;
				align-items: center;
				padding: 0 0.6rem;
				color: var(--ink);
			}

			.head {
				grid-row: 1;
				margin: 0 0 -0.2rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--muted-ink);
			}

			.graph-head {
				grid-column: 1;
				rotate: -2deg;
			}

			.page-head {
				grid-column: 3;
				display: flex;
				align-items: center;
				gap: 0.5rem;
			}

			.dots {
				display: inline-flex;
				gap: 0.25rem;
			}

			.dots i {
				width: 0.55rem;
				height: 0.55rem;
				border: 1.5px solid var(--ink);
				border-radius: 50%;
			}

			.dots i:nth-child(1) {
				background: var(--pink);
			}

			.dots i:nth-child(2) {
				background: var(--yellow);
			}

			.dots i:nth-child(3) {
				background: var(--green-star);
			}

			.row-a {
				grid-row: 2;
			}

			.row-b {
				grid-row: 3;
			}

			.row-c {
				grid-row: 4;
			}

			.line-a {
				grid-row: 1;
			}

			.line-b {
				grid-row: 2;
			}

			.line-c {
				grid-row: 3;
			}

			.node {
				grid-column: 1;
				position: relative;
				justify-self: start;
				height: 2.2rem;
				display: flex;
				align-items: center;
				padding: 0 0.7rem;
				--box-fill: var(--raised);
			}

			.id {
				position: relative;
				font-family: var(--font-mono);
				font-size: 0.78rem;
				white-space: nowrap;
			}

			.computed {
				--box-fill: color-mix(in oklch, var(--green-star) 20%, var(--raised));
			}

			.down {
				position: absolute;
				left: 1.6rem;
				bottom: 100%;
				height: 2rem;
				width: 1.2rem;
			}

			.same-note,
			.stale {
				position: absolute;
				left: calc(100% + 0.3rem);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				transition: opacity 200ms ease 500ms;
			}

			.same-note {
				top: -1.25rem;
				left: 2.2rem;
				rotate: -4deg;
			}

			.stale {
				top: 2.5rem;
				left: 0.4rem;
				rotate: -2deg;
			}

			.same-note[data-beat='rest'],
			.stale[data-beat='rest'] {
				visibility: hidden;
				opacity: 0;
			}

			.link {
				grid-column: 2;
				height: 1.2rem;
				padding: 0 0.15rem 0 0.3rem;
			}

			.page {
				grid-column: 3;
				grid-row: 2 / 5;
				align-self: stretch;
				position: relative;
				display: grid;
				grid-template-rows: subgrid;
				align-items: center;
				margin: -0.4rem 0;
				padding: 0 0.9rem;
				box-shadow: 4px 4px 0 var(--purple);
				--box-fill: var(--raised);
				--box-weight: 2.2;
			}

			.slot {
				position: relative;
				margin: 0;
				font-size: var(--step-0);
				line-height: 1.2;
			}

			.title {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
				font-weight: 700;
			}

			.spot {
				position: relative;
				display: inline-block;
				min-width: 1ch;
			}

			.writes {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.7rem 0.9rem;
				margin: var(--space-m) 0 0;
				padding: 0 0.6rem;
			}

			.try {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				color: var(--ink);
				rotate: -2deg;
			}

			button {
				font-family: var(--font-mono);
				font-size: 0.85rem;
				padding: 0.3em 0.8em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}

			button:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.after {
				display: grid;
				grid-template-columns: minmax(0, 17rem) minmax(0, 1fr);
				gap: 1.6rem;
				align-items: start;
				margin-top: var(--space-m);
				padding: 0 0.6rem;
			}

			.entries {
				margin: 0;
				padding: 0;
				list-style: none;
				font-family: var(--font-mono);
				font-size: 0.78rem;
				line-height: 1.5rem;
			}

			.entries li {
				display: none;
				margin: 0;
				padding: 0;
			}

			.entries b {
				color: #cf222e;
				font-weight: 600;
			}

			.entries[data-last='none'] .none,
			.entries[data-last='count'] .on-count,
			.entries[data-last='label'] .on-label,
			.entries[data-last='same'] .on-same {
				display: block;
			}

			.note {
				margin: 0.6rem 0 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.25;
				color: var(--ink);
				rotate: 1deg;
			}

			.note::before {
				content: '← ';
			}

			@container (max-width: 34rem) {
				.ask {
					font-size: var(--step-1);
				}

				.board {
					grid-template-columns: max-content minmax(1.2rem, 1fr) minmax(0, 9.5rem);
					padding: 0;
				}

				.id {
					font-size: 0.68rem;
				}

				.node {
					padding: 0 0.45rem;
				}

				.page {
					padding: 0 0.6rem;
				}

				.slot {
					font-size: var(--step--1);
				}

				.title {
					font-size: var(--step-0);
				}

				.writes,
				.after {
					padding: 0;
				}

				.after {
					grid-template-columns: minmax(0, 1fr);
				}

				.note::before {
					content: '↑ ';
				}
			}
		</style>
	</figure>
}
