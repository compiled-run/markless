export function SpreadButton({ children, ...rest }: { readonly children?: unknown; readonly [name: string]: unknown }) @{
	<button {...rest} type="button">{children}</button>
}
