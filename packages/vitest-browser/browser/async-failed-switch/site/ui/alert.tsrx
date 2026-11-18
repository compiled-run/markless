import type { Children } from '@markless/core';
import { cn } from './cn.ts';
import { alertVariants, classes, type AlertVariant } from './variants.ts';

type Props = { class?: string; children?: Children; [attribute: string]: unknown };

export function Alert({ variant, class: className, children, ...rest }: Props & { variant?: AlertVariant }) @{
	<div data-slot="alert" role="alert" {...rest} class={alertVariants({ variant, className })}>{children}</div>
}

export function AlertTitle({ class: className, children, ...rest }: Props) @{
	<div data-slot="alert-title" {...rest} class={cn(classes.alertTitle, className)}>{children}</div>
}

export function AlertDescription({ class: className, children, ...rest }: Props) @{
	<div data-slot="alert-description" {...rest} class={cn(classes.alertDescription, className)}>{children}</div>
}
