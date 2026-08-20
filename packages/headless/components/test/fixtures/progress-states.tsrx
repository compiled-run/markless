import { progress } from '../../src/index.ts';

// Five independently configured progress bars on one page: the loading case QDS
// uses everywhere, an unknown amount, a finished one, a custom top of the range
// and a custom range at both ends.
export function App() @{
	<section data-testid="states">
		<div data-case="loading">
			<progress.root value={30}>
				<progress.label>Export data 30%</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<div data-case="indeterminate">
			<progress.root value={null}>
				<progress.label>Loading...</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<div data-case="complete">
			<progress.root value={100}>
				<progress.label>Complete!</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<div data-case="custom-max">
			<progress.root value={20} max={25}>
				<progress.label>Custom Max Progress</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<div data-case="custom-range">
			<progress.root value={5000} min={2000} max={10000}>
				<progress.label>Custom Range Progress</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
	</section>
}
