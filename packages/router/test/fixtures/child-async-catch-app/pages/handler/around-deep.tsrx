import { computed } from '@markless/core';
import Wrapper from '../../components/handler/wrapper.tsrx';
import { loadThing } from '../../lib/save.ts';

export default function Page() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<div>
				<p class="loads">loads {thing.loads}</p>
				<Wrapper />
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error, reset) {
			<>
				<p class="caught">caught: {error.message}</p>
				<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
			</>
		}
	</main>
}
