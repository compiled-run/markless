export default function Badge({ mood }: { readonly mood: string }) @{
	<b data-badge>{mood}</b>
}
