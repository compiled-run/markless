import { tree } from '../../index.ts';

// More rows than the container shows: the walk has to bring the row it lands on
// into view, which native focus() does on its own.
export default function Overflowing() @{
	<tree.root aria-label="Project files" data-testid="root" style="height: 60px; overflow: auto;">
		<tree.item leaf level={1} data-testid="first-item">
			<tree.itemlabel>a.ts</tree.itemlabel>
		</tree.item>
		<tree.item leaf level={1}><tree.itemlabel>b.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>c.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>d.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>e.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>f.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>g.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>h.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1}><tree.itemlabel>i.ts</tree.itemlabel></tree.item>
		<tree.item leaf level={1} data-testid="last-item">
			<tree.itemlabel>j.ts</tree.itemlabel>
		</tree.item>
	</tree.root>
}
