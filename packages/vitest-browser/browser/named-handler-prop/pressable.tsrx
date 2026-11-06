export default function Pressable({ onClick, children, name }: { onClick: () => void; children?: unknown; name: string }) @{
	<button type="button" data-press={name} onClick={onClick}>{children}</button>
}
