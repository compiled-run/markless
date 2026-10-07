// Conditionals page figure: the field leaves and returns with the branch while note stays above it.
import { computed, element, state } from '@markless/core';
import MugArt from '../../mascot/mug-art.tsrx';
import IndexCard from '../index-card.tsrx';
import InkArrow from '../ink-arrow.tsrx';
import MarkerCircle from '../marker-circle.tsrx';
import MarkerSweep from '../marker-sweep.tsrx';
import NoteDrawer from './note-drawer.tsrx';
import SketchAsk from './sketch-ask.tsrx';
import YourPage from './your-page.tsrx';
import { elementId } from './element-ids.ts';
import { afterUpdate, placeOver } from './place.ts';

export default function ConditionalsSketch() @{
	let toggles = state(0);
	let fieldShown = state<boolean>(false);
	let beat = state('rest');
	let typed = state(0);
	let saved = state('');
	let fieldTag = state('');
	let fieldAt = state('');
	let slot = element<HTMLDivElement>();
	const message = computed(() => {
		if (toggles === 0) return 'open it, type, close it, open it';
		if (fieldShown) return toggles > 2 && saved !== '' ? 'your note came back with it' : 'type a note, then close it';
		return saved !== '' ? 'the field left the page. your note did not' : 'the field left the page';
	});

	<figure class="concept-sketch">
		<SketchAsk ask="Where does the note go when you close it?" />

		<div class="board">
			<div class="code-side">
				<IndexCard label="note-drawer.tsrx" tilt="-1deg">
					<pre class="code"><span class="line"><span class="k">import</span>{' { '}<span class="f">state</span>{' } '}<span class="k">from</span>{' '}<span class="s">'@markless/core'</span>;</span><span class="line">{' '}</span><span class="line"><span class="k">export default function</span>{' '}<span class="f">NoteDrawer</span>{'() '}<span class="k">{'@{'}</span></span><span class="line">{'\t'}<span class="k">let</span>{' open = '}<span class="f">state</span>{'('}<span class="k">false</span>{');'}</span><span class="line">{'\t'}<span class="k">let</span>{' '}<span class="hit">note<MarkerSweep beat={typed > 0 && !fieldShown && toggles > 1 ? beat : 'rest'} place="" /></span>{' = '}<span class="f">state</span>{"('');"}</span><span class="line blank"><span class="note keeps" aria-hidden="true" data-shown={!fieldShown && toggles > 1 && saved !== '' ? 'true' : 'false'}>{"↑ still holds '" + saved + "'"}</span></span><span class="line">{'\t'}<span class="t">{'<section>'}</span></span><span class="line">{'\t\t'}<span class="t">{'<button'}</span>{' '}<span class="a">onClick</span>{'={() => '}<span class="hit">(open = !open)<MarkerCircle beat={beat} /></span>{'}'}<span class="t">{'>'}</span></span><span class="line">{'\t\t\tShow or hide'}</span><span class="line">{'\t\t'}<span class="t">{'</button>'}</span></span><span class="line">{'\t\t'}<span class="k">{'@if'}</span>{' (open) {'}</span><span class="line">{'\t\t\t'}<span class="t">{'<input'}</span></span><span class="line">{'\t\t\t\t'}<span class="a">aria-label</span>{'='}<span class="s">"Note"</span></span><span class="line">{'\t\t\t\t'}<span class="a">value</span>{'='}<span class="hit">{'{note}'}<MarkerSweep beat={fieldShown && toggles > 2 ? beat : 'rest'} place="" /></span></span><span class="line">{'\t\t\t\t'}<span class="a">onInput</span>{'={(event) => {'}</span><span class="line">{'\t\t\t\t\tnote = event.currentTarget.value;'}</span><span class="line">{'\t\t\t\t}}'}</span><span class="line">{'\t\t\t'}<span class="t">{'/>'}</span></span><span class="line">{'\t\t}'}</span><span class="line">{'\t\t'}<span class="t">{'<p>'}</span>{'Saved: {note}'}<span class="t">{'</p>'}</span></span><span class="line">{'\t'}<span class="t">{'</section>'}</span></span><span class="line"><span class="k">{'}'}</span></span><span class="branch" aria-hidden="true" data-state={toggles === 0 ? 'rest' : fieldShown ? 'on' : 'off'}><span class="tag">{fieldShown ? 'on the page' : 'off the page'}</span></span></pre>
				</IndexCard>
			</div>

			<div class="arrow across">
				<InkArrow width={60} height={120} x1={54} y1={6} x2={6} y2={112} bend={-14} seed={53} shown={toggles > 0 ? 'true' : 'false'} />
			</div>

			<div class="mug-spot">
				<MugArt
					variant="toc"
					mood={toggles === 0 ? 'idle' : fieldShown ? 'hello' : 'sleep'}
					face={fieldShown ? 'happy' : 'neutral'}
					glaze="cream"
					pour="rosetta"
					coaster="off"
					companion="off"
					paused="false"
					interacted={toggles > 0 ? 'true' : 'false'}
					reaction="rest"
				/>
			</div>

			<div class="live">
				<YourPage>
					<div
						class="slot"
						el={slot}
						onClick={(event) => {
							const target = event.target;
							const button = target instanceof Element ? target.closest('button') : null;
							if (!button) return;
							toggles++;
							beat = beat === 'odd' ? 'even' : 'odd';
							afterUpdate(() => {
								const field = slot ? slot.querySelector('input') : null;
								const text = slot?.querySelector('p')?.textContent ?? '';
								saved = text.replace(/^\s*Saved:\s*/, '').trim();
								fieldShown = field !== null;
								if (field) {
									const seen = elementId(field);
									fieldTag = seen.seen ? 'the same field' : toggles > 1 ? 'a new field, filled from note' : 'a new field';
									fieldAt = placeOver(slot, field, 3);
								}
							});
						}}
						onInput={() => {
							typed++;
							afterUpdate(() => {
								const text = slot?.querySelector('p')?.textContent ?? '';
								saved = text.replace(/^\s*Saved:\s*/, '').trim();
							});
						}}
					>
						<NoteDrawer />
						<span class="fresh" aria-hidden="true" data-shown={fieldShown ? 'true' : 'false'} style={fieldAt}><span>{fieldTag}</span></span>
					</div>
				</YourPage>
				<p class="note changes" aria-live="polite">{message}</p>
			</div>
		</div>

		<style>
			.concept-sketch {
				--sweep-delay: 260ms;
				container-type: inline-size;
				margin: var(--space-l) 0;
				padding: 0;
			}

			.board {
				position: relative;
				display: grid;
				grid-template-columns: 22rem minmax(0, 1fr);
				grid-template-areas:
					'code mug'
					'code live';
				grid-template-rows: auto 1fr;
				column-gap: 3rem;
				row-gap: var(--space-s);
				align-items: start;
				padding: 0.6rem 0 1.2rem 0.4rem;
			}

			.code-side {
				grid-area: code;
				position: relative;
			}

			pre {
				position: relative;
				margin: 0;
				padding: 0;
				overflow: visible;
				background: none;
				border: 0;
				font-family: var(--font-mono);
				font-size: 0.75rem;
				line-height: inherit;
				tab-size: 2;
				color: oklch(28% 0.015 90);
			}

			.line {
				display: block;
				position: relative;
				white-space: pre;
				min-height: 1lh;
			}

			.k {
				color: #cf222e;
			}

			.f {
				color: #6639ba;
			}

			.s {
				color: #0a3069;
			}

			.t {
				color: #116329;
			}

			.a {
				color: #0550ae;
			}

			.hit {
				position: relative;
				display: inline-block;
				text-indent: 0;
			}

			.note {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.1;
				text-indent: 0;
				transition: opacity 200ms ease 120ms, translate 260ms ease 120ms;
			}

			.note[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
				translate: 0 0.3rem;
			}

			.keeps {
				position: absolute;
				left: 1.6rem;
				top: 0.05rem;
				max-width: calc(100% - 1.6rem);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				rotate: -2deg;
			}

			.branch {
				position: absolute;
				left: 2.2rem;
				right: -0.4rem;
				top: calc(11 * 1.5rem + 0.1rem);
				height: calc(7 * 1.5rem - 0.2rem);
				border: 2px dashed transparent;
				border-radius: 6px;
				pointer-events: none;
				transition: background-color 240ms ease, border-color 240ms ease;
			}

			.branch[data-state='off'] {
				border-color: oklch(55% 0.2 0);
				background: repeating-linear-gradient(-45deg, transparent 0 7px, rgb(207 34 46 / 0.08) 7px 9px);
			}

			.branch[data-state='on'] {
				border-color: oklch(60% 0.14 148);
			}

			.tag {
				position: absolute;
				right: 0.4rem;
				top: -0.7rem;
				padding: 0 0.3rem;
				background: #fbf6e6;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				line-height: 1.2;
				white-space: nowrap;
				rotate: 2deg;
			}

			.branch[data-state='rest'] .tag {
				visibility: hidden;
			}

			.branch[data-state='off'] .tag {
				color: oklch(55% 0.2 0);
			}

			.branch[data-state='on'] .tag {
				color: oklch(45% 0.14 148);
			}

			.arrow {
				position: absolute;
				color: var(--ink);
				--ink-weight: 2.2;
			}

			.across {
				left: 20.4rem;
				top: 9.6rem;
				width: 5.5rem;
				height: 11rem;
			}

			.mug-spot {
				grid-area: mug;
				justify-self: end;
				position: relative;
				z-index: 1;
				margin: -0.6rem 1rem -1.8rem 0;
				zoom: 0.6;
				--gaze-x: -5px;
				--gaze-y: 5px;
			}

			.live {
				grid-area: live;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.slot {
				position: relative;
			}

			.slot:has(:focus-visible) {
				outline: 2.5px dashed var(--purple);
				outline-offset: 6px;
			}

			.fresh {
				position: absolute;
				pointer-events: none;
				transition: opacity 220ms ease;
			}

			.fresh[data-shown='false'] {
				visibility: hidden;
				opacity: 0;
			}

			.fresh span {
				position: absolute;
				right: -0.6rem;
				top: -0.9rem;
				padding: 0 0.3rem;
				background: var(--raised);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.2;
				white-space: nowrap;
				color: oklch(55% 0.2 0);
				rotate: 2deg;

				html.dark & {
					color: var(--pink);
				}
			}

			.changes {
				color: var(--ink);
				rotate: 1.2deg;
				padding-left: 0.4rem;
			}

			.changes::before {
				content: '↑ ';
			}

			@media (prefers-reduced-motion: reduce) {
				.note,
				.branch,
				.fresh {
					transition: none;
				}
			}

			@container (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					grid-template-areas:
						'code'
						'mug'
						'live';
					grid-template-rows: auto auto auto;
				}

				pre {
					font-size: 0.72rem;
				}

				.line {
					white-space: pre-wrap;
					padding-left: 2ch;
					text-indent: -2ch;
				}

				.across {
					display: none;
				}

				.mug-spot {
					margin: -0.4rem 0.4rem -1.6rem 0;
				}
			}
		</style>
	</figure>
}
