import { gridlist } from '@markless/ui';

const list = 'display: grid; gap: 0.4em; inline-size: min(30rem, 100%)';
const cell = 'display: flex; gap: 0.6em; align-items: center; padding: 0.45em 0.7em; border: 2px solid var(--code-edge); border-radius: 6px; background: var(--paper)';
const grow = 'flex: 1; font-weight: 700';
const quiet = 'font-size: var(--step--2); opacity: 0.7';
const button = 'padding: 0.15em 0.7em; border: 1px solid var(--code-edge); border-radius: 999px; background: var(--raised); color: var(--ink); font: inherit; font-size: var(--step--2); cursor: pointer';

export default function Files() @{
	<gridlist.root selectable multiple value={['moodboard']} style={list}>
		<gridlist.label style={quiet}>Shared with the studio</gridlist.label>
		<gridlist.item value="moodboard">
			<gridlist.itemcontent style={cell}>
				<gridlist.itemlabel style={grow}>moodboard.png</gridlist.itemlabel>
				<span style={quiet}>2.4 MB</span>
				<gridlist.itemtrigger style={button}>Rename</gridlist.itemtrigger>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="invoice">
			<gridlist.itemcontent style={cell}>
				<gridlist.itemlabel style={grow}>invoice-april.pdf</gridlist.itemlabel>
				<span style={quiet}>88 KB</span>
				<gridlist.itemtrigger style={button}>Rename</gridlist.itemtrigger>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="sardines">
			<gridlist.itemcontent style={cell}>
				<gridlist.itemlabel style={grow}>sardines-on-toast.jpg</gridlist.itemlabel>
				<span style={quiet}>1.1 MB</span>
				<gridlist.itemtrigger style={button}>Rename</gridlist.itemtrigger>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
