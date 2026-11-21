import { state } from '@markless/core';

export default function App() @{
	let greeting = state('Nobody yet');
	let second = state('Second form not sent');
	<main>
		<h1>Forms</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				greeting = `Hello, ${String(data.get('name'))}`;
			}}
		>
			<input aria-label="Name" name="name" required />
			<input type="submit" value="Sign in" />
		</form>
		<p>{greeting}</p>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				second = 'Second form sent';
			}}
		>
			<input type="submit" />
		</form>
		<p>{second}</p>
	</main>
}
