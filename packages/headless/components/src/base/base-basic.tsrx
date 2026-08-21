import { base } from '../index.ts';

// The base one-offs as a consumer meets them: a button, a label naming a field,
// and a caption only assistive tech reads. These parts take a closed prop list
// rather than spreading the rest onto their element, so the test ids sit on
// wrappers here instead of on the parts themselves.
export default function Basic() @{
	<div data-testid="base-parts">
		<span data-testid="button"><base.button>Press</base.button></span>
		<span data-testid="label"><base.label for="field-id">Name</base.label></span>
		<span data-testid="hidden"><base.visuallyhidden>Hidden</base.visuallyhidden></span>
	</div>
}
