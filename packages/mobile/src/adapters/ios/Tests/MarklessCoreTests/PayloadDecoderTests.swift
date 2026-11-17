import Foundation
import MarklessCore
import Testing

private let counter = """
	{"version":"markless.native-view/0","component":"Counter","cells":[{"id":"state:count","name":"count","initial":0}],
	"nodes":[{"kind":"element","id":"h0","element":"main","parent":null},{"kind":"element","id":"h1","element":"button","parent":"h0"},
	{"kind":"text","id":"h1:text0","parent":"h1","parts":[{"text":"Count "},{"cell":"state:count"}]}],
	"events":[{"host":"h1","event":"activate","handler":"handler:event:0"}],
	"handlers":[{"id":"handler:event:0","ops":[{"op":"add","cell":"state:count","value":-1}]}]}
	"""

private func decode(_ text: String) throws -> NativeViewPayload { try NativeViewPayload.decode(Data(text.utf8)) }

private func rejection(_ text: String) -> String? {
	do { _ = try decode(text); return nil } catch { return "\(error)" }
}

@Test func decodesTheCounterAndRunsItsHandler() throws {
	let runtime = NativeRuntime(payload: try decode(counter))
	#expect(try runtime.texts().map(\.text) == ["Count 0"])
	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h1")) == [.text(node: "h1:text0", value: "Count -1")])
}

@Test(arguments: [
	("\"markless.native-view/0\"", "\"markless.native-view/1\"", "unsupported version"),
	("\"kind\":\"text\"", "\"kind\":\"comment\"", "unknown node kind \"comment\""),
	("\"op\":\"add\"", "\"op\":\"multiply\"", "unknown op \"multiply\""),
	("\"event\":\"activate\"", "\"event\":\"hover\"", "unknown event \"hover\""),
	("{\"text\":\"Count \"}", "{\"html\":\"Count \"}", "unknown text part"),
	("\"component\":\"Counter\"", "\"component\":\"Counter\",\"styles\":[]", "unknown field \"styles\""),
	("\"parent\":\"h0\"", "\"parent\":\"h9\"", "is not an earlier element"),
	("{\"cell\":\"state:count\"}", "{\"cell\":\"state:missing\"}", "reads unknown cell"),
	("\"value\":-1", "\"value\":\"1\"", "expected a number"),
])
func rejectsWhatItDoesNotKnow(find: String, replace: String, reason: String) throws {
	let mutated = counter.replacingOccurrences(of: find, with: replace)
	#expect(mutated != counter)
	let message = try #require(rejection(mutated))
	#expect(message.contains(reason), "\(message)")
}

@Test func rejectsDuplicateKeys() {
	#expect(rejection(counter.replacingOccurrences(of: "\"component\":\"Counter\"", with: "\"component\":\"A\",\"component\":\"B\""))?
		.contains("duplicate key") == true)
}

@Test func addOnAStringCellIsAnError() throws {
	let runtime = NativeRuntime(payload: try decode(counter.replacingOccurrences(of: "\"initial\":0", with: "\"initial\":\"x\"")))
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .activate, host: "h1")) }
}

private func runtime(cells: String, ops: String) throws -> NativeRuntime {
	try NativeRuntime(payload: decode("""
		{"version":"markless.native-view/0","component":"Ops","cells":[\(cells)],
		"nodes":[{"kind":"element","id":"h0","element":"button","parent":null,"attributes":{"class":"go mk-x"}},
		{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"state:a"},{"text":"|"},{"cell":"state:b"}]}],
		"events":[{"host":"h0","event":"activate","handler":"handler:x"}],"handlers":[{"id":"handler:x","ops":[\(ops)]}]}
		"""))
}

@Test func setAndToggleRunAsJavaScriptDoes() throws {
	let tap = NativeAction(event: .activate, host: "h0")
	let set = try runtime(
		cells: #"{"id":"state:a","name":"a","initial":1},{"id":"state:b","name":"b","initial":"x"}"#,
		ops: #"{"op":"set","cell":"state:a","value":"one"},{"op":"set","cell":"state:b","value":true}"#)
	#expect(try set.dispatch(tap) == [.text(node: "h0:text0", value: "one|true")])
	#expect(try set.dispatch(tap) == [])
	let toggle = try runtime(
		cells: #"{"id":"state:a","name":"a","initial":0},{"id":"state:b","name":"b","initial":"x"}"#,
		ops: #"{"op":"toggle","cell":"state:a"},{"op":"toggle","cell":"state:b"}"#)
	#expect(try toggle.dispatch(tap) == [.text(node: "h0:text0", value: "true|false")])
	#expect(try toggle.dispatch(tap) == [.text(node: "h0:text0", value: "false|true")])
}

@Test func attributesMustBeStrings() {
	let payload = #"{"version":"markless.native-view/0","component":"A","cells":[],"nodes":[{"kind":"element","id":"h0","element":"p","parent":null,"attributes":{"hidden":true}}],"events":[],"handlers":[]}"#
	#expect(rejection(payload)?.contains("attributes.hidden: expected a string") == true)
}
