import Flip from './theme.tsrx';
import { ArmReader, DeskReader, Reader, RowReader } from './readers.tsrx';

export default function ReadersPage() @{
	<main>
		<Flip />
		<Reader />
		<ArmReader />
		<RowReader />
		<DeskReader />
	</main>
}
