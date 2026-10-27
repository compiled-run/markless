import { tooltip } from '@markless/ui';
import { art } from './term-art.ts';
import { captionOf } from './term-glossary.ts';

/** A word in running text that shows a small ink sketch of what it means. `word` must be a key of the glossary in term-glossary.ts. */
export default function Term({ word }: { readonly word: string }) @{
	const caption = captionOf(word);
	const sketch = word === 'events' ? art.events : art.elements;

	<tooltip.root class="term">
		<tooltip.trigger class="word">{word}</tooltip.trigger>
		<tooltip.content class="tip" data-term={word}>
			<svg class="sketch" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="paper" d={sketch.paper} />
				<path class="pink" d={sketch.pink} />
				<path class="hatch" d={sketch.hatch} />
				<path class="paper" d={sketch.cover} />
				<path class="fine" d={sketch.fine} />
				<path class="ink" d={sketch.ink} />
				@for (const label of sketch.labels; key label.key) {
					<text class="hand" x={label.x} y={label.y} transform={'rotate(' + label.tilt + ' ' + label.x + ' ' + label.y + ')'}>{label.text}</text>
				}
			</svg>
			<span class="caption">{caption}</span>
		</tooltip.content>
		<style>
			.term {
				display: inline;
			}

			.word {
				display: inline;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				font: inherit;
				text-decoration: underline dotted var(--ink);
				text-decoration-thickness: 1.5px;
				text-underline-offset: 0.2em;
				cursor: help;
			}

			.word:hover,
			.word[ui-open] {
				text-decoration-style: solid;
			}

			.word:focus-visible {
				border-radius: 3px;
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.tip {
				z-index: 40;
				box-sizing: border-box;
				width: min(15rem, calc(100vw - 2rem));
				margin: 0;
				padding: 0.6rem 0.75rem 0.7rem;
				border: var(--tip-border);
				border-radius: var(--tip-radius);
				background: var(--paper);
				box-shadow: var(--tip-shadow);
				color: var(--ink);
				font-family: var(--tip-font);
				font-size: var(--step--1);
				line-height: 1.4;
				opacity: 1;
				text-align: start;
				position-area: block-end span-inline-end;
				position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
				margin-block: 0.4rem;
			}

			/* Bridges the gap to the word, so a pointer crossing it never leaves the term. */
			.tip::before {
				content: '';
				position: absolute;
				inset: -0.6rem 0;
				z-index: -1;
			}

			.tip:is([ui-closed], [hidden]) {
				display: none;
			}

			.sketch {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
			}

			.paper {
				fill: var(--paper);
				stroke: var(--paper);
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				stroke-width: 1.2;
				opacity: 0.55;

				html.dark & {
					opacity: 0.85;
				}
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.8;
				stroke-linecap: round;
			}

			.ink {
				fill: var(--ink);
			}

			.fine {
				fill: var(--ink);
				opacity: 0.75;
			}

			.hand {
				fill: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 12.5px;
				font-weight: 800;
			}

			.caption {
				margin: 0.4rem 0 0;
				color: var(--ink);
			}
		</style>
	</tooltip.root>
}
