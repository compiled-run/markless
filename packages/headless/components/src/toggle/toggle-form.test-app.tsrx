import { state } from '@markless/core';
import { toggle } from '../index.ts';

// Three real forms. Each one submits its own hidden field and writes what the
// browser actually put in the FormData, so the assertions read a submission
// rather than an attribute.
export function App() @{
	let plain = state('');
	let checked = state('');
	let valued = state('');

	<section data-testid="form">
		<form data-testid="plain" onSubmit={(event) => {
			event.preventDefault();
			plain = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<toggle.root name="notifications">
				<toggle.field />
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
			<button type="submit">Submit</button>
			<output>{plain}</output>
		</form>

		<form data-testid="checked" onSubmit={(event) => {
			event.preventDefault();
			checked = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<toggle.root name="notifications" checked>
				<toggle.field />
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
			<button type="submit">Submit</button>
			<output>{checked}</output>
		</form>

		<form data-testid="valued" onSubmit={(event) => {
			event.preventDefault();
			valued = JSON.stringify(Object.fromEntries(new FormData(event.target)));
		}}>
			<toggle.root name="notifications" value="enabled" checked required>
				<toggle.field />
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
			<button type="submit">Submit</button>
			<output>{valued}</output>
		</form>
	</section>
}
