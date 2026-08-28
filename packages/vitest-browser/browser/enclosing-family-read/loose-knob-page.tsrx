import { Knob } from './knob.tsrx';

// The knob with NO enclosing bar: it must register nowhere and still work alone.
export default function LooseKnobPage() @{
	<section data-loose-knob-page>
		<Knob name="lone" />
	</section>
}
