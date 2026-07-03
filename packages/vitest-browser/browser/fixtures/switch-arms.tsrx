import { state } from '@markless/core';

export function App() @{
	let kind = state('alpha');

	<section>
		<button type="button" data-to-alpha onClick={() => kind = 'alpha'}>A</button>
		<button type="button" data-to-beta onClick={() => kind = 'beta'}>B</button>
		<button type="button" data-to-other onClick={() => kind = 'other'}>O</button>
		@switch (kind) {
			@case 'alpha': { <p class="arm-a">Alpha arm</p> }
			@case 'beta': { <p class="arm-b">Beta arm</p> }
			@default: { <p class="arm-d">Default arm</p> }
		}
	</section>
}
