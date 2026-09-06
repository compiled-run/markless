import Preview from '../../ui/preview.tsrx';
import DeliverySheet from './drawer-sheet.tsrx';

export default function DrawerDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<DeliverySheet />
	</Preview>
}
