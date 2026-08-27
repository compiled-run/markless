import { togglegroup } from '../../index.ts';

// One item nobody may press, and a whole group nobody may touch. The locked item
// is walked past rather than landed on, and it is still announced when a person
// reaches it another way.
export default function DisabledItems() @{
	<section>
		<togglegroup.root value="center" data-testid="root">
			<togglegroup.label data-testid="label">Text alignment</togglegroup.label>
			<togglegroup.item value="left" data-testid="left">Left</togglegroup.item>
			<togglegroup.item value="center" data-testid="center">Center</togglegroup.item>
			<togglegroup.item value="justify" disabled data-testid="justify">Justify</togglegroup.item>
			<togglegroup.item value="right" data-testid="right">Right</togglegroup.item>
		</togglegroup.root>
		<togglegroup.root disabled value="bold" multiple data-testid="locked-root">
			<togglegroup.label data-testid="locked-label">Text style</togglegroup.label>
			<togglegroup.item value="bold" data-testid="locked-bold">Bold</togglegroup.item>
			<togglegroup.item value="italic" data-testid="locked-italic">Italic</togglegroup.item>
		</togglegroup.root>
	</section>
}
