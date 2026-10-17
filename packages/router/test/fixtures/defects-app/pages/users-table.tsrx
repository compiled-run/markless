import { menus } from '../src/menu-cells.tsrx';
import { UserRow } from '../src/user-row.tsrx';

export default function UsersTablePage() @{
	const m = menus();
	<main>
		<table>
			<tbody>
				<UserRow name="Ada" instance="-0" />
				<UserRow name="Brian" instance="-1" />
				<UserRow name="Cleo" instance="-2" />
			</tbody>
		</table>
		<output data-open>{m.open}</output>
		<output data-at>{m.at}</output>
	</main>;
}
