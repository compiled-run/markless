import { element, state } from '@markless/core';
import { report } from './report.ts';

export default function ArmList() @{
	let open = state(false);
	let tags = state(['x', 'y']);
	const rows = element<HTMLElement[]>();
	const box = element<HTMLElement>();

	<section>
		<ul el={box}>
			@if (open) {
				@for (const tag of tags; key tag) {
					<li el={rows}>{tag}</li>
				}
			} @else {
				<p>closed</p>
			}
			<li class="tail">tail</li>
		</ul>
		<button data-op="peek" onClick={() => report(box!, rows, 'li:not(.tail)')}>peek</button>
		<button data-op="open" onClick={() => { open = true; report(box!, rows, 'li:not(.tail)'); }}>open</button>
	</section>
}
