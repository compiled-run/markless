import { Outer, OwnInner } from './nested.tsrx';

// The writer is rendered by the nested widget root's OWN template rather than
// projected into it by this page, which is the shape the served render already
// handled and the client render did not.
export default function OwnTemplatePage() @{
	<section data-own-template-page>
		<Outer label="own">
			<OwnInner index={0}>one</OwnInner>
			<OwnInner index={1}>two</OwnInner>
			<OwnInner index={2}>three</OwnInner>
		</Outer>
	</section>
}
