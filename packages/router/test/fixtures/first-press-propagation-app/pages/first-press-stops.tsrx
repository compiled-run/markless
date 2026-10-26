import { state } from '@markless/core';

export default function FirstPressStops() @{
	let opened = state('none');
	let rowPresses = state(0);
	let listPresses = state(0);

	<section class="list" onClick={() => listPresses++}>
		<ul>
			<li class="row" onClick={() => rowPresses++}>
				<span>row</span>
				<a
					class="open"
					href="#open"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						opened = 'row';
					}}
				>
					open
				</a>
			</li>
		</ul>
		<output class="seen">{opened} {rowPresses} {listPresses}</output>
	</section>
}
