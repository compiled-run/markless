import { state } from '@markless/core';

export default function IndexRowsPage() @{
	let picks = state([
		{ id: 'x', label: 'Ex' },
		{ id: 'y', label: 'Why' },
		{ id: 'z', label: 'Zed' },
	]);
	let compact = state(false);
	<section>
		<button type="button" data-rotate onClick={() => (picks = [...picks.slice(-1), ...picks.slice(0, -1)])}>rotate</button>
		<button type="button" data-compact onClick={() => (compact = !compact)}>compact</button>
		<ul>
			@for (const pick of picks; index place; key pick.id) {
				<li data-pick={pick.id}>
					<span>{pick.label}</span>
					@if (place === 0) { <b class="lead">first</b> } @else { <i class="rest">{place}</i> }
					@if (compact) { <small class="tight">c</small> } @else { <big class="wide">w</big> }
				</li>
			}
		</ul>
	</section>
}
