import { datebox } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Booking</h1>
		<datebox.root value="2024-03-30" name="starts">
			<datebox.label>Start date</datebox.label>
			<datebox.monthinput />
			<datebox.dayinput />
			<datebox.yearinput />
			<datebox.field />
		</datebox.root>
	</main>
}
