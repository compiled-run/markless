export default function CheckboxTrigger({ onToggle }) @{
	<button type="button" data-checkbox-trigger onClick={() => onToggle()}>Toggle</button>
}
