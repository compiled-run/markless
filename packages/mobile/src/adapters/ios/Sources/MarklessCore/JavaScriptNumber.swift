/// JavaScript's `String(value)` for a number (ECMAScript Number::toString with radix 10).
public func formatJavaScriptNumber(_ value: Double) -> String {
	if value.isNaN { return "NaN" }
	if value == 0 { return "0" }
	if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
	let (digits, pointPosition) = shortestDigits(abs(value))
	let sign = value < 0 ? "-" : ""
	let k = digits.count
	let n = pointPosition
	if k <= n && n <= 21 { return sign + digits + String(repeating: "0", count: n - k) }
	if 0 < n && n <= 21 {
		let split = digits.index(digits.startIndex, offsetBy: n)
		return sign + digits[..<split] + "." + digits[split...]
	}
	if -6 < n && n <= 0 { return sign + "0." + String(repeating: "0", count: -n) + digits }
	let exponent = n - 1
	let exponentText = (exponent < 0 ? "-" : "+") + String(abs(exponent))
	if k == 1 { return sign + digits + "e" + exponentText }
	return sign + digits.prefix(1) + "." + digits.dropFirst() + "e" + exponentText
}

/// The shortest round-tripping decimal digits of a positive finite double and where the decimal point falls:
/// value = 0.digits × 10^pointPosition. Swift's own description already chooses the shortest closest digits.
private func shortestDigits(_ value: Double) -> (String, Int) {
	let text = value.description
	let parts = text.split(separator: "e", maxSplits: 1)
	let exponent = parts.count == 2 ? Int(parts[1])! : 0
	let mantissa = parts[0]
	let pieces = mantissa.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
	let whole = String(pieces[0])
	let fraction = pieces.count == 2 ? String(pieces[1]) : ""
	var all = Array(whole + fraction)
	var point = whole.count + exponent
	while all.first == "0" { all.removeFirst(); point -= 1 }
	while all.last == "0" { all.removeLast() }
	return (String(all), point)
}
