export default function OptionalPropSpreadPart({ children, ...rest }) @{
	<button type="button" data-spread-part {...rest}>{children}</button>
}
