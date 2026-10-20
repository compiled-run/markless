import { state } from '@markless/core';

export default function MovedVisiblePage() @{
	let seen = state(0);
	let count = state(0);
	<main>
		<div data-list>
			<p data-first>{'first'}</p>
			<p data-second>{'second'}</p>
			<div style="height: 3000px"></div>
			<section data-watched data-count={count} onVisible={() => seen++}>
				<span data-seen>{seen}</span>
				<span data-count-text>{count}</span>
			</section>
		</div>
		<button data-more onClick={() => count++}>{'more'}</button>
	</main>;
}
