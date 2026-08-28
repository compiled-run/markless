import { state } from '@markless/core';
import * as menu from '../index.ts';

// An application menu bar: the same family with `menubar` on the root. There is
// no trigger and no `menu.content` - the root IS the bar - and each bar item is
// a `submenu` item whose `menu.itemcontent` is its dropdown. Below that, the
// recursion is the shipped one.
export default function Menubar() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menu.root
			menubar
			aria-label="Application"
			data-testid="root"
			checked={['wrap']}
			delay={40}
			closeDelay={40}
			onChange={(value: string) => {
				log.last = value;
			}}
		>
			<menu.item value="file" submenu data-testid="bar-file">
				File
				<menu.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
					<menu.item value="recent" submenu data-testid="level-recent">
						Open Recent
						<menu.itemcontent data-testid="panel-recent">
							<menu.item value="draft" data-testid="item-draft">draft.md</menu.item>
							<menu.item value="notes" data-testid="item-notes">notes.md</menu.item>
						</menu.itemcontent>
					</menu.item>
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
					<menu.item value="wrap" checked data-testid="item-wrap">Word wrap</menu.item>
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menu.itemcontent>
			</menu.item>
		</menu.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
