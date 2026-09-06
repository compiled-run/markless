import { table } from '@markless/ui';

const grid = 'border-collapse: collapse; inline-size: min(32rem, 100%); font-size: var(--step--1)';
const title = 'padding-block-end: 0.4em; font-weight: 700; text-align: left';
const head = 'padding: 0.35em 0.6em; border-block-end: 2px solid var(--code-edge); font-size: var(--step--2); letter-spacing: 0.06em; text-transform: uppercase; text-align: left';
const sorts = 'padding: 0.35em 0.6em; border-block-end: 2px solid var(--code-edge); font-size: var(--step--2); letter-spacing: 0.06em; text-transform: uppercase; text-align: left; cursor: pointer';
const cell = 'padding: 0.4em 0.6em; border-block-end: 1px solid var(--code-edge); text-align: left';

export default function Pantry() @{
	<table.root multiple value={['jam']} sort={{ column: 'jars', direction: 'descending' }} style={grid}>
		<caption style={title}>What the pantry put up</caption>
		<thead>
			<tr>
				<th style={head}>Preserve</th>
				<table.coltrigger value="jars" style={sorts}>Jars</table.coltrigger>
				<table.coltrigger value="sealed" style={sorts}>Sealed</table.coltrigger>
			</tr>
		</thead>
		<tbody>
			<table.item value="jam">
				<table.itemcontent rowheader style={cell}>Damson jam</table.itemcontent>
				<table.itemcontent style={cell}>48</table.itemcontent>
				<table.itemcontent style={cell}>In August</table.itemcontent>
			</table.item>
			<table.item value="chutney">
				<table.itemcontent rowheader style={cell}>Green tomato chutney</table.itemcontent>
				<table.itemcontent style={cell}>31</table.itemcontent>
				<table.itemcontent style={cell}>Last week</table.itemcontent>
			</table.item>
			<table.item value="marmalade">
				<table.itemcontent rowheader style={cell}>Seville marmalade</table.itemcontent>
				<table.itemcontent style={cell}>12</table.itemcontent>
				<table.itemcontent style={cell}>In March</table.itemcontent>
			</table.item>
		</tbody>
	</table.root>
}
