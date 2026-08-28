import { togglegroup } from '../../index.ts';

// The other half of the family: any number of these can be on at once, so
// `value` is a list and `onChange` reports a list.
export default function Multiple() @{
	<togglegroup.root multiple value={['bold', 'underline']} data-testid="root">
		<togglegroup.label data-testid="label">Text style</togglegroup.label>
		<togglegroup.item value="bold" data-testid="bold">Bold</togglegroup.item>
		<togglegroup.item value="italic" data-testid="italic">Italic</togglegroup.item>
		<togglegroup.item value="underline" data-testid="underline">Underline</togglegroup.item>
	</togglegroup.root>
}
