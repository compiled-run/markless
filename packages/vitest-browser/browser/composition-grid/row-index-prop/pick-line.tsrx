export default function PickLine({ label, onPick }: { label: string; onPick: () => void }) @{
	<p data-r={label}>
		<span data-text>{label}</span>
		<button data-pick onClick={() => onPick()}>pick</button>
	</p>
}
