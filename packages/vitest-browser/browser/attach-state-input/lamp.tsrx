import type { Children } from '@markless/core';
import { follow } from './follow.ts';

export function Lamp({ lit, children }: { readonly lit?: boolean; readonly children?: Children }) @{
	<p data-lamp attach={follow(lit)} onClick={() => {}}>
		{children}
	</p>
}
