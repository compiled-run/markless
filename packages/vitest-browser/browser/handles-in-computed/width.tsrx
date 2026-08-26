import { computed, element, shared, state } from '@markless/core';
import { widthOf } from './report.ts';

// The tour/colorpicker shape: a measurement of the handle's own box, published
// as a custom property the family's stylesheet reads. `measuring` gates it, so
// the first derivation never touches the handle and the flip re-derives long
// after every element exists.
export const widthFamily = shared(
	() => {
		const s = state({ measuring: false, probed: '' });
		const trackEl = element<HTMLDivElement>();
		const rootEl = element<HTMLDivElement>();

		return { ...s, trackEl, rootEl };
	},
	{ scope: 'widget' },
);

export function WidthRoot({ children }) @{
	const s = widthFamily();
	const trackWidth = computed(() => (s.measuring ? widthOf(s.trackEl) : 'idle'));

	<div
		data-hic-width-root
		data-derived={trackWidth}
		data-probed={s.probed}
		el={s.rootEl}
		style={{ '--hic-width': trackWidth }}
	>
		{children}
		<button type="button" data-hic-measure onClick={() => (s.measuring = true)}>measure</button>
		<button
			type="button"
			data-hic-probe
			onClick={() => {
				const track = s.trackEl;
				const root = s.rootEl;
				const measured = widthOf(track);
				s.probed = measured;
				root?.style.setProperty('--hic-handler-width', measured);
			}}
		>probe</button>
	</div>
}

export function WidthTrack() @{
	const s = widthFamily();

	<div data-hic-track el={s.trackEl} style={{ width: 120, height: 10 }} />
}
