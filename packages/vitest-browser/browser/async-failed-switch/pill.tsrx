import type { Children } from '@markless/core';
import { tones } from './tones.ts';

export default function Pill({ tone, size, children, ...rest }: { tone?: string; size?: string; children?: Children; [name: string]: unknown }) @{
	<button type="button" data-tone={`tone-${tone}`} {...rest} class={tones({ tone, size })}>{children}</button>
}
