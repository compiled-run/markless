import FormCheckbox from './checkbox-form.tsrx';

// A value of its own replaces the browser default, and required reaches the field.
export default function ValuedFormCheckbox() @{
	<FormCheckbox checked required value="checked" />
}
