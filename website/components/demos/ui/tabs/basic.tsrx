import Preview from '../../../ui/preview.tsrx';
import Account from './account.tsrx';

export default function TabsDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Account />
	</Preview>
}
