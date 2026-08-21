import { base } from '../index.ts';

export function App() @{
	<div data-testid="base-parts">
		<span data-testid="button"><base.button>Press</base.button></span>
		<span data-testid="label"><base.label for="field-id">Name</base.label></span>
		<span data-testid="hidden"><base.visuallyhidden>Hidden</base.visuallyhidden></span>
	</div>
}
