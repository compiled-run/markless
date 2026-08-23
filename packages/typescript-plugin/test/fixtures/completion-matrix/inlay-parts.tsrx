import type { PropsOf } from '@markless/core';
import { Panel } from './part-panel.tsrx';
import * as widget from './part-widget.tsrx';

// A part authored right here, typed the documented way, gets hints with no extra work.
function LocalBadge({ children, ...rest }: PropsOf<'em'>) @{
	<em {...rest}>{children}</em>
}

export function InlayParts() @{
	<widget.root>
		<widget.trigger value="go">Go</widget.trigger>
		<widget.wrapped />
		<widget.field name="choice" />
		<Panel>
			<LocalBadge>new</LocalBadge>
			<div class="plain" />
		</Panel>
	</widget.root>
}
