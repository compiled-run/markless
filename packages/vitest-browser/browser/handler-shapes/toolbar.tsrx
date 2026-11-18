import MemberButton from './member-button.tsrx';

export default function Toolbar(props: { name: string; onAdd: () => void }) @{
	<div><MemberButton name={props.name} onClick={props.onAdd}>Add</MemberButton></div>
}
