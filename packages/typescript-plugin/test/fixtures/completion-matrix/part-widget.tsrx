import type { PropsOf } from '@markless/core';
import type {
	WidgetFieldProps,
	WidgetRootProps,
	WidgetTriggerProps,
} from './part-widget-types.ts';

export function root({ children, ...rest }: WidgetRootProps) @{
	<div {...rest}>{children}</div>
}

export function trigger({ children, ...rest }: WidgetTriggerProps) @{
	<button {...rest}>{children}</button>
}

// The consumer's props land on the <input>, but the first element in this source is the
// <span> that wraps it. A hint read off the markup would name the span.
export function wrapped({ ...rest }: PropsOf<'input'>) @{
	<span>
		<input {...rest} />
	</span>
}

export function field({ name }: WidgetFieldProps) @{
	<span data-name={name} />
}
