import { state } from '@markless/core';

export default function App() @{
	let sent = state('Not sent');
	<main>
		<h1>Order</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent to ${String(data.get('name'))} in ${String(data.get('city'))}`;
			}}
		>
			<fieldset>
				<legend>Who it is for</legend>
				<input aria-label="Name" name="name" />
			</fieldset>
			<fieldset>
				<legend>Where it goes</legend>
				<input aria-label="City" name="city" />
			</fieldset>
			<button>Send</button>
		</form>
		<p>{sent}</p>
	</main>
}
