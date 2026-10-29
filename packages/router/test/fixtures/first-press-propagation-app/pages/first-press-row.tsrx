import { state } from '@markless/core';

const items = [
	{ id: 1, name: 'apple' },
	{ id: 2, name: 'pear' },
];

export default function FirstPressRow() @{
	let picked = state('none');
	let listPresses = state(0);

	<div>
		<ul class="rows" onClick={() => listPresses++}>
			@for (const item of items; key item.id) {
				<li>
					<button
						class={`pick-${item.id}`}
						onClick={(event) => {
							event.stopPropagation();
							picked = item.name;
						}}
					>
						{item.name}
					</button>
				</li>
			}
		</ul>
		<p class="seen">{picked} {listPresses}</p>
	</div>
}
