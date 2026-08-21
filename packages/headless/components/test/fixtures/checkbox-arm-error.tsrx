import * as checkbox from '../../src/checkbox/index.ts';

// The error part sits inside an @if arm. Mounting the arm is what marks the
// trigger invalid, and the trigger renders after the arm decided.
function Field({ showError, children }) @{
	<checkbox.root required>
		<checkbox.label>{children}</checkbox.label>
		<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
		<span data-slot>@if (showError) { <checkbox.error>Required</checkbox.error> }</span>
	</checkbox.root>
}

// The same widget with the arm written BEFORE the trigger: seeding is a phase
// that finishes before any part renders, so document order decides nothing.
function ErrorFirstField({ showError, children }) @{
	<checkbox.root required>
		<span data-slot>@if (showError) { <checkbox.error>Required</checkbox.error> }</span>
		<checkbox.label>{children}</checkbox.label>
		<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
	</checkbox.root>
}

export function App() @{
	<section data-testid="arm-error">
		<div data-case="shown"><Field showError>Accept Terms</Field></div>
		<div data-case="hidden"><Field showError={false}>Accept Terms</Field></div>
		<div data-case="error-first"><ErrorFirstField showError>Accept Terms</ErrorFirstField></div>
	</section>
}
