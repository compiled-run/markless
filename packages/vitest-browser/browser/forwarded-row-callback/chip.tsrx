export function Chip({ title, onPick }: { title: string; onPick: (title: string) => void }) @{
	<button type="button" data-chip={title} onClick={() => onPick(title)}>{title}</button>
}
