import { computed, state } from '@markless/core';
import { art } from './drawing.art.ts';

export default function Drawing() @{
	let beat = state(0);
	let marks = state([] as Array<{ id: number; kind: 'star' | 'dot' }>);
	let open = state(false);
	const beatName = computed(() => art.beats[beat % art.beats.length]);

	<figure data-drawing data-beat={beatName}>
		<figcaption title={art.caption}>{art.caption}</figcaption>
		<svg>
			@for (const view of art.views; key view.key) {
				<path data-view={view.key} d={view.ink} />
			}
		</svg>
		<button data-beat-button onClick={() => beat++}>beat</button>
		<button data-add-mark onClick={() => (marks = [...marks, { id: marks.length, kind: marks.length % 2 ? 'dot' : 'star' }])}>add</button>
		<ul data-marks>
			@for (const mark of marks; key mark.id) {
				<li data-mark={mark.kind}>{art.labels[mark.kind]}</li>
			}
		</ul>
		<button data-open onClick={() => (open = !open)}>open</button>
		<div data-arm>
			@if (open) {
				<p data-opened title={art.labels.star}>opened</p>
			}
		</div>
	</figure>
}
