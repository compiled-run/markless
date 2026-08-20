import { base } from '../../src/index.ts';

export function App() @{
	<div>
		<base.button>Press</base.button>
		<base.label for="field-id">Name</base.label>
		<base.visuallyhidden>Hidden</base.visuallyhidden>
	</div>
}
