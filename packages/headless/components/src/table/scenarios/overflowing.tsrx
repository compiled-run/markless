import { table } from '../../index.ts';

// More rows than the frame around the table shows: the walk has to bring the
// row it lands on into view, which native focus() does on its own. Selection is
// what makes the rows focus stops at all.
export default function Overflowing() @{
	<div data-testid="frame" style="height: 60px; overflow: auto;">
		<table.root multiple data-testid="root">
			<caption>Files</caption>
			<tbody>
				<table.item value="a" data-testid="first-item"><td>a.ts</td></table.item>
				<table.item value="b"><td>b.ts</td></table.item>
				<table.item value="c"><td>c.ts</td></table.item>
				<table.item value="d"><td>d.ts</td></table.item>
				<table.item value="e"><td>e.ts</td></table.item>
				<table.item value="f"><td>f.ts</td></table.item>
				<table.item value="g"><td>g.ts</td></table.item>
				<table.item value="h"><td>h.ts</td></table.item>
				<table.item value="i"><td>i.ts</td></table.item>
				<table.item value="j" data-testid="last-item"><td>j.ts</td></table.item>
			</tbody>
		</table.root>
	</div>
}
