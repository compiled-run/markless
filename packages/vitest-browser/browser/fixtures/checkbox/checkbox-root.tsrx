export default function CheckboxRoot({ checked, children }) @{
	<div class="checkbox" data-checkbox-root ui-checked={checked}>{children}</div>
}
