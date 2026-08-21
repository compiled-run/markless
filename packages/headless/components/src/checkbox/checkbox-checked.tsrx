import BasicCheckbox from './checkbox-basic.tsrx';

// The basic example, checked. A wrapper rather than a prop on render() because
// the browser harness mounts a zero-argument component (see checkbox.browser.test.ts).
export default function CheckedCheckbox() @{
	<BasicCheckbox checked />
}
