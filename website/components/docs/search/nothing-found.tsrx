import { asset } from '../../../site-base.ts';
import { NOTHING_FOUND } from './search-load.ts';

/** A blank slip under a magnifier: what the search dialog shows when nothing matches. */
export default function NothingFound() @{
	<svg class="nothing-found" viewBox="0 0 220 140" aria-hidden="true">
		<use href={asset(NOTHING_FOUND) + '#nothing'} />
		<style>
			.nothing-found {
				--nothing-ink: var(--ink);
				--nothing-paper: color-mix(in oklch, var(--paper) 50%, white);
				--nothing-glass: var(--yellow);
				--nothing-glass-opacity: 0.55;
				--nothing-glass-blend: multiply;
				--nothing-pencil: color-mix(in srgb, var(--pink) 70%, #e0603c);
				--nothing-pencil-opacity: 0.5;
				inline-size: min(13rem, 70%);
				block-size: auto;
				overflow: visible;

				html.dark & {
					--nothing-paper: var(--code-surface);
					--nothing-glass-opacity: 0.3;
					--nothing-glass-blend: normal;
					--nothing-pencil-opacity: 0.32;
				}
			}
		</style>
	</svg>
}
