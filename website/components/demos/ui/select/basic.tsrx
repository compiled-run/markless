import Preview from '../../../ui/preview.tsrx';
import Fruit from './fruit.tsrx';

export default function SelectDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Fruit />
	</Preview>
}
