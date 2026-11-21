export default function Picker({ onPick }: { readonly onPick: (value: string) => void }) @{
	<div>
		<button onClick={() => onPick('tea')}>Tea</button>
		<button onClick={() => onPick('coffee')}>Coffee</button>
	</div>
}
