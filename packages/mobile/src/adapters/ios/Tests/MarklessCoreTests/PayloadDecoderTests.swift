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
