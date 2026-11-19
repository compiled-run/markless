import { state } from '@markless/core';
import { textbox } from '@markless/ui';

export default function App() @{
	let said = state('nothing yet');
	let changes = state(0);
	<main>
		<h1>Profile</h1>
		<textbox.root
			value="Sam"
			onChange={(next) => {
				said = next;
				changes = changes + 1;
			}}
		>
			<textbox.label>Name</textbox.label>
			<textbox.input aria-label="Full name" />
			<textbox.description>As it appears on your card</textbox.description>
		</textbox.root>
		<p>{`Typed: ${said}`}</p>
		<p>{`Changes: ${changes}`}</p>
	</main>
}
