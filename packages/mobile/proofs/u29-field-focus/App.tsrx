import { state } from '@markless/core';

export default function App() @{
	let note = state('Not editing');
	let visits = state(0);
	let count = state(0);
	<main>
		<h1>Sign up</h1>
		<input
			aria-label="Email"
			onFocus={() => {
				note = 'Editing email';
				visits = visits + 1;
			}}
			onBlur={() => (note = 'Email left')}
		/>
		<p>{note}</p>
		<p>{`Focused ${visits} times`}</p>
		<button onClick={() => (count = count + 1)}>{`Pressed ${count}`}</button>
	</main>
}
