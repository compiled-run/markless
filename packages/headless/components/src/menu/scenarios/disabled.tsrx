import { state } from '@markless/core';
import * as menu from '../index.ts';

// A disabled item is reachable and announced - the APG's rule - and refuses to
// be activated. The second menu is disabled whole, so its trigger is a disabled
// button and nothing opens it.
export default function Disabled() @{
	const log = state({ last: '', calls: 0 });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
				log.calls = log.calls + 1;
			}}
		>
			<menu.trigger data-testid="trigger">Edit</menu.trigger>
			<menu.content data-testid="content">
				<menu.item value="cut" data-testid="item-cut">Cut</menu.item>
				<menu.item value="paste" disabled data-testid="item-paste">Paste</menu.item>
				<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
			</menu.content>
		</menu.root>
		<menu.root disabled data-testid="locked-root">
			<menu.trigger data-testid="locked-trigger">Tools</menu.trigger>
			<menu.content data-testid="locked-content">
				<menu.item value="build" data-testid="locked-build">Build</menu.item>
			</menu.content>
		</menu.root>
		<p data-testid="last">{log.last}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
