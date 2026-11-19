import { state } from '@markless/core';
import { numberbox } from '@markless/ui';

export default function App() @{
	const picked = state({ count: 2, cancelled: 0 });
	<main>
		<h1>Order</h1>
		<p>{`Ordered ${picked.count}`}</p>
		<p>{`Presses cancelled ${picked.cancelled}`}</p>
		<div onPointercancel={() => (picked.cancelled = picked.cancelled + 1)}>
			<numberbox.root
				value={2}
				min={0}
				max={9}
				onChange={(next: number | null) => {
					picked.count = next ?? 0;
				}}
			>
				<numberbox.label>Cups</numberbox.label>
				<numberbox.backtrigger>Fewer</numberbox.backtrigger>
				<numberbox.input />
				<numberbox.forwardtrigger>More</numberbox.forwardtrigger>
			</numberbox.root>
		</div>
		@for (const line of [
			'Beans', 'Water', 'Milk', 'Sugar', 'Cups', 'Lids', 'Sleeves', 'Stirrers', 'Napkins', 'Trays', 'Bags', 'Straws', 'Spoons', 'Plates', 'Bowls', 'Forks', 'Knives', 'Filters', 'Syrup', 'Cocoa', 'Tea', 'Honey', 'Lemons', 'Ice', 'Oats', 'Soy', 'Cream', 'Salt', 'Butter', 'Jam', 'Bread', 'Eggs', 'Flour', 'Rice', 'Pasta', 'Beans 2', 'Gloves', 'Soap', 'Towels', 'Bins',
		]; key line) {
			<p>{`Stock: ${line}`}</p>
		}
	</main>
}
