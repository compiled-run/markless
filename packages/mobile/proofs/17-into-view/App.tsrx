import { element, state } from '@markless/core';

export default function App() @{
	let note = state('');
	const target = element<HTMLParagraphElement>();
	const field = element<HTMLInputElement>();
	<main>
		<h1>Into view</h1>
		<button onClick={() => target.scrollIntoView()}>Show target</button>
		<button onClick={() => field.focus()}>Focus field</button>
		<p>Gap 1</p>
		<p>Gap 2</p>
		<p>Gap 3</p>
		<p>Gap 4</p>
		<p>Gap 5</p>
		<p>Gap 6</p>
		<p>Gap 7</p>
		<p>Gap 8</p>
		<p>Gap 9</p>
		<p>Gap 10</p>
		<p>Gap 11</p>
		<p>Gap 12</p>
		<p>Gap 13</p>
		<p>Gap 14</p>
		<p>Gap 15</p>
		<p>Gap 16</p>
		<p>Gap 17</p>
		<p>Gap 18</p>
		<p>Gap 19</p>
		<p>Gap 20</p>
		<p>Gap 21</p>
		<p>Gap 22</p>
		<p>Gap 23</p>
		<p>Gap 24</p>
		<p>Gap 25</p>
		<p>Gap 26</p>
		<p>Gap 27</p>
		<p>Gap 28</p>
		<p>Gap 29</p>
		<p>Gap 30</p>
		<p>Gap 31</p>
		<p>Gap 32</p>
		<p>Gap 33</p>
		<p>Gap 34</p>
		<p>Gap 35</p>
		<p>Gap 36</p>
		<p>Gap 37</p>
		<p>Gap 38</p>
		<p>Gap 39</p>
		<p>Gap 40</p>
		<p>Gap 41</p>
		<p>Gap 42</p>
		<p>Gap 43</p>
		<p>Gap 44</p>
		<p>Gap 45</p>
		<p>Gap 46</p>
		<p>Gap 47</p>
		<p>Gap 48</p>
		<p>Gap 49</p>
		<p>Gap 50</p>
		<p>Gap 51</p>
		<p>Gap 52</p>
		<p>Gap 53</p>
		<p>Gap 54</p>
		<p>Gap 55</p>
		<p>Gap 56</p>
		<p>Gap 57</p>
		<p>Gap 58</p>
		<p>Gap 59</p>
		<p>Gap 60</p>
		<p el={target}>Target paragraph</p>
		<p>Gap 61</p>
		<p>Gap 62</p>
		<p>Gap 63</p>
		<p>Gap 64</p>
		<p>Gap 65</p>
		<p>Gap 66</p>
		<p>Gap 67</p>
		<p>Gap 68</p>
		<p>Gap 69</p>
		<p>Gap 70</p>
		<p>Gap 71</p>
		<p>Gap 72</p>
		<p>Gap 73</p>
		<p>Gap 74</p>
		<p>Gap 75</p>
		<p>Gap 76</p>
		<p>Gap 77</p>
		<p>Gap 78</p>
		<p>Gap 79</p>
		<p>Gap 80</p>
		<p>Gap 81</p>
		<p>Gap 82</p>
		<p>Gap 83</p>
		<p>Gap 84</p>
		<p>Gap 85</p>
		<p>Gap 86</p>
		<p>Gap 87</p>
		<p>Gap 88</p>
		<p>Gap 89</p>
		<p>Gap 90</p>
		<p>Gap 91</p>
		<p>Gap 92</p>
		<p>Gap 93</p>
		<p>Gap 94</p>
		<p>Gap 95</p>
		<p>Gap 96</p>
		<p>Gap 97</p>
		<p>Gap 98</p>
		<p>Gap 99</p>
		<p>Gap 100</p>
		<p>Gap 101</p>
		<p>Gap 102</p>
		<p>Gap 103</p>
		<p>Gap 104</p>
		<p>Gap 105</p>
		<p>Gap 106</p>
		<p>Gap 107</p>
		<p>Gap 108</p>
		<p>Gap 109</p>
		<p>Gap 110</p>
		<p>Gap 111</p>
		<p>Gap 112</p>
		<p>Gap 113</p>
		<p>Gap 114</p>
		<p>Gap 115</p>
		<p>Gap 116</p>
		<p>Gap 117</p>
		<p>Gap 118</p>
		<p>Gap 119</p>
		<p>Gap 120</p>
		<input el={field} aria-label="Far field" value={note} onInput={(event) => (note = event.currentTarget.value)} />
	</main>
}
