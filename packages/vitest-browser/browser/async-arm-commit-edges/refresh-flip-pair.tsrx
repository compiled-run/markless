import { computed, state } from '@markless/core';
import { fetchAccount } from './fetch-data.ts';

function Stamp({ who }: { who: string }) @{
	let marks = state(0);
	<mark data-stamp onClick={() => marks++}>{who}</mark>
}

export default function RefreshFlipPair() @{
	let step = state(0);
	const member = computed(async () => await fetchAccount(step, 1));

	<div>
		@try {
			<dl data-sheet>
				@if (member.vip) {
					<dd><Stamp who={member.name} /></dd>
				} @else {
					<dd data-basic>{member.name} basic</dd>
				}
				<dt data-title>{member.name}</dt>
			</dl>
		} @pending {
			<i>wait</i>
		}
		<button data-step onClick={() => step++}>step</button>
	</div>
}
