import { computed, state } from '@markless/core';

function Ticker({ symbol }: { symbol: string }) @{
	<b data-ticker>{symbol}</b>
}

export function ForecastDesk() @{
	let city = state('Oslo');
	let market = state('A');
	let volume = state(5);
	const weather = computed(async () => {
		const at = city;
		await new Promise((resolve) => setTimeout(resolve, at === 'Oslo' ? 10 : 400));
		return { sky: 'Sky ' + at };
	});
	const stocks = computed(async () => {
		const m = market;
		await new Promise((resolve) => setTimeout(resolve, m === 'A' ? 10 : 1_300));
		return { top: 'Top ' + m, rows: m === 'A' ? [{ code: 'x' }, { code: 'y' }] : [{ code: 'z' }] };
	});
	const summary = computed(() => 'Forecast: ' + weather.sky);

	<article>
		<button type="button" data-market onClick={() => (market = 'B')}>Market</button>
		<button type="button" data-city onClick={() => (city = 'Rome')}>City</button>
		@try {
			<div data-desk>
				<input data-volume type="range" value={volume} onInput={(event) => (volume = Number(event.currentTarget.value))} />
				<ol data-rows>
					@for (const row of stocks.rows; key row.code) {
						<li>{row.code}</li>
					}
				</ol>
				<Ticker symbol={stocks.top} />
				<p data-summary title={summary}>Forecast</p>
				<span data-sky>{weather.sky}</span>
			</div>
		} @pending {
			<p data-pending>Loading desk</p>
		} @catch {
			<p data-failed>Desk broken</p>
		}
	</article>
}
