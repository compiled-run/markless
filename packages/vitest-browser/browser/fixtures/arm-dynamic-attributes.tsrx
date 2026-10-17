import { state } from '@markless/core';
import logo from './arm-logo.svg';

const DOCS_HOME = '/docs/';
const BADGE = { label: 'beta' };

function Tag(props: { name: string }) @{
	<em data-tag>{props.name}</em>
}

function Pic(props: { src: string }) @{
	<img data-pic src={props.src} alt="" />
}

export default function ArmDynamicAttributes() @{
	let open = state(false);
	let tone = state('calm');

	<main>
		<button type="button" data-toggle onClick={() => open = !open}>toggle</button>
		<button type="button" data-tone onClick={() => tone = tone === 'calm' ? 'loud' : 'calm'}>tone</button>
		@if (open) {
			<nav data-menu class={tone}>
				<a data-link href={DOCS_HOME + tone}>docs</a>
				<a data-home href={DOCS_HOME} title={BADGE.label}>home</a>
				<Tag name={tone} />
				<img data-logo src={logo} alt="" />
				<Pic src={logo} />
				<small data-badge>{BADGE.label}</small>
			</nav>
		}
	</main>
}
