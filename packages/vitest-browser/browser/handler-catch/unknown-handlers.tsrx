import { computed, state } from '@markless/core';
import { actions, saveReport } from './ledger.ts';

function Relay({ name, onSave }) @{
	@try {
		<button type="button" data-relay-save={name} onClick={onSave}>Relay</button>
	} @catch (error, reset) {
		<>
			<p data-relay-failed={name}>{error.message}</p>
			<button type="button" data-relay-retry={name} onClick={() => reset()}>Retry</button>
		</>
	}
}

function Member({ days }) @{
	<button type="button" data-member-save onClick={() => actions.save(days)}>Member</button>
}

// Handlers whose result the compiler cannot see, and callbacks a child calls inside its own @try, reject into the nearest @catch around the element.
export function UnknownHandlers() @{
	let outerNote = state('idle');
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 9 };
	});

	<main>
		@try {
			<div>
				<p data-days>{report.days}</p>
				<button
					type="button"
					data-outer-save
					onClick={async () => {
						outerNote = 'outer';
						await saveReport(report.days);
					}}
				>
					Save all
				</button>
				<p data-outer-note>{outerNote}</p>
				@try {
					<section>
						<p data-inner-days>{report.days}</p>
						<Member days={report.days} />
					</section>
				} @catch (error, reset) {
					<>
						<p data-inner-failed>{error.message}</p>
						<button type="button" data-inner-retry onClick={() => reset()}>Retry</button>
					</>
				}
				<Relay
					name="inline"
					onSave={async () => {
						await saveReport(report.days);
					}}
				/>
				<Relay name="returned" onSave={() => saveReport(report.days)} />
			</div>
		} @catch (error, reset) {
			<>
				<p data-outer-failed>{error.message}</p>
				<button type="button" data-outer-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
