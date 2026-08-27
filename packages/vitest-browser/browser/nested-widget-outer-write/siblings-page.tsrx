import { Inner, Outer } from './nested.tsrx';

// Two sibling outer widgets: each one counts only the inners written inside it.
export default function SiblingsPage() @{
	<section data-siblings-page>
		<Outer label="left">
			<Inner index={0}>one</Inner>
			<Inner index={1}>two</Inner>
			<Inner index={2}>three</Inner>
		</Outer>
		<Outer label="right">
			<Inner index={0}>one</Inner>
			<Inner index={1}>two</Inner>
		</Outer>
	</section>
}
