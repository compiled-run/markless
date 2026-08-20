import { checkbox } from '../../src/index.ts';

export function App() @{
	<section data-testid="trigger-props">
		<checkbox.root disabled>
			<checkbox.trigger>x</checkbox.trigger>
		</checkbox.root>
	</section>
}
