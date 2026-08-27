import { computed, state } from '@markless/core';
import { Caption, Note } from './family/caption.tsrx';

// The composed part sits inside an async boundary's `@try` arm, so its own `@if`
// arm is registered as an arm-branch record of that boundary rather than as a page
// branch. The parent writes the projected text after the boundary resolves.
export default function ComposedArmBoundaryPage() @{
	let caption = state('30 of 100 rows');
	const crop = computed(async ({ signal }) => {
		await new Promise((resolve) => setTimeout(resolve, 40));
		if (signal.aborted) return { name: 'aborted' };
		return { name: 'ready' };
	});

	<section data-boundary-page>
		@try {
			<div data-crop>
				<output data-ready>{crop.name}</output>
				<Caption children={caption} />
				<Note children={caption} />
			</div>
		} @pending {
			<p data-wait>Sprouting</p>
		} @catch {
			<p data-blight>Blighted</p>
		}
		<button
			type="button"
			data-advance
			onClick={() => {
				caption = '60 of 100 rows';
			}}
		>
			Recount
		</button>
	</section>
}
