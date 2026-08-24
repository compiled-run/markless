import { base } from '../../index.ts';

// These parts take a closed prop list rather than spreading the rest onto their
// element, so the test ids sit on wrappers rather than on the parts themselves.
//
// `base.label` takes the id as a string, so the scenario renders the control
// that owns it: a handle cannot cross this part boundary
// (MARKLESS_CAPTURE_OPAQUE_PROP), and a `for` naming nothing is a dangling IDREF.
export default function Basic() @{
	<div data-testid="base-parts">
		<span data-testid="button"><base.button>Press</base.button></span>
		<span data-testid="label"><base.label for="field-id">Name</base.label></span>
		<input data-testid="field" id="field-id" type="text" />
		<span data-testid="hidden"><base.visuallyhidden>Hidden</base.visuallyhidden></span>
	</div>
}
