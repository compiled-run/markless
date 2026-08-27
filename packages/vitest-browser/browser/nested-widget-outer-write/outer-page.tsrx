import { Inner, Outer } from './nested.tsrx';

// One outer widget with three nested inner widgets, each registering its place.
export default function OuterPage() @{
	<section data-outer-page>
		<Outer label="only">
			<Inner index={0}>one</Inner>
			<Inner index={1}>two</Inner>
			<Inner index={2}>three</Inner>
		</Outer>
	</section>
}
