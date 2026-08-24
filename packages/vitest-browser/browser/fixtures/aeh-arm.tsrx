import { element, state } from '@markless/core';
import { reportValues } from './aeh-report.ts';

// One member of the set lives inside an @if arm. When the arm is off that member
// is not in the document, so it must not be in the array; when the arm flips on
// it must join, in its document position rather than at the end.
export default function AehArmPage() @{
	let shown = state(false);
	let order = state('');
	const optionEls = element<HTMLDivElement[]>();

	<section data-aeh-arm-page data-order={order}>
		<button type="button" data-aeh-toggle onClick={() => shown = !shown}>toggle</button>
		<button type="button" data-aeh-probe onClick={() => order = reportValues(optionEls)}>probe</button>
		<div data-aeh-option data-aeh-value="first" el={optionEls}>first</div>
		@if (shown) {
			<div data-aeh-option data-aeh-value="middle" el={optionEls}>middle</div>
		}
		<div data-aeh-option data-aeh-value="last" el={optionEls}>last</div>
	</section>
}
