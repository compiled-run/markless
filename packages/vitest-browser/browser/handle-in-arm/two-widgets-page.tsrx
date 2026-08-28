import { Widget } from './handle-in-arm.tsrx';

// Two rendered widgets, each with an arm of its own to open: the handle an arm
// files is one element PER WIDGET, so a probe must reach its own panel.
export default function TwoWidgetsPage() @{
	<section data-page>
		<Widget>first</Widget>
		<Widget startOpen={true}>second</Widget>
	</section>
}
