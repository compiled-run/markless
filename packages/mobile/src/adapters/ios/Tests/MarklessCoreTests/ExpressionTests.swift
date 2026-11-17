import Foundation
@testable import MarklessCore
import Testing

private func fixture(_ name: String) throws -> JSONValue {
	try JSONValue.parse(Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json"))))
}

private func field(_ value: JSONValue, _ key: String) -> JSONValue? {
	guard case let .object(fields) = value else { return nil }
	return fields.first { $0.0 == key }?.1
}

// Written by marklessAttributeValue (packages/web/src/dom-attribute.ts) for each [name, value] pair.
@Test func writesAttributesAsTheWebDoes() throws {
	guard case let .array(cases) = try fixture("attribute-values") else { Issue.record("not an array"); return }
	#expect(cases.count > 40)
	for item in cases {
		guard case let .array(triple) = item, case let .string(name) = triple[0] else { Issue.record("bad case"); continue }
		let value: NativeValue = switch triple[1] {
		case let .bool(flag): .bool(flag)
		case let .number(number): .number(number)
		case let .string(text): .string(text)
		default: .null
		}
		let expected: String? = if case let .string(text) = triple[2] { text } else { nil }
		#expect(marklessAttributeValue(name, value) == expected, "\(item.jsonText)")
	}
}

// Written by Tests/write-expression-cases.ts from the reference evaluator.
@Test func evaluatesExpressionsAsTheReferenceDoes() throws {
	guard case let .array(cases) = try fixture("expression-cases") else { Issue.record("not an array"); return }
	#expect(cases.count > 1000)
	let runtime = NativeRuntime(payload: try NativeViewPayload.decode(Data("""
		{"version":"markless.native-view/0","component":"E","cells":[],"nodes":[],"events":[],"handlers":[]}
		""".utf8)))
	for item in cases {
		let expr = try NativeViewPayload.decodeExpression(try #require(field(item, "expr")))
		let value = try runtime.evaluate(expr)
		let type = switch value {
		case .number: "number"
		case .string: "string"
		case .bool: "boolean"
		case .null: "null"
		case .array, .object: "object"
		}
		let label = field(item, "expr")!.jsonText
		#expect(.string(type) == field(item, "type"), "\(label)")
		#expect(.string(value.text) == field(item, "text"), "\(label)")
		#expect(.string(value.json.jsonText) == field(item, "json"), "\(label)")
		let negativeZero = if case let .number(number) = value { number == 0 && number.sign == .minus } else { false }
		#expect(.bool(negativeZero) == field(item, "negativeZero"), "\(label)")
	}
}

@Test func storageIsReadAtMountAndWrittenOnEveryWrite() throws {
	let payload = try NativeViewPayload.decode(Data("""
		{"version":"markless.native-view/0","component":"S","cells":[{"id":"state:visits","name":"visits","initial":0,"storage":{"key":"visits"}}],
		"nodes":[{"kind":"element","id":"h0","element":"button","parent":null},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"state:visits"}]}],
		"events":[{"host":"h0","event":"activate","handler":"handler:0"}],
		"handlers":[{"id":"handler:0","ops":[{"op":"assign","cell":"state:visits","value":{"binary":"+","left":{"cell":"state:visits"},"right":{"literal":1}}}]}]}
		""".utf8))
	let store = MemoryStore()
	#expect(try NativeRuntime(payload: payload, store: store).texts().map(\.text) == ["0"])
	let first = NativeRuntime(payload: payload, store: store)
	_ = try first.dispatch(NativeAction(event: .activate, host: "h0"))
	#expect(store.values["visits"] == .number(1))
	#expect(try NativeRuntime(payload: payload, store: store).texts().map(\.text) == ["1"])
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
		"handlers":[{"id":"handler:0","ops":[{"op":"assign","cell":"state:a","value":{"unary":"!","value":{"cell":"state:a"}}},
		{"op":"assign","cell":"state:b","value":{"unary":"!","value":{"cell":"state:b"}}}]}]}
		""".utf8)))
	#expect(try runtime.texts().map(\.node) == ["h1:text0"])
	#expect(try runtime.arms().map(\.node) == ["branch-site:0"])
	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h1")) == [.arm(node: "branch-site:0", index: 0)])
	#expect(try runtime.arms().map(\.index) == [0, nil])
	#expect(try runtime.texts().map(\.node) == ["h1:text0"])
}
