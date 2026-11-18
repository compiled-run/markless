import { state } from '@markless/core';
import { toggle } from '@markless/ui';

export default function App() @{
	let joined = state('Not joined');
	let agreed = state(false);
	<main>
		<h1>Membership</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				joined = `Joined as ${String(data.get('email'))}, rules ${String(data.get('rules'))}`;
			}}
		>
			<input aria-label="Email" name="email" required />
			<toggle.root name="rules" required onChange={(next) => (agreed = next)}>
				<toggle.label>Agree to the rules</toggle.label>
				<toggle.trigger>
					<toggle.thumb />
				</toggle.trigger>
				<toggle.field />
			</toggle.root>
			<button type="submit">Join</button>
		</form>
		<p>{agreed ? 'You agreed' : 'You have not agreed'}</p>
		<p>{joined}</p>
	</main>
}
