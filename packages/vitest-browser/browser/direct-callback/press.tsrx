import type { Children } from '@markless/core';

export default function Press({ label, onPress, children }: { readonly label: string; readonly onPress?: (event: MouseEvent) => void; readonly children?: Children }) @{
	<button type="button" data-press={label} onClick={onPress}>{children}</button>
}
