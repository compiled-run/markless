import { timebox } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Meeting</h1>
		<timebox.root value="14:30" name="at">
			<timebox.label>Start time</timebox.label>
			<timebox.hourinput />
			<timebox.minuteinput />
			<timebox.dayperiodinput />
			<timebox.field />
		</timebox.root>
	</main>
}
