import type { Children } from '@markless/core';

export default function Card({ children }: { readonly children?: Children }) @{
	<section>{children}</section>
}

export function Band({ children }: { readonly children?: Children }) @{
	<div>{children}</div>
}

export function Act({ disabled, onPress, children }: { readonly disabled?: boolean; readonly onPress?: () => void; readonly children?: Children }) @{
	<button type="button" data-act disabled={disabled} onClick={() => onPress?.()}>{children}</button>
}
