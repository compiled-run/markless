import BasicCheckbox from './checkbox-basic.tsrx';

// Both flags at once: the root carries ui-checked and ui-disabled together.
export default function CheckedDisabledCheckbox() @{
	<BasicCheckbox checked disabled />
}
