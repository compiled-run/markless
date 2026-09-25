import { state } from '@markless/core';

function Shell(props) @{
	<div class="shell" data-shell>{props.children}</div>
}

export default function WholePropsLayout(props) @{
	let opened = state(0);
	<section class="frame" data-frame title={props.title}>
		<button type="button" data-open onClick={() => { opened = opened + 1; }}>{opened}</button>
		<Shell>{props.children}</Shell>
	</section>
}
