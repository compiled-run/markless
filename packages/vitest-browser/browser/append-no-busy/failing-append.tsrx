import { computed, state } from '@markless/core';
import { delay, getPage, type Page } from './pages.ts';

async function brokenPage(): Promise<Page> {
	await delay(20);
	throw new Error('page is down');
}

export function FailingAppend() @{
	const first = computed(async () => getPage(0));
	let more = state<ReadonlyArray<Page>>([]);
	const items = computed(() => [first, ...more].flatMap((page) => page.items));

	<div>
		@try {
			<section data-arm>
				<p data-items>{items.join(', ')}</p>
				<button type="button" data-more onClick={async () => { more = [...more, await brokenPage()]; }}>
					More
				</button>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</div>
}
