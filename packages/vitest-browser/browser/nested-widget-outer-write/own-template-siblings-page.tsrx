import { Outer, OwnInner } from './nested.tsrx';

// Two sibling outers, each counting only the own-template writers inside it.
export default function OwnTemplateSiblingsPage() @{
	<section data-own-template-siblings-page>
		<Outer label="left">
			<OwnInner index={0}>one</OwnInner>
			<OwnInner index={1}>two</OwnInner>
			<OwnInner index={2}>three</OwnInner>
		</Outer>
		<Outer label="right">
			<OwnInner index={0}>one</OwnInner>
			<OwnInner index={1}>two</OwnInner>
		</Outer>
	</section>
}
