import { state } from '@markless/core';

const SIZES = ['Small', 'Medium', 'Large'];

export default function Choose() @{
	let size = state('Medium');
	let sent = state('');
	let snacks = state(['Fig', 'Kiwi']);
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `${String(data.get('size'))}|${String(data.get('fruit'))}|${String(data.has('off'))}|${String(data.get('snack'))}`;
			}}
		>
			<select name="size" aria-label="Size">
				@for (const option of SIZES; key option) {
					<option value={option} selected={option === size}>
						{option}
					</option>
				}
			</select>
			<select name="fruit" aria-label="Fruit">
				<option disabled>Pick a fruit</option>
				<option>  Apple   pie </option>
				<option value="pear" label="Pear (ripe)">Pear</option>
			</select>
			<select name="off" aria-label="Off" disabled>
				<option>Never sent</option>
			</select>
			<select name="snack" aria-label="Snack">
				@for (const snack of snacks; key snack) {
					<option>{snack}</option>
				}
			</select>
			<button>Send</button>
		</form>
		<button onClick={() => (size = 'Large')}>Large</button>
		<button onClick={() => (size = 'Small')}>Small</button>
		<button onClick={() => (snacks = ['Lime', 'Kiwi'])}>Swap</button>
		<button onClick={() => (snacks = ['Lime'])}>Trim</button>
		<p>{sent}</p>
	</main>
}
