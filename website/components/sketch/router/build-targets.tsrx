// "Where does the build go?" One app folder, two build commands, two output
// folders. Pressing a command draws its output; the app folder never changes.
import { state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import SketchAsk from '../start/sketch-ask.tsrx';

export default function BuildTargets() @{
	let node = state(false);
	let vercel = state(false);
	let builds = state(0);
	let nodeBeat = state('rest');
	let vercelBeat = state('rest');
	let say = state('press a command');

	<figure class="sketch">
		<SketchAsk text="Where does the build go?" />

		<div class="board">
			<div class="app">
				<IndexCard label="my-app/" tilt="-1.4deg">
					<ul class="tree">
						<li>pages/</li>
						<li>api/</li>
						<li>middleware/</li>
					</ul>
				</IndexCard>
				<p class="same" data-shown={builds > 0 ? 'true' : 'false'}><span class="hit">same folder<MarkerCircle beat={builds === 0 ? 'rest' : builds % 2 === 0 ? 'even' : 'odd'} /></span>{' every time'}</p>
			</div>

			<div class="route one">
				<button
					type="button"
					class="cmd"
					aria-pressed={node ? 'true' : 'false'}
					onClick={() => {
						node = true;
						builds++;
						nodeBeat = nodeBeat === 'odd' ? 'even' : 'odd';
						say = vercel ? 'same app, two outputs' : 'a Node server, in .output/';
					}}
				>npm run build</button>
				<div class="arrow">
					<InkArrow width={120} height={40} x1={4} y1={22} x2={114} y2={18} bend={-6} seed={61} shown={node ? 'true' : 'false'} />
				</div>
			</div>

			<div class="out one" data-built={node ? 'true' : 'false'}>
				<div class="card">
					<IndexCard label=".output/" pin="pin" tilt="1.2deg">
						<ul class="tree">
							<li>server/index.mjs</li>
							<li>public/build/</li>
						</ul>
					</IndexCard>
				</div>
				<p class="kind"><span class="hit">a Node server<MarkerSweep beat={nodeBeat} place="" /></span></p>
				<p class="empty" aria-hidden="true">not built yet</p>
			</div>

			<div class="route two">
				<button
					type="button"
					class="cmd"
					aria-pressed={vercel ? 'true' : 'false'}
					onClick={() => {
						vercel = true;
						builds++;
						vercelBeat = vercelBeat === 'odd' ? 'even' : 'odd';
						say = node ? 'same app, two outputs' : 'Vercel files, in .vercel/output/';
					}}
				>NITRO_PRESET=vercel npm run build</button>
				<div class="arrow">
					<InkArrow width={120} height={40} x1={4} y1={18} x2={114} y2={24} bend={6} seed={67} shown={vercel ? 'true' : 'false'} />
				</div>
			</div>

			<div class="out two" data-built={vercel ? 'true' : 'false'}>
				<div class="card">
					<IndexCard label=".vercel/output/" pin="pin" tilt="-0.8deg">
						<ul class="tree">
							<li>static/</li>
							<li>functions/</li>
						</ul>
					</IndexCard>
				</div>
				<p class="kind"><span class="hit">ready for Vercel<MarkerSweep beat={vercelBeat} place="" /></span></p>
				<p class="empty" aria-hidden="true">not built yet</p>
			</div>
		</div>

		<div class="footer">
			<p class="note" aria-live="polite">{say}</p>
			<span class="mug-spot">
				<MugArt
					variant="toc"
					mood={builds === 0 ? 'idle' : builds % 2 === 0 ? 'wiggle' : 'wide'}
					face="neutral"
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={builds > 0 ? 'true' : 'false'}
					reaction="rest"
				/>
			</span>
		</div>

		<style>
			.sketch {
				--sweep-delay: 520ms;
				--circle-delay: 200ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				display: grid;
				grid-template-columns: 10rem minmax(0, 1fr) 11.5rem;
				grid-template-areas:
					'app one-route one-out'
					'app two-route two-out';
				column-gap: 0.8rem;
				row-gap: 1.6rem;
				align-items: center;
				padding: 0.8rem 0.4rem 0.4rem;
			}

			.app {
				grid-area: app;
				display: grid;
				gap: 0.8rem;
			}

			.route.one {
				grid-area: one-route;
			}

			.route.two {
				grid-area: two-route;
			}

			.out.one {
				grid-area: one-out;
			}

			.out.two {
				grid-area: two-out;
			}

			.tree {
				margin: 0;
				padding: 0.1rem 0 0 0.2rem;
				list-style: none;
				font-family: var(--font-mono);
				font-size: 0.8rem;
				color: oklch(28% 0.015 90);
			}

			.tree li {
				margin: 0;
				white-space: nowrap;
			}

			.tree li::before {
				content: '└ ' / '';
				opacity: 0.55;
			}

			.hit {
				position: relative;
				display: inline-block;
			}

			.same,
			.kind,
			.empty,
			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				line-height: 1.15;
			}

			.same {
				font-size: var(--step-0);
				color: var(--ink);
				rotate: 1.5deg;
				text-align: center;
			}

			.same[data-shown='false'] {
				visibility: hidden;
			}

			.route {
				display: grid;
				justify-items: center;
				gap: 0.2rem;
				min-width: 0;
			}

			.cmd {
				max-width: 100%;
				padding: 0.3em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 4px;
				background: var(--slab);
				color: var(--slab-ink);
				font-family: var(--font-mono);
				font-size: 0.76rem;
				line-height: 1.3;
				overflow-wrap: anywhere;
				box-shadow: 2px 3px 0 var(--pink);
				cursor: pointer;
				rotate: -1deg;
				font-variant-ligatures: none;
			}

			.cmd::before {
				content: '$ ' / '';
				color: var(--green-star);
			}

			.cmd:active {
				translate: 2px 3px;
				box-shadow: none;
			}

			.cmd[aria-pressed='true'] {
				box-shadow: 2px 3px 0 var(--green-star);
			}

			.cmd:focus-visible {
				outline: 2.5px dashed var(--purple);
				outline-offset: 4px;
			}

			.route.two .cmd {
				rotate: 0.8deg;
			}

			.arrow {
				width: 100%;
				height: 2.4rem;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.out {
				position: relative;
				display: grid;
				gap: 0.5rem;
			}

			.kind {
				font-size: var(--step-0);
				color: var(--ink);
				text-align: center;
				rotate: -1deg;

				html.dark & {
					--sweep-blend: overlay;
				}
			}

			.empty {
				position: absolute;
				inset: 0;
				display: none;
				place-items: center;
				border: 2px dashed color-mix(in oklch, var(--ink) 35%, transparent);
				border-radius: 6px;
				font-size: var(--step-0);
				color: color-mix(in oklch, var(--ink) 55%, transparent);
			}

			.out[data-built='false'] > :not(.empty) {
				visibility: hidden;
			}

			.out[data-built='false'] .empty {
				display: grid;
			}

			.footer {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 1rem;
				margin-top: 0.4rem;
			}

			.note {
				font-size: var(--step-0);
				color: var(--ink);
				rotate: -1deg;
			}

			.mug-spot {
				zoom: 0.4;
				--gaze-x: -6px;
				--gaze-y: -4px;
			}

			@container (max-width: 36rem) {
				.board {
					grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
					grid-template-areas:
						'app app'
						'one-route two-route'
						'one-out two-out';
					row-gap: 0.8rem;
				}

				.app {
					justify-self: center;
					width: 12rem;
				}

				.arrow {
					width: 2.4rem;
					height: 2.4rem;
					rotate: 90deg;
				}

				.out .tree {
					font-size: 0.7rem;
				}
			}
		</style>
	</figure>
}
