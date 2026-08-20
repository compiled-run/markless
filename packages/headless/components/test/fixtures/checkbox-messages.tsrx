import { checkbox } from '../../src/index.ts';

// A described checkbox and an invalid one. The error part being mounted at all
// is what makes the trigger invalid; nothing else in the family says so.
export function App() @{
	<section data-testid="messages">
		<div data-case="described">
			<checkbox.root>
				<checkbox.label>Subscribe to newsletter</checkbox.label>
				<checkbox.description>We'll send you updates about new features</checkbox.description>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="errored">
			<checkbox.root required>
				<checkbox.label>Accept Terms</checkbox.label>
				<checkbox.description>Read our terms and conditions before accepting</checkbox.description>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.error>Please accept the terms and conditions</checkbox.error>
			</checkbox.root>
		</div>
	</section>
}
