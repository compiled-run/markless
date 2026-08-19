export default function PresencePart({ label, disabled, children }) @{
	<button type="button" data-presence={label} disabled={disabled} ui-disabled={disabled}>{children}</button>
}
