import { state } from '@markless/core';
import { SideNav } from './ccr-nav.tsrx';

const STEPS = ['one', 'two', 'three'];
const GROUPS = [
	{ id: 'g1', items: ['x', 'y'] },
	{ id: 'g2', items: ['z'] },
];

export default function ConstCollectionRowsPage() @{
	let path = state('/');
	let current = state('one');
	<main>
		<SideNav pathname={path} />
		<ol data-steps>
			@for (const step of STEPS; index i; key step) {
				<li data-step={step} aria-current={step === current ? 'step' : undefined}>
					{i + 1}. {step} {step === current ? '(here)' : ''}
				</li>
			}
		</ol>
		<div data-groups>
			@for (const group of GROUPS; key group.id) {
				<ul data-group={group.id}>
					@for (const item of group.items; key item) {
						<li data-item={item} data-picked={item === current ? 'yes' : 'no'}>{item}</li>
					}
				</ul>
			}
		</div>
		<button type="button" data-pick-z onClick={() => (current = 'z')}>pick z</button>
		<button type="button" data-go-start onClick={() => (path = '/start-here')}>start</button>
		<button type="button" data-go-directives onClick={() => (path = '/directives')}>
			directives
		</button>
		<button type="button" data-next onClick={() => (current = current === 'one' ? 'two' : 'three')}>
			next
		</button>
	</main>
}
