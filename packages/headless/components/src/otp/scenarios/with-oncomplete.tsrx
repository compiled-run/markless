import { state } from '@markless/core';
import * as otp from '../index.ts';

// What a real sign-in does with a finished code: the page counts the completions
// so a second, no-op input cannot fire a second submit.
export default function WithOnComplete() @{
	const log = state({ code: '', completions: 0 });

	<section>
		<otp.root
			length={4}
			data-testid="root"
			onComplete={(code: string) => {
				log.code = code;
				log.completions = log.completions + 1;
			}}
		>
			<otp.field data-testid="field" aria-label="Verification code" />
			<otp.item index={0} data-testid="item-0" />
			<otp.item index={1} data-testid="item-1" />
			<otp.item index={2} data-testid="item-2" />
			<otp.item index={3} data-testid="item-3" />
		</otp.root>
		<p data-testid="code">{log.code}</p>
		<p data-testid="completions">{log.completions}</p>
	</section>
}
