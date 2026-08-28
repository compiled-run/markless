import { Label, Note, Outer, Step } from './nested.tsrx';

// The writer is one component deeper than the nested widget's root: a plain part
// of the outer widget that renders inside a widget it does not root.
export default function DeepPage() @{
	<section data-deep-page>
		<Outer label="deep">
			<Step name="one"><Note index={0} /><Label /></Step>
			<Step name="two"><Note index={1} /><Label /></Step>
			<Step name="three"><Note index={2} /><Label /></Step>
		</Outer>
	</section>
}
