import { checkbox } from '../../src/index.ts';

export function App() @{
	<section data-testid="trigger-props">
		<checkbox.root>
			<checkbox.trigger disabled>x</checkbox.trigger>
		</checkbox.root>
	</section>
}
