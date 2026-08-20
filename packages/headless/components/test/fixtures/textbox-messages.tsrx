import { textbox } from '../../src/index.ts';

// A described text box, an invalid one, and one carrying both messages.
export function App() @{
	<section data-testid="messages">
		<div data-case="described">
			<textbox.root>
				<textbox.label>Email</textbox.label>
				<textbox.description>We'll never share your email</textbox.description>
				<textbox.trigger />
			</textbox.root>
		</div>
		<div data-case="errored">
			<textbox.root>
				<textbox.label>Password</textbox.label>
				<textbox.trigger />
				<textbox.error>Password is required</textbox.error>
			</textbox.root>
		</div>
		<div data-case="both">
			<textbox.root>
				<textbox.label>Email</textbox.label>
				<textbox.description>Enter a valid email address</textbox.description>
				<textbox.trigger />
				<textbox.error>Email format is invalid</textbox.error>
			</textbox.root>
		</div>
	</section>
}
