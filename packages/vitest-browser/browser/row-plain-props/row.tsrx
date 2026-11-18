export default function Row({ id, picked }: { id: string; picked: string }) @{
	<li id={'item-' + id} class={id === picked ? 'on' : ''}>{id}</li>
}
