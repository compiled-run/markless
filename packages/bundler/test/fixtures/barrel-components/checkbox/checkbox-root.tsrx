export default function CheckboxRoot({ checked, children }) @{
	<div data-checkbox-root ui-checked={checked}>{children}</div>
}
