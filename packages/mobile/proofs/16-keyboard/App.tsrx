import { state } from '@markless/core';

export default function App() @{
	let note = state('');
	<main>
		<h1>Keyboard</h1>
		<p>Line 1</p>
		<p>Line 2</p>
		<p>Line 3</p>
		<p>Line 4</p>
		<p>Line 5</p>
		<p>Line 6</p>
		<p>Line 7</p>
		<p>Line 8</p>
		<p>Line 9</p>
		<p>Line 10</p>
		<p>Line 11</p>
		<p>Line 12</p>
		<p>Line 13</p>
		<p>Line 14</p>
		<p>Line 15</p>
		<p>Line 16</p>
		<p>Line 17</p>
		<p>Line 18</p>
		<p>Line 19</p>
		<p>Line 20</p>
		<p>Line 21</p>
		<p>Line 22</p>
		<p>Line 23</p>
		<p>Line 24</p>
		<p>Line 25</p>
		<p>Line 26</p>
		<p>Line 27</p>
		<p>Line 28</p>
		<p>Line 29</p>
		<p>Line 30</p>
		<p>Line 31</p>
		<p>Line 32</p>
		<p>Line 33</p>
		<p>Line 34</p>
		<p>Line 35</p>
		<p>Line 36</p>
		<p>Line 37</p>
		<p>Line 38</p>
		<p>Line 39</p>
		<p>Line 40</p>
		<p>Line 41</p>
		<p>Line 42</p>
		<p>Line 43</p>
		<p>Line 44</p>
		<p>Line 45</p>
		<p>Line 46</p>
		<p>Line 47</p>
		<p>Line 48</p>
		<p>Line 49</p>
		<p>Line 50</p>
		<input aria-label="Note" value={note} onInput={(event) => (note = event.currentTarget.value)} />
		<p>Note says {note}</p>
	</main>
}
