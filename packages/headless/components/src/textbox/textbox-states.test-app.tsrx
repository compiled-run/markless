import { textbox } from '../index.ts';

// Six independently configured text boxes on one page. The first two pin the two
// controls the family offers; the rest pin what a config renders before anyone
// types. The `strict` case sets its restriction on the trigger rather than the
// root, which is how a part adds a restriction the root did not.
export function App() @{
	<section data-testid="states">
		<div data-testid="plain">
			<textbox.root name="username">
				<textbox.label>Username</textbox.label>
				<textbox.trigger />
			</textbox.root>
		</div>
		<div data-testid="multiline">
			<textbox.root name="bio">
				<textbox.label>Bio</textbox.label>
				<textbox.multilinetrigger />
			</textbox.root>
		</div>
		<div data-testid="filled">
			<textbox.root value="test value">
				<textbox.label>Username</textbox.label>
				<textbox.trigger />
			</textbox.root>
		</div>
		<div data-testid="restricted">
			<textbox.root disabled required readonly>
				<textbox.label>Username</textbox.label>
				<textbox.trigger />
			</textbox.root>
		</div>
		<div data-testid="strict">
			<textbox.root>
				<textbox.label>Username</textbox.label>
				<textbox.trigger required readonly />
			</textbox.root>
		</div>
		<div data-testid="loose">
			<textbox.root required>
				<textbox.label>Username</textbox.label>
				<textbox.trigger required={false} />
			</textbox.root>
		</div>
	</section>
}
