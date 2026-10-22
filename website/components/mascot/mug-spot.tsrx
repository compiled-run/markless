import MugArt from './mug-art.tsrx';

// Lands the reader's saved studio choices on <html> before the mug below it paints, without waking the runtime.
// oxlint-disable-next-line no-unused-vars -- read by <script>{paintSavedMug}</script>
const paintSavedMug = `(()=>{const h=document.documentElement;for(const k of['glaze','pour','coaster','companion']){try{const v=localStorage.getItem('mascot-'+k);if(v!==null)h.setAttribute('data-mascot-'+k,v)}catch{}}})()`;

export default function MugSpot({
	mood,
	at,
	from,
	react,
}: {
	/** A studio pose such as `cheers`, `sleep`, `brew` or `bow`, or a face such as `scared` or `proud`. */
	readonly mood: string;
	/** How much of him clears the edge of the block that follows: `peek` shows his face, `eyes` only the rim and eyes, `bottom` peeks his eyes over the pager line at the end of a page. */
	readonly at?: string;
	/** Which end of the edge he hides behind: `right` or `left`. */
	readonly from?: string;
	/** `duck`: he rises as the spot scrolls in, then sinks back down as you look at him. */
	readonly react?: string;
}) @{
	<div
		class={'docs-mug is-' + (at ?? 'peek') + ' from-' + (from ?? 'right') + ' react-' + (react ?? 'rise')}
		aria-hidden="true"
	>
		<style>
			/* The blocks a spot stands on (code, cards, callouts, figures) open with a --space-m margin, the pager with --space-xl; the negative margin lands the cut on that edge. */
			.docs-mug {
				--mug-width: 5.75rem;
				--mug-height: 7.06rem;
				--show: 0.78;
				display: flex;
				justify-content: flex-end;
				height: calc(var(--mug-height) * var(--show));
				margin-top: var(--space-xs);
				margin-bottom: calc(-1 * var(--space-m));
				padding-inline: var(--space-l);
				overflow: clip;
			}
			.is-eyes {
				--show: 0.64;
			}
			.is-bottom {
				--show: 0.7;
				margin-bottom: calc(-1 * var(--space-xl));
			}
			.from-left {
				justify-content: flex-start;
			}
			.docs-mug-art {
				flex: none;
				width: var(--mug-width);
				height: var(--mug-height);
			}
			.from-left .docs-mug-art {
				rotate: 4deg;
			}
			.from-right .docs-mug-art {
				rotate: -4deg;
			}
			@media (prefers-reduced-motion: no-preference) {
				@supports (animation-timeline: view()) {
					.docs-mug-art {
						animation: docs-mug-rise linear both;
						animation-timeline: view();
						animation-range: entry 10% entry 100%;
					}
					.react-duck .docs-mug-art {
						animation-name: docs-mug-duck;
						animation-range: entry 10% cover 70%;
					}
				}
				@media (hover: hover) {
					.docs-mug:hover .docs-mug-art svg {
						animation: docs-mug-wiggle 700ms ease-in-out;
					}
				}
			}
			@keyframes docs-mug-rise {
				from {
					translate: 0 72%;
				}
				to {
					translate: 0 0;
				}
			}
			@keyframes docs-mug-duck {
				0% {
					translate: 0 72%;
				}
				15%,
				55% {
					translate: 0 0;
				}
				100% {
					translate: 0 30%;
				}
			}
			@keyframes docs-mug-wiggle {
				0%,
				100% {
					rotate: 0deg;
				}
				25% {
					rotate: -5deg;
				}
				60% {
					rotate: 4deg;
				}
			}
			@media (max-width: 40rem) {
				.docs-mug {
					--mug-width: 4.5rem;
					--mug-height: 5.52rem;
					padding-inline: var(--space-m);
				}
			}
		</style>
		<span class="docs-mug-art">
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
	</div>
}
