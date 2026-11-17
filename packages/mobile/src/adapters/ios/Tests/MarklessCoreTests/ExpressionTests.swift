import Foundation
@testable import MarklessCore
import Testing

// Written by marklessAttributeValue (packages/web/src/dom-attribute.ts) for each [name, value] pair.
@Test func writesAttributesAsTheWebDoes() throws {
	let url = try #require(Bundle.module.url(forResource: "Fixtures/attribute-values", withExtension: "json"))
	guard case let .array(cases) = try JSONValue.parse(Data(contentsOf: url)) else { Issue.record("not an array"); return }
	#expect(cases.count > 40)
	for item in cases {
		guard case let .array(triple) = item, case let .string(name) = triple[0] else { Issue.record("bad case"); continue }
		let value: NativeScalar = switch triple[1] {
		case let .bool(flag): .bool(flag)
		case let .number(number): .number(number)
		case let .string(text): .string(text)
		default: .string("unreachable")
		}
		let expected: String? = if case let .string(text) = triple[2] { text } else { nil }
		#expect(marklessAttributeValue(name, value) == expected, "\(item.jsonText)")
	}
}

@Test func evaluatesExpressionsWithJavaScriptMeaning() throws {
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(Data("""
		{"version":"markless.native-view/0","component":"E","cells":[{"id":"state:n","name":"n","initial":0},{"id":"state:s","name":"s","initial":"0"}],
		"nodes":[],"events":[],"handlers":[]}
		""".utf8)))
	#expect(try runtime.evaluate(.equals(.cell("state:n"), .cell("state:s"))) == .bool(false))
	#expect(try runtime.evaluate(.equals(.cell("state:n"), .literal(.number(-0.0)))) == .bool(true))
	#expect(try runtime.evaluate(.not(.cell("state:s"))) == .bool(false))
	#expect(try runtime.evaluate(.conditional(test: .cell("state:n"), whenTrue: .literal(.string("a")), whenFalse: .literal(.string("b")))) == .string("b"))
}

@Test func nestedArmsShowOnlyUnderAShownBranch() throws {
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(Data("""
		{"version":"markless.native-view/0","component":"N","cells":[{"id":"state:a","name":"a","initial":false},{"id":"state:b","name":"b","initial":true}],
		"nodes":[{"kind":"element","id":"h0","element":"div","parent":null},
		{"kind":"branch","id":"branch-site:0","parent":"h0","test":{"cell":"state:a"},"arms":1},
		{"kind":"branch","id":"branch-site:1","parent":"h0","test":{"cell":"state:b"},"arms":1,"arm":{"branch":"branch-site:0","index":0}},
		{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"text":"deep"}],"arm":{"branch":"branch-site:1","index":0}},
		{"kind":"element","id":"h1","element":"button","parent":"h0"},
		{"kind":"text","id":"h1:text0","parent":"h1","parts":[{"text":"go"}]}],
		"events":[{"host":"h1","event":"activate","handler":"handler:0"}],
		"handlers":[{"id":"handler:0","ops":[{"op":"toggle","cell":"state:a"},{"op":"toggle","cell":"state:b"}]}]}
		""".utf8)))
	#expect(try runtime.texts().map(\.node) == ["h1:text0"])
	#expect(try runtime.arms().map(\.node) == ["branch-site:0"])
	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h1")) == [.arm(node: "branch-site:0", index: 0)])
	#expect(try runtime.arms().map(\.index) == [0, nil])
	#expect(try runtime.texts().map(\.node) == ["h1:text0"])
}
