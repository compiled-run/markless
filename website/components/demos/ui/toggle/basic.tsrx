import Preview from '../../../ui/preview.tsrx';
import Notifications from './notifications.tsrx';

export default function ToggleDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Notifications />
	</Preview>
}
