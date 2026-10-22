import type { Children } from '@markless/core';
import MugArt from './mug-art.tsrx';

// Lands the reader's saved studio choices on <html> before the mug below it paints, without waking the runtime.
// oxlint-disable-next-line no-unused-vars -- read by <script>{paintSavedMug}</script>
const paintSavedMug = `(()=>{const h=document.documentElement;for(const k of['glaze','pour','coaster','companion']){try{const v=localStorage.getItem('mascot-'+k);if(v!==null)h.setAttribute('data-mascot-'+k,v)}catch{}}})()`;

export default function MugSpot({
	mood,
	at,
	children,
}: {
	/** A studio pose such as `cheers`, `sleep`, `brew` or `bow`, or a face such as `scared` or `proud`. */
	readonly mood: string;
	/** `side` floats the mug beside the children, `peek` looks over the top edge of the code block or cards that follow. */
	readonly at?: string;
	readonly children?: Children;
}) @{
	<div class={'docs-mug is-' + (at ?? 'side')}>
		<style>
			.docs-mug {
				--mug-width: 5.75rem;
				--mug-height: 7.06rem;
				margin-block: var(--space-s);
			}
			.docs-mug.is-side {
				display: flow-root;
			}
			.is-side > .docs-mug-art + * {
				margin-top: 0;
			}
			.docs-mug.is-side > :last-child {
				margin-bottom: 0;
			}
			.docs-mug-art {
				display: block;
				width: var(--mug-width);
				height: var(--mug-height);
			}
			.is-side > .docs-mug-art {
				float: right;
				margin: -0.6rem 0 0.25rem var(--space-s);
			}
			/* The blocks a peek sits on (code, cards) open with a --space-m margin; this lands the cut on their top edge. */
			.is-peek {
				height: calc(var(--mug-height) * 0.8);
				margin-bottom: calc(-1 * var(--space-m));
				padding-left: var(--space-m);
				overflow: hidden;
			}
			@media (hover: hover) and (prefers-reduced-motion: no-preference) {
				.docs-mug-art:hover {
					animation: docs-mug-wiggle 700ms ease-in-out;
				}
			}
			@keyframes docs-mug-wiggle {
				0%,
				100% {
					transform: none;
				}
				25% {
					transform: rotate(-5deg);
				}
				60% {
					transform: rotate(4deg);
				}
			}
			@media (max-width: 40rem) {
				.docs-mug {
					--mug-width: 4.5rem;
					--mug-height: 5.52rem;
				}
				.is-peek {
					display: flex;
					justify-content: flex-end;
					padding-inline: 0 var(--space-m);
				}
			}
		</style>
		<span class="docs-mug-art" aria-hidden="true">
			<script>{paintSavedMug}</script>
			<MugArt
				variant="spot"
				mood={mood}
				face="neutral"
				glaze="cream"
				pour="rosetta"
				coaster="off"
				companion="off"
				paused="false"
				interacted="false"
			/>
		</span>
		{children}
	</div>
}
