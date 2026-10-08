import { asset } from '../../site-base.ts';

/** A hand-drawn object from `public/illustrations/`, in its light and dark cuts; the theme shows one. */
export default function Illustration({
	name,
	size,
	alt,
	spot,
}: {
	readonly name: string;
	/** Any CSS length; the drawing keeps its own aspect ratio. */
	readonly size?: string;
	/** Leave empty when the picture only decorates text that already says the same thing. */
	readonly alt?: string;
	/** `corner` pins it, tilted, over the top-right corner of the nearest positioned box. */
	readonly spot?: 'corner';
}) @{
	const label = alt ?? '';

	<span class={spot === 'corner' ? 'il is-corner' : 'il'} role={label === '' ? undefined : 'img'} aria-label={label === '' ? undefined : label} aria-hidden={label === '' ? 'true' : undefined} style={'--il-size:' + (size ?? '3rem')}>
		<img class="il-cut il-light" src={asset('illustrations/' + name + '-light.png')} alt="" decoding="async" />
		<img class="il-cut il-dark" src={asset('illustrations/' + name + '-dark.png')} alt="" decoding="async" />
		<style>
			.il {
				display: inline-grid;
				flex: none;
				width: var(--il-size);
				height: var(--il-size);
				vertical-align: middle;
			}

			.il.is-corner {
				position: absolute;
				inset-block-start: calc(var(--il-size) * -0.42);
				inset-inline-end: calc(var(--il-size) * -0.28);
				z-index: 1;
				rotate: 7deg;
				pointer-events: none;
			}

			.il-cut {
				grid-area: 1 / 1;
				width: 100%;
				height: 100%;
				object-fit: contain;
			}

			.il-light {
				display: var(--sprite-light);
			}

			.il-dark {
				display: var(--sprite-dark);
			}
		</style>
	</span>
}
