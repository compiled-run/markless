// A playlist page beside a graph inspector showing the real graph the compiler records for it: press a button and watch the change run along its edges.
import { computed, state } from '@markless/core';
import { describePick, FIRST, heading, NEXT, NODE_NOTE, type NodeKey, SHUFFLE_SAID, START_SAID } from './model.ts';
import { art } from './inspector.art.ts';

export default function GraphAnatomy() @{
	let playing = state<string>(FIRST);
	let shuffle = state(false);
	let lit = state<string[]>([]);
	let beat = state('rest');
	let said = state(START_SAID);
	let hover = state('');
	let touched = state(false);
	const text = computed(() => heading(playing));
	const caption = computed(() => {
		if (hover === 'title') return 'Road trip: plain HTML, so it is not in the graph';
		if (hover === 'next') return 'Slow Train writes playing';
		if (hover === 'shuffleButton') return 'Shuffle writes shuffle';
		if (hover === 'pSpot') return 'this line is the one reader';
		if (hover === 'playing' || hover === 'heading' || hover === 'p' || hover === 'shuffle') return NODE_NOTE[hover as NodeKey];
		return 'Hover anything, then press Slow Train or Shuffle.';
	});
	const flash = () => (beat = beat === 'odd' ? 'even' : 'odd');
	const pick = (song: string) => {
		const before = playing;
		playing = song;
		lit = before === song ? [] : ['playing', 'e1', 'heading', 'e2', 'p', 'pSpot'];
		said = describePick(before, song);
		flash();
	};
	const toggleShuffle = () => {
		shuffle = !shuffle;
		lit = ['shuffle'];
		said = SHUFFLE_SAID;
		flash();
	};
	const reset = () => {
		playing = FIRST;
		shuffle = false;
		lit = [];
		said = START_SAID;
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
				hover = hover === 'next' ? '' : 'next';
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
			aria-label="A playlist and its state graph. Press Slow Train or Shuffle on the page, or a node in the graph. Enter presses Slow Train, S presses Shuffle, Escape starts again."
			onClick={(event) => {
				touched = true;
				const key = keyOf(event.target);
				if (key === 'shuffleButton' || key === 'shuffle') toggleShuffle();
				else if (key === 'playing') pick(playing === NEXT ? FIRST : NEXT);
				else if (key === 'heading' || key === 'p' || key === 'pSpot') said = NODE_NOTE[key === 'pSpot' ? 'p' : key];
				else if (key === 'title') said = 'Road trip is plain HTML. It is not in the graph, so nothing ever redraws it.';
				else pick(NEXT);
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 's' || event.key === 'S') toggleShuffle();
				if (event.key === 'Escape') reset();
			}}
		>
			<svg
				class="scene"
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerleave={() => (hover = '')}
			>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<g class="spot-on" data-on={lit.includes('pSpot') || hover === 'p' || hover === 'heading' || hover === 'playing' || hover === 'pSpot' ? 'yes' : 'no'}>
					<path class="wash yellow" d={art.pSpot.wash} />
				</g>
				<g class="spot-on" data-on={hover === 'shuffle' || hover === 'shuffleButton' ? 'yes' : 'no'}>
					<path class="wash yellow" d={art.shuffleSpot.wash} />
				</g>
				<g class="spot-on" data-on={hover === 'next' || hover === 'playing' ? 'yes' : 'no'}>
					<path class="wash yellow" d={art.nextSpot.wash} />
				</g>
				<text class="print" x={art.pText.x} y={art.pText.y}>{text}</text>
				<path class="hit" data-key="title" d={art.hits.title} />
				<path class="hit" data-key="pSpot" d={art.hits.p} />
				<path class="hit" data-key="next" d={art.hits.next} />
				<path class="hit" data-key="shuffleButton" d={art.hits.shuffle} />
				<path class="edge" data-lit={lit.includes('e1') ? 'yes' : 'no'} data-beat={beat} d={art.edges[0]!.d} />
				<path class="edge e2" data-lit={lit.includes('e2') ? 'yes' : 'no'} data-beat={beat} d={art.edges[1]!.d} />
				<g class="node" data-key="playing" data-lit={lit.includes('playing') ? 'yes' : 'no'} data-hover={hover === 'playing' ? 'yes' : 'no'} data-beat={beat}>
					<path class="paper" d={art.nodes[0]!.poly} />
					<g class="glow">
						<path class="wash yellow" d={art.nodes[0]!.spot.wash} />
					</g>
					<path class="ink" d={art.nodes[0]!.ink} />
					<text class="code" x={art.nodes[0]!.x} y={art.nodes[0]!.y}>playing</text>
				</g>
				<g class="node" data-key="heading" data-lit={lit.includes('heading') ? 'yes' : 'no'} data-hover={hover === 'heading' ? 'yes' : 'no'} data-beat={beat}>
					<path class="paper" d={art.nodes[1]!.poly} />
					<g class="glow">
						<path class="wash yellow" d={art.nodes[1]!.spot.wash} />
					</g>
					<path class="ink" d={art.nodes[1]!.ink} />
					<text class="code" x={art.nodes[1]!.x} y={art.nodes[1]!.y}>heading</text>
				</g>
				<g class="node" data-key="p" data-lit={lit.includes('p') ? 'yes' : 'no'} data-hover={hover === 'p' ? 'yes' : 'no'} data-beat={beat}>
					<path class="paper" d={art.nodes[2]!.poly} />
					<g class="glow">
						<path class="wash yellow" d={art.nodes[2]!.spot.wash} />
					</g>
					<path class="ink" d={art.nodes[2]!.ink} />
					<text class="code" x={art.nodes[2]!.x} y={art.nodes[2]!.y}>{'<p>'}</text>
				</g>
				<g class="node" data-key="shuffle" data-lit={lit.includes('shuffle') ? 'yes' : 'no'} data-hover={hover === 'shuffle' ? 'yes' : 'no'} data-beat={beat}>
					<path class="paper" d={art.nodes[3]!.poly} />
					<g class="glow">
						<path class="wash yellow" d={art.nodes[3]!.spot.wash} />
					</g>
					<path class="ink" d={art.nodes[3]!.ink} />
					<text class="code" x={art.nodes[3]!.x} y={art.nodes[3]!.y}>shuffle</text>
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>WRITTEN AT COMPILE TIME</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a playlist page called Road trip, with a line that says Now playing, a Slow Train button and a Shuffle
			button, beside a graph inspector. The graph has four nodes: playing, heading, the paragraph, and shuffle. An edge runs from playing
			to heading and from heading to the paragraph; shuffle has no edges. Press Slow Train, or Enter: the change runs along those two
			edges, node by node, and only the Now playing line changes. Press it again and nothing happens, because the value is the same.
			Press Shuffle, or S: shuffle changes, nothing reads it, and the page stays as it is. Escape starts again.
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

			.node {
				cursor: pointer;
			}

			.node[data-hover='yes'] .glow {
				opacity: 0.8;
			}

			.node[data-lit='yes'] .glow {
				opacity: 1;
			}

			.node[data-key='shuffle'] .code {
				opacity: 0.55;
			}

			.edge {
				fill: var(--sheet-ink);
				transition: fill 200ms ease;
			}

			.edge[data-lit='yes'] {
				fill: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.node[data-lit='yes'][data-beat='odd'],
			.edge[data-lit='yes'][data-beat='odd'] {
				animation: pop-a 500ms ease both;
			}

			.node[data-lit='yes'][data-beat='even'],
			.edge[data-lit='yes'][data-beat='even'] {
				animation: pop-b 500ms ease both;
			}

			.node[data-key='heading'],
			.edge {
				animation-delay: 150ms !important;
			}

			.e2,
			.node[data-key='p'] {
				animation-delay: 300ms !important;
			}

			@keyframes pop-a {
				from {
					opacity: 0.3;
				}
			}

			@keyframes pop-b {
				from {
					opacity: 0.3;
				}
			}
		</style>
	</figure>
}
