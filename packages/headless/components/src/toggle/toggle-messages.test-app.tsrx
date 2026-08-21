import { toggle } from '../index.ts';

// A described switch and an invalid one. The error part being mounted at all is
// what is meant to make the trigger invalid; nothing else in the family says so.
export function App() @{
	<section data-testid="messages">
		<div data-testid="described">
			<toggle.root>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
				<toggle.description>(Receive notifications about important updates)</toggle.description>
			</toggle.root>
		</div>
		<div data-testid="errored">
			<toggle.root required>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
				<toggle.error>This field is required</toggle.error>
			</toggle.root>
		</div>
		<div data-testid="error-first">
			<toggle.root required>
				<toggle.error>This field is required</toggle.error>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
		</div>
	</section>
}
