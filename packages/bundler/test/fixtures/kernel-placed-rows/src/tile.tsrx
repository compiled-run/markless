export default function Tile({
	id,
	name,
	mark,
	onPick,
}: {
	id: number;
	name: string;
	mark: string;
	onPick: (name: string) => void;
}) @{
	<li data-row={id}>
		<button data-pick onClick={() => onPick(name)}>{name}</button>
		<span data-mark-text>{mark}</span>
	</li>
}
