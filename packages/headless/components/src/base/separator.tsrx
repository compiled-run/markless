import type { SeparatorProps } from './base-types.ts';


// Display only: no focus, no keys, no value. A separator a person can move is the
// resizable family's divider, which shares the role string and nothing else.
export default function Separator({ orientation, decorative }: SeparatorProps) @{
	<div
		role={decorative === true ? undefined : 'separator'}
		aria-orientation={decorative === true ? undefined : (orientation ?? 'horizontal')}
		aria-hidden={decorative === true ? 'true' : undefined}
		ui-separator={true}
		ui-orientation={orientation ?? 'horizontal'}
		ui-decorative={decorative === true}
	></div>
}
