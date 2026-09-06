import { resizable } from '@markless/ui';

// Nothing styles `resizable.item` from here: the family owns that element's `style`.
const group = 'display: flex; inline-size: min(32rem, 100%); block-size: 8rem; border: 2px solid var(--code-edge); border-radius: 6px; background: var(--paper); overflow: clip';
const divider = 'flex: none; inline-size: 6px; background: var(--code-edge); cursor: col-resize; touch-action: none';
const pane = 'margin: 0; padding: 0.6em 0.7em; font-weight: 700';

export default function Workspace() @{
	<resizable.root defaultSizes={{ files: 28, editor: 44, notes: 28 }} style={group}>
		<resizable.item value="files">
			<p style={pane}>Files</p>
		</resizable.item>
		<resizable.thumb value="files" min={15} max={55} aria-label="Resize files" style={divider} />
		<resizable.item value="editor">
			<p style={pane}>Editor</p>
		</resizable.item>
		<resizable.thumb value="editor" min={20} max={70} aria-label="Resize editor" style={divider} />
		<resizable.item value="notes">
			<p style={pane}>Notes</p>
		</resizable.item>
	</resizable.root>
}
