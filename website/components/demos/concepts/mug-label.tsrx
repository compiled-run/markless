import { state } from '@markless/core';

export default function MugLabel() @{
	let name = state('');
	let printed = state('nothing yet');

	<form
		onSubmit={(event) => {
			event.preventDefault();
			printed = name;
		}}
	>
		<label>
			Name for the mug
			<input
				value={name}
				onInput={(event) => (name = event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') name = '';
				}}
			/>
		</label>
		<p>Preview: {name}</p>
		<p>Printed: {printed}</p>
		<button type="submit">Print it</button>
	</form>
}
