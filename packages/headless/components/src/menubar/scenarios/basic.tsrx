import { state } from '@markless/core';
import * as menu from '../../menu/index.ts';
import * as menubar from '../index.ts';

// Three menus on one bar, written as the bar's own recursion: an item carries the
// label and holds the menu it drops down, and the menu family's parts - a
// command, a nested submenu, a checkbox item - go inside unchanged.
export default function Basic() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menubar.root
			data-testid="root"
			onChange={(value: string) => {
				log.last = value;
			}}
		>
			<menubar.label data-testid="label">Application</menubar.label>
			<menubar.item data-testid="bar-file" delay={40} closeDelay={40}>
				File
				<menubar.itemcontent data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
					<menu.item value="recent" submenu data-testid="level-recent">
						Open Recent
						<menu.itemcontent data-testid="panel-recent">
							<menu.item value="draft" data-testid="item-draft">draft.md</menu.item>
							<menu.item value="notes" data-testid="item-notes">notes.md</menu.item>
						</menu.itemcontent>
					</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="bar-edit">
				Edit
				<menubar.itemcontent data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
					<menu.item value="redo" data-testid="item-redo">Redo</menu.item>
				</menubar.itemcontent>
			</menubar.item>
			<menubar.item data-testid="bar-view" checked={['wrap']}>
				View
				<menubar.itemcontent data-testid="panel-view">
					<menu.item value="wrap" checked data-testid="item-wrap">Word wrap</menu.item>
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menubar.itemcontent>
			</menubar.item>
		</menubar.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
