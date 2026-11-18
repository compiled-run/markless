import SaveForm from './save-form.tsrx';

export default function Toolbar(props: {
	readonly name: string;
	readonly onSave: (event: SubmitEvent) => void | Promise<void>;
}) @{
	<div class="toolbar">
		<SaveForm name={props.name} onSave={props.onSave} />
	</div>
}
