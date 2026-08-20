import { state } from '@markless/core';
import { checkbox } from '../../src/index.ts';

// Four real forms. Each one submits its own hidden field and writes what the
// browser actually put in the FormData, so the assertions read a submission
// rather than an attribute.
export function App() @{
	let plain = state('');
	let checked = state('');
	let valued = state('');
	let mixed = state('');

	<section data-testid="form">
		<form data-case="plain" onSubmit={(event) => {
			event.preventDefault();
			plain = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<checkbox.root name="terms">
				<checkbox.field />
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>I accept the Terms and Conditions</checkbox.label>
			</checkbox.root>
			<button type="submit">Submit</button>
			<output>{plain}</output>
		</form>

		<form data-case="checked" onSubmit={(event) => {
			event.preventDefault();
			checked = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<checkbox.root name="terms" checked>
				<checkbox.field />
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
			<button type="submit">Submit</button>
			<output>{checked}</output>
		</form>

		<form data-case="valued" onSubmit={(event) => {
			event.preventDefault();
			valued = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<checkbox.root name="terms" value="checked" checked required>
				<checkbox.field />
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
			<button type="submit">Submit</button>
			<output>{valued}</output>
		</form>

		<form data-case="mixed" onSubmit={(event) => {
			event.preventDefault();
			mixed = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<checkbox.root name="terms" checked="mixed">
				<checkbox.field />
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
			</checkbox.root>
			<button type="submit">Submit</button>
			<output>{mixed}</output>
		</form>
	</section>
}
