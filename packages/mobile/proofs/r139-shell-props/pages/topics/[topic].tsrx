import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';

export default function Topic({ params }: PageProps<{ topic: string }>) @{
	let picks = state(0);
	const note = computed(() => (picks > 1 ? `Many ${params.topic}` : `Few ${params.topic}`));
	<Shell title={params.topic} note={note} count={picks * 2}>
		<button onClick={() => picks++}>Pick one</button>
	</Shell>
}
