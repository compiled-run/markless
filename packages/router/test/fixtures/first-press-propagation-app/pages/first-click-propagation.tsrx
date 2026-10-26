import { state } from '@markless/core';

export default function Page() @{
	let inner = state(0);
	let outer = state(0);

	<main class="outer" onClick={() => outer++}>
		<button
			class="inner"
			onClick={(event) => {
				event.stopPropagation();
				inner++;
			}}
		>
			inner
		</button>
		<p class="probe">inner {inner} outer {outer}</p>
	</main>
}
