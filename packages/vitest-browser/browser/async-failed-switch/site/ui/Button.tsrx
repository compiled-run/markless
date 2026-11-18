import type { Children } from '@markless/core';
import { buttonVariants, type ButtonSize, type ButtonVariant } from './variants.ts';

export default function Button({
	variant,
	size,
	class: className,
	children,
	...rest
}: {
	variant?: ButtonVariant;
	size?: ButtonSize;
	class?: string;
	children?: Children;
	[attribute: string]: unknown;
}) @{
	<button
		type="button"
		data-slot="button"
		data-variant={variant ?? 'default'}
		data-size={size ?? 'default'}
		{...rest}
		class={buttonVariants({ variant, size, className })}
	>{children}</button>
}
