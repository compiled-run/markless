import { state } from '@markless/core';
import { textbox } from '@markless/ui';

export default function App() @{
	let said = state('nothing yet');
	<main>
		<h1>Feedback</h1>
		<textbox.root value="Great app" onChange={(next) => (said = next)}>
			<textbox.textarea aria-label="Your message" />
			<textbox.description>Tell us what you think</textbox.description>
		</textbox.root>
		<p>{`Sent: ${said}`}</p>
	</main>
}
