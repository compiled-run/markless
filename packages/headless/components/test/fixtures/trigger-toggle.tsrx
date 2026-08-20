import { checkbox } from '../../src/index.ts';

export function App() @{
	<section data-testid="trigger-toggle">
		<checkbox.root>
			<checkbox.trigger>x</checkbox.trigger>
		</checkbox.root>
	</section>
}
