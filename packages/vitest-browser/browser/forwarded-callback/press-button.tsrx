import type { Children } from '@markless/core';

export default function PressButton({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" onClick={() => onClick?.()}>{children}</button>
}
