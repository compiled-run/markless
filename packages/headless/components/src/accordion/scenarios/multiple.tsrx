import * as accordion from '../index.ts';

// Several sections may show at once, and the value is the list of the ones that
// do. Two are written open.
export default function Multiple() @{
	<section>
		<accordion.root multiple value={['engine', 'brakes']} data-testid="root">
			<accordion.item value="engine" data-testid="engine-item">
				<accordion.itemlabel data-testid="engine-label">
					<accordion.itemtrigger data-testid="engine-trigger">Engine</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="engine-content">
					Two litres, four cylinders.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="brakes" data-testid="brakes-item">
				<accordion.itemlabel data-testid="brakes-label">
					<accordion.itemtrigger data-testid="brakes-trigger">Brakes</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="brakes-content">
					Ventilated discs on every wheel.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="tyres" data-testid="tyres-item">
				<accordion.itemlabel data-testid="tyres-label">
					<accordion.itemtrigger data-testid="tyres-trigger">Tyres</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="tyres-content">
					Eighteen inch, all season.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}
