import { state } from '@markless/core';
import { textbox } from '@markless/ui';

export default function App() @{
	let locked = state(true);
	let sent = state('Nothing sent');
	<main>
		<h1>Coupon</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('email'))} code [${String(data.get('code'))}]`;
			}}
		>
			<textbox.root name="email" value="ada@example.com">
				<textbox.label>Email</textbox.label>
				<textbox.input />
			</textbox.root>
			<input aria-label="Code" name="code" required readonly={locked} />
			<button type="button" onClick={() => (locked = !locked)}>{locked ? 'Unlock code' : 'Lock code'}</button>
			<button type="submit">Send</button>
		</form>
		<p>{sent}</p>
	</main>
}
