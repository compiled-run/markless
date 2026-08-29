import { table } from '../../index.ts';

// Two tables on one page. Each roots its own instance, so a walk in one moves
// nothing in the other and each keeps its own picked set.
export default function TwoTables() @{
	<section>
		<table.root multiple data-testid="left-root">
			<caption>Sources</caption>
			<tbody>
				<table.item value="index" data-testid="left-index-item">
					<table.rowcontent rowheader data-testid="left-index-name">index.ts</table.rowcontent>
					<table.rowcontent data-testid="left-index-size">2.0 kB</table.rowcontent>
				</table.item>
				<table.item value="app" data-testid="left-app-item">
					<table.rowcontent rowheader data-testid="left-app-name">app.tsrx</table.rowcontent>
					<table.rowcontent data-testid="left-app-size">3.0 kB</table.rowcontent>
				</table.item>
			</tbody>
		</table.root>
		<table.root multiple data-testid="right-root">
			<caption>Docs</caption>
			<tbody>
				<table.item value="intro" data-testid="right-intro-item">
					<table.rowcontent rowheader data-testid="right-intro-name">intro.md</table.rowcontent>
					<table.rowcontent data-testid="right-intro-size">1.0 kB</table.rowcontent>
				</table.item>
				<table.item value="guide" data-testid="right-guide-item">
					<table.rowcontent rowheader data-testid="right-guide-name">guide.md</table.rowcontent>
					<table.rowcontent data-testid="right-guide-size">5.0 kB</table.rowcontent>
				</table.item>
			</tbody>
		</table.root>
	</section>
}
