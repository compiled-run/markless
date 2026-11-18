import { computed } from '@markless/core';
import { Saver } from './saver.tsrx';

function Panel({ days }) @{
	<section data-panel>
		<Saver days={days} />
	</section>
}

// A grandchild from another module: its own handler, not a callback its parent wrote, rejects into the @catch around the parent's use.
export function ChildOwn() @{
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 7 };
	});

	<main>
		@try {
			<div>
				<p data-days>{report.days}</p>
				<Panel days={report.days} />
			</div>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
