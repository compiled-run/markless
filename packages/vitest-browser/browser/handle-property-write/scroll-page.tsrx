import { element, state } from '@markless/core';

export default function ScrollPage() @{
	const viewport = element<HTMLDivElement>();
	const field = element<HTMLInputElement>();
	let top = state(120);

	<main>
		<button
			data-scroll
			onClick={() => {
				if (!viewport || !field) return;
				viewport.scrollTop = top;
				viewport.dataset.scrolled = 'yes';
				field.value = 'typed';
				top += 40;
			}}
		>
			scroll
		</button>
		<div el={viewport} data-viewport style="height: 50px; overflow: auto">
			<div style="height: 1000px">tall</div>
		</div>
		<input el={field} data-field />
	</main>;
}
