import { state } from '@markless/core';

export default function PositionKeyedPage() @{
	let slots = state([{ open: false, name: 'one' }, { open: true, name: 'two' }]);
	<div>
		<ul>
			// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: slots are positions
			@for (const slot of slots; index n; key n) {
				<li>
					@if (slot.open) {
						<button type="button" data-close={n} onClick={() => (slots = slots.map((each, at) => (at === n ? { ...each, open: false } : each)))}>close {slot.name}</button>
					} @else {
						<button type="button" data-open={n} onClick={() => (slots = slots.map((each, at) => (at === n ? { ...each, open: true } : each)))}>open {slot.name}</button>
					}
				</li>
			}
		</ul>
	</div>
}
