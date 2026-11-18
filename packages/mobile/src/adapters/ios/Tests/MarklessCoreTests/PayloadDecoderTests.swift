import Foundation
@testable import MarklessCore
import Testing

private let counter = """
	{"version":"markless.native-view/0","component":"Counter","cells":[{"id":"state:count","name":"count","initial":0}],
	"nodes":[{"kind":"element","id":"h0","element":"main","parent":null},{"kind":"element","id":"h1","element":"button","parent":"h0"},
	{"kind":"text","id":"h1:text0","parent":"h1","parts":[{"text":"Count "},{"cell":"state:count"}]}],
	"events":[{"host":"h1","event":"activate","handler":"handler:event:0"}],
	"handlers":[{"id":"handler:event:0","ops":[{"op":"assign","cell":"state:count","value":{"binary":"-","left":{"unary":"+","value":{"cell":"state:count"}},"right":{"literal":1}}}]}]}
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
	("\"op\":\"assign\"", "\"op\":\"add\"", "unknown op \"add\""),
	("\"binary\":\"-\"", "\"binary\":\"**\"", "unknown operator \"**\""),
	("{\"literal\":1}", "{\"literal\":1,\"extra\":2}", "unknown expression"),
	("\"event\":\"activate\"", "\"event\":\"hover\"", "unknown event \"hover\""),
	("{\"text\":\"Count \"}", "{\"html\":\"Count \"}", "unknown text part"),
	("\"component\":\"Counter\"", "\"component\":\"Counter\",\"styles\":[]", "unknown field \"styles\""),
	("\"parent\":\"h0\"", "\"parent\":\"h9\"", "is not an earlier element"),
	("{\"cell\":\"state:count\"}", "{\"cell\":\"state:missing\"}", "reads unknown cell"),
	("{\"literal\":1}", "{\"literal\":[1]}", "expected a number, string, boolean or null"),
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

@Test func attributesMustBeStrings() {
	let payload = #"{"version":"markless.native-view/0","component":"A","cells":[],"nodes":[{"kind":"element","id":"h0","element":"p","parent":null,"attributes":{"hidden":true}}],"events":[],"handlers":[]}"#
	#expect(rejection(payload)?.contains("attributes.hidden: expected a string") == true)
}

@Test func routesMatchOneDecodedSegmentPerParam() {
	let route = NativeRoute(pattern: "/fruits/[fruit]", params: ["fruit"])
	#expect(route.match("/fruits/apple") == [NativeRouteParam(name: "fruit", value: "apple")])
	#expect(route.match("/fruits/blood%20orange/") == [NativeRouteParam(name: "fruit", value: "blood orange")])
	#expect(route.match("/fruits") == nil)
	#expect(route.match("/veg/apple") == nil)
	#expect(route.match("/fruits/a/b") == nil)
}

@Test func nullReadsAsEmptyTextButNullInATemplate() throws {
	let runtime = NativeRuntime(payload: try decode("""
		{"version":"markless.native-view/0","component":"N","cells":[{"id":"state:x","name":"x","initial":null}],
		"nodes":[{"kind":"element","id":"h0","element":"p","parent":null},
		{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"text":"["},{"cell":"state:x"},{"expr":{"template":["<",{"cell":"state:x"},">"]}},{"text":"]"}]}],
		"events":[],"handlers":[]}
		"""))
	#expect(try runtime.texts().map(\.text) == ["[<null>]"])
}

private let sheet = """
	{"version":"markless.native-view/0","component":"S","cells":[{"id":"state:open","name":"open","initial":false}],
	"nodes":[{"kind":"element","id":"h0","element":"main","parent":null},
	{"kind":"sheet","id":"sheet:0","parent":"h0","open":{"cell":"state:open"},"snapPoints":[0.5,1],"dismissible":true,"modal":true},
	{"kind":"element","id":"h1","element":"p","parent":"sheet:0"},{"kind":"text","id":"h1:text0","parent":"h1","parts":[{"text":"Inside"}]}],
	"events":[{"host":"h0","event":"activate","handler":"handler:open"},{"host":"sheet:0","event":"dismiss","handler":"handler:keep"}],
	"handlers":[{"id":"handler:open","ops":[{"op":"assign","cell":"state:open","value":{"literal":true}}]},
	{"id":"handler:keep","ops":[{"op":"assign","cell":"state:open","value":{"literal":1}}]}]}
	"""

@Test func aSheetsContentIsShownWhileClosedAndADismissThatKeepsItOpenJournalsNothing() throws {
	let runtime = NativeRuntime(payload: try decode(sheet))
	#expect(try runtime.texts().map(\.text) == ["Inside"])
	#expect(try runtime.sheets().map(\.open) == [false])
	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h0")) == [.sheet(node: "sheet:0", open: true)])
	#expect(try runtime.dispatch(NativeAction(event: .dismiss, host: "sheet:0")) == [])
}

@Test(arguments: [
	("\"snapPoints\":[0.5,1]", "\"snapPoints\":[1,0.5]", "a sheet rests at"),
	("\"snapPoints\":[0.5,1]", "\"snapPoints\":[0.25,0.5,1]", "a sheet rests at"),
	("\"snapPoints\":[0.5,1]", "\"snapPoints\":[0.5]", "a sheet rests at"),
	("\"modal\":true}", "\"modal\":true,\"arm\":{\"branch\":\"b\",\"index\":0}}", "unknown field \"arm\""),
	("\"host\":\"sheet:0\"", "\"host\":\"h0\"", "which is not a sheet"),
	("\"event\":\"activate\"", "\"event\":\"dismiss\"", "which is not a sheet"),
	("\"host\":\"h0\"", "\"host\":\"sheet:0\"", "which is not an element"),
])
func rejectsSheetsItCannotPresent(find: String, replace: String, reason: String) throws {
	let mutated = sheet.replacingOccurrences(of: find, with: replace)
	#expect(mutated != sheet)
	let message = try #require(rejection(mutated))
	#expect(message.contains(reason), "\(message)")
}
