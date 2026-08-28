import { buttongroup } from '../../index.ts';

// One item nobody may press, and a whole group nobody may touch. The locked item
// is walked past rather than landed on, and it is still announced when a person
// reaches it another way.
export default function DisabledItems() @{
	<section>
		<buttongroup.root value="center" data-testid="root">
			<buttongroup.label data-testid="label">Text alignment</buttongroup.label>
			<buttongroup.item value="left" data-testid="left">Left</buttongroup.item>
			<buttongroup.item value="center" data-testid="center">Center</buttongroup.item>
			<buttongroup.item value="justify" disabled data-testid="justify">Justify</buttongroup.item>
			<buttongroup.item value="right" data-testid="right">Right</buttongroup.item>
		</buttongroup.root>
		<buttongroup.root disabled value="bold" multiple data-testid="locked-root">
			<buttongroup.label data-testid="locked-label">Text style</buttongroup.label>
			<buttongroup.item value="bold" data-testid="locked-bold">Bold</buttongroup.item>
			<buttongroup.item value="italic" data-testid="locked-italic">Italic</buttongroup.item>
		</buttongroup.root>
	</section>
}
