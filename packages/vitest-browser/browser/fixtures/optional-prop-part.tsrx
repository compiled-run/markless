export default function OptionalPropPart({ disabled, children }) @{
	<button type="button" data-optional-part disabled={disabled} ui-disabled={disabled}>{children}</button>
}
