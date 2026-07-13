import { computed } from '@markless/core';

export default function ParallelAsync() @{
	const first = computed(async () => ({ value: 11 }));
	const second = computed(async () => ({ value: 23 }));
	const third = computed(async () => ({ value: 37 }));
	const fourth = computed(async () => ({ value: 41 }));
	<section data-parallel-async>
		@try { <p data-async-settled>parallel first {first.value}</p> } @pending { <p>parallel pending</p> } @catch { <p>parallel failed</p> }
		@try { <p data-async-settled>parallel second {second.value}</p> } @pending { <p>parallel pending</p> } @catch { <p>parallel failed</p> }
		@try { <p data-async-settled>parallel third {third.value}</p> } @pending { <p>parallel pending</p> } @catch { <p>parallel failed</p> }
		@try { <p data-async-settled>parallel fourth {fourth.value}</p> } @pending { <p>parallel pending</p> } @catch { <p>parallel failed</p> }
	</section>
}
