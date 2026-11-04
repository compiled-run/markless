// A hand-drawn numbered ring: marks a spot on an ink sheet and the margin note that explains it.
// Inside an @if arm or @for row, draw the ring inline from `art.ring.ink`: a component there makes the browser render the arm.
import { art } from './screen.art.ts';

export default function Ring({
	n,
	small,
}: {
	/** The number inside the ring; the sheet's ring and its note carry the same one. */
	readonly n: number;
	/** The size used beside a margin note. */
	readonly small?: boolean;
}) @{
	<svg class={small === true ? 'ink-ring small' : 'ink-ring'} viewBox="0 0 26 26" aria-hidden="true">
		<path class="ring-ink" d={art.ring.ink} />
		<text x="13" y="17.5">{n}</text>
		<style>
			.ink-ring {
				--ring: oklch(55% 0.17 30);
				flex: none;
				width: 1.6rem;
				height: 1.6rem;
				overflow: visible;

				html.dark & {
					--ring: oklch(72% 0.14 35);
				}
			}

			.small {
				width: 1.35rem;
				height: 1.35rem;
			}

			.ring-ink {
				fill: var(--ring);
			}

			text {
				fill: var(--ring);
				font: 700 13px 'Shantell Sans', system-ui, sans-serif;
				text-anchor: middle;
			}
		</style>
	</svg>
}
