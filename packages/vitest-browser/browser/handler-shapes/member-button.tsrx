export default function MemberButton(props: { name: string; onClick: () => void; children?: unknown }) @{
	<button type="button" data-press={props.name} onClick={props.onClick}>{props.children}</button>
}
