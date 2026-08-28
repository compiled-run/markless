import { buttongroup } from '../../index.ts';

// The other half of the family: any number of these can be on at once, so
// `value` is a list and `onChange` reports a list.
export default function Multiple() @{
	<buttongroup.root multiple value={['bold', 'underline']} data-testid="root">
		<buttongroup.label data-testid="label">Text style</buttongroup.label>
		<buttongroup.item value="bold" data-testid="bold">Bold</buttongroup.item>
		<buttongroup.item value="italic" data-testid="italic">Italic</buttongroup.item>
		<buttongroup.item value="underline" data-testid="underline">Underline</buttongroup.item>
	</buttongroup.root>
}
