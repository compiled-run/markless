import { state } from '@markless/core';

// The ladder from specs/framework/12-arm-rendering.md D1, one action at a time.
// The second line is the only claim that matters, so it is its own binding.
// Text bindings rather than a record lookup: see NOTES.md finding 31.
export default function TierLadder() @{
	let action = state('number');

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" onClick={() => action = 'number'}>
				Change a number
			</button>
			<button type="button" class="pick" onClick={() => action = 'row'}>
				Add a list row
			</button>
			<button type="button" class="pick" onClick={() => action = 'panel'}>
				Toggle a panel
			</button>
			<button type="button" class="pick" onClick={() => action = 'slow'}>
				Load slow data
			</button>
			<button type="button" class="pick" onClick={() => action = 'page'}>
				Go to another page
			</button>
		</div>
		<p class="playground-output">
			{action === 'number'
				? 'Tier 1, value slots'
				: action === 'row'
					? 'Tier 2, keyed row ops'
					: action === 'panel'
						? 'Tier 3, branch range flips'
						: action === 'slow'
							? 'Tier 4, arm commit'
							: 'Tier 5, route swap'}
		</p>
		<p class="playground-output" data-runs-code>
			{action === 'number' || action === 'row' || action === 'panel'
				? 'No component code runs.'
				: 'Component code runs, once, for the content that is appearing.'}
		</p>
		<p class="explorer-note">
			{action === 'number'
				? 'The compiler already knows which text node held that number, so the update is that one assignment.'
				: action === 'row'
					? 'The key tells the compiler which row is which, so a reorder moves rows instead of rebuilding the list.'
					: action === 'panel'
						? 'Both branches were compiled ahead of time, so the flip swaps a range of nodes and nothing is re-executed.'
						: action === 'slow'
							? 'The waiting arm is replaced by the settled arm. That content is appearing for the first time, so it is rendered for the first time.'
							: 'A route swap is the same commit at page scale: the new page is new content, so it is rendered once.'}
		</p>
	</section>
}
