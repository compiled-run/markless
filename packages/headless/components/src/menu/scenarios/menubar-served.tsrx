import { state } from '@markless/core';
import * as menu from '../index.ts';

// The same bar with the family's stock `delay` of 700 ms, which is what proves
// the bar's own hover-after-open never consults it: only the nested submenus do.
// It is also the page the served rows wake, so the first gesture on it is cold.
export default function MenubarServed() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			menubar
			aria-label="Application"
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
			}}
		>
			<menu.item value="file" submenu data-testid="bar-file">
				File
				<menu.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
					<menu.item value="open" data-testid="item-open">Open</menu.item>
				</menu.itemcontent>
			</menu.item>
			<menu.item value="edit" submenu data-testid="bar-edit">
				Edit
				<menu.itemcontent data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
					<menu.item value="redo" data-testid="item-redo">Redo</menu.item>
				</menu.itemcontent>
			</menu.item>
			<menu.item value="view" submenu data-testid="bar-view">
				View
				<menu.itemcontent data-testid="panel-view">
					<menu.item value="wrap" data-testid="item-wrap">Word wrap</menu.item>
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menu.itemcontent>
			</menu.item>
		</menu.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
