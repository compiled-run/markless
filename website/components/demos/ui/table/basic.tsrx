import Preview from '../../../ui/preview.tsrx';
import Pantry from './example.tsrx';

export default function TableDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Pantry />
	</Preview>
}
