export function Sun({ size, label }: { readonly size: number; readonly label: string }) @{
	<svg data-icon="sun" width={size} height={size} aria-label={label}></svg>
}

export function Moon({ size, hidden }: { readonly size: number; readonly hidden: boolean }) @{
	<svg data-icon="moon" width={size} aria-hidden={hidden}></svg>
}
