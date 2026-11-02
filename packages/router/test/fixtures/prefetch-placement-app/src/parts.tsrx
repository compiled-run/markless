export function NavLink({ children, ...rest }: { readonly children?: unknown; readonly href: string }) @{
	<a {...rest} data-part="nav-link">{children}</a>
}

export function NavButton({ children, ...rest }: { readonly children?: unknown }) @{
	<button {...rest} type="button">{children}</button>
}
