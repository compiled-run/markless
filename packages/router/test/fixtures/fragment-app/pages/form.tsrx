import { state } from '@markless/core';
import Nav from '../src/nav.tsrx';

export default function FormPage() @{
	let sent = state('');
	let name = state('');

	<main data-page="form">
		<title>Form page</title>
		<Nav />
		<form
			data-form
			onSubmit={(event) => {
				event.preventDefault();
				sent = `sent ${name}`;
			}}
		>
			<input data-name value={name} onInput={(event) => (name = (event.target as HTMLInputElement).value)} />
			<button type="submit" data-submit>Send</button>
		</form>
		<output data-sent>{sent}</output>
	</main>
}
