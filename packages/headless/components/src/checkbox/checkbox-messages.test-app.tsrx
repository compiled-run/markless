import { checkbox } from '../index.ts';

// A described checkbox and an invalid one. The error part being mounted at all
// is what makes the trigger invalid; nothing else in the family says so.
export function App() @{
	<section data-testid="messages">
		<div data-testid="described">
			<checkbox.root>
				<checkbox.label>Subscribe to newsletter</checkbox.label>
				<checkbox.description>We'll send you updates about new features</checkbox.description>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-testid="errored">
			<checkbox.root required>
				<checkbox.label>Accept Terms</checkbox.label>
				<checkbox.description>Read our terms and conditions before accepting</checkbox.description>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.error>Please accept the terms and conditions</checkbox.error>
			</checkbox.root>
		</div>
		<div data-testid="error-first">
			<checkbox.root required>
				<checkbox.error>Please accept the terms and conditions</checkbox.error>
				<checkbox.label>Accept Terms</checkbox.label>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
		</div>
	</section>
}
