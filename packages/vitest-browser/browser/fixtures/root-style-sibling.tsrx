import { state } from '@markless/core';

export default function RootStyleSibling() @{
	let count = state(0);

	<>
		<style>
			.tally { color: rgb(101, 102, 103); }
		</style>
		<p class="tally" data-tally>tally</p>
		<section class="panel" data-panel>
			<style>
				.panel { color: rgb(7, 8, 9); }
			</style>
			<button type="button" data-count onClick={() => count++}>{count}</button>
		</section>
	</>
}
