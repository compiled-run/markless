import MarklessCore
import Testing

// Pairs printed by Node's String(x).
private let javaScriptStrings: [(Double, String)] = [
	(1, "1"), (-1, "-1"), (0.1, "0.1"), (0.5, "0.5"), (1e21, "1e+21"), (1e20, "100000000000000000000"),
	(1.2345678901234568e20, "123456789012345680000"), (1.5e-7, "1.5e-7"), (0.000001, "0.000001"),
	(0.000001234, "0.000001234"), (-0.0, "0"), (9007199254740992, "9007199254740992"),
	(9007199254740994, "9007199254740994"), (1.0 / 3, "0.3333333333333333"), (5e-324, "5e-324"),
	(1.7976931348623157e308, "1.7976931348623157e+308"), (100, "100"), (-2.5, "-2.5"), (123.456, "123.456"),
	(1e-7, "1e-7"), (0.1 + 0.2, "0.30000000000000004"), (.nan, "NaN"), (.infinity, "Infinity"),
	(-.infinity, "-Infinity"),
]

@Test func formatsNumbersAsJavaScriptStringDoes() {
	for (value, expected) in javaScriptStrings {
		#expect(formatJavaScriptNumber(value) == expected, "String(\(value))")
	}
}

@Test func quotesStringsAsJSONStringifyDoes() {
	#expect(quoteJavaScriptString("a\"b\\c\n\u{01}é😀") == "\"a\\\"b\\\\c\\n\\u0001é😀\"")
}
