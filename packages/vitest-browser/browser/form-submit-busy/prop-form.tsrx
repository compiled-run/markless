import { addItem } from '../mutations-refresh/server.ts';
import { Sender } from './sender.tsrx';

export function PropForm() @{
	<Sender onSave={async () => await addItem('prop')} />
}
