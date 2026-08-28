import { state } from '@markless/core';
import * as menu from '../../menu/index.ts';
import * as menubar from '../index.ts';

// Three whole, ordinary menus inside a bar. Nothing about a menu changes to go in
// one: each keeps its trigger, its surface, its nesting and its own onChange.
export default function Basic() @{
	const log = state({ last: '' });

	<section style="padding: 40px">
		<button type="button" data-testid="background">Background</button>
		<menubar.root data-testid="root">
			<menubar.label data-testid="label">Application</menubar.label>
			<menu.root
				data-testid="menu-file"
				delay={40}
				closeDelay={40}
				onChange={(value: string) => {
					log.last = value;
				}}
			>
				<menu.trigger data-testid="bar-file">File</menu.trigger>
				<menu.content data-testid="panel-file">
					<menu.item value="new" data-testid="item-new">New</menu.item>
					<menu.item value="recent" submenu data-testid="level-recent">
						Open Recent
						<menu.itemcontent data-testid="panel-recent">
							<menu.item value="draft" data-testid="item-draft">draft.md</menu.item>
							<menu.item value="notes" data-testid="item-notes">notes.md</menu.item>
						</menu.itemcontent>
					</menu.item>
				</menu.content>
			</menu.root>
			<menu.root
				data-testid="menu-edit"
				onChange={(value: string) => {
					log.last = value;
				}}
			>
				<menu.trigger data-testid="bar-edit">Edit</menu.trigger>
				<menu.content data-testid="panel-edit">
					<menu.item value="undo" data-testid="item-undo">Undo</menu.item>
					<menu.item value="redo" data-testid="item-redo">Redo</menu.item>
				</menu.content>
			</menu.root>
			<menu.root
				data-testid="menu-view"
				checked={['wrap']}
				onChange={(value: string) => {
					log.last = value;
				}}
			>
				<menu.trigger data-testid="bar-view">View</menu.trigger>
				<menu.content data-testid="panel-view">
					<menu.item value="wrap" checked data-testid="item-wrap">Word wrap</menu.item>
					<menu.item value="zoom" data-testid="item-zoom">Zoom in</menu.item>
				</menu.content>
			</menu.root>
		</menubar.root>
		<p data-testid="last">{log.last}</p>
	</section>
}
