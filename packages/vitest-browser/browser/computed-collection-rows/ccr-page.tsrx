import { CcrItem, CcrLanded, CcrRoot, CcrRowsSeen, CcrTitle, ccr } from './ccr-widget.tsrx';

// The parts sit inside a page-local component that roots nothing, and the days
// come out of a keyed repeat over the widget's computed collection - the
// calendar family's own shape.
export default function ComputedCollectionRowsPage() @{
	<section data-ccr-page>
		<CcrRoot month="2026-08">
			<Month />
			<CcrLanded />
			<CcrRowsSeen />
		</CcrRoot>
	</section>
}

function Month() @{
	const c = ccr();

	<div data-ccr-content>
		<CcrTitle />
		<div data-ccr-days>
			@for (const day of c.days; key day) {
				<CcrItem value={day} />
			}
		</div>
	</div>
}
