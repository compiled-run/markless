import { spell } from './barrel.ts';

// The forwarded focus handler resumes the page before the family's own module loads.
export default function Spelling() @{
	<spell.root word="ab">
		<ol>
			<spell.tile />
			<spell.tile />
			<spell.tile />
		</ol>
		<spell.field onFocus={() => {}} />
		<spell.extend />
	</spell.root>
}
