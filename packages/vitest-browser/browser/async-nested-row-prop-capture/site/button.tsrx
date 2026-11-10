export default function Button({ onClick, children }: { onClick: () => void; children: unknown }) @{
	<button type="button" data-add onClick={onClick}>{children}</button>
}
