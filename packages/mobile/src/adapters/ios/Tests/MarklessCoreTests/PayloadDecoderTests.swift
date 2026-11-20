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
	("\"component\":\"Counter\"", "\"component\":\"Counter\",\"script\":{\"id\":\"a\",\"source\":\"\",\"services\":[\"storage\"]}", "unknown script service \"storage\""),
	("{\"literal\":1}", "{\"script\":\"fn:0\",\"bindings\":{\"n\":{\"slot\":\"state:count\"}}}", "a script binding is"),
	("{\"op\":\"assign\"", "{\"op\":\"script\",\"fn\":\"fn:0\",\"bindings\":{},\"then\":[]},{\"op\":\"assign\"", "unknown field \"then\""),
	("{\"literal\":1}", "{\"event\":\"wheel\"}", "unknown event read \"wheel\""),
	("{\"literal\":1}", "{\"focused\":false}", "focused is only ever true"),
	("{\"literal\":1}", "{\"contains\":{\"literal\":1}}", "unknown expression"),
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

private let overlay = """
	{"version":"markless.native-view/0","component":"O","cells":[{"id":"state:open","name":"open","initial":false},{"id":"state:why","name":"why","initial":""}],
	"nodes":[{"kind":"element","id":"h0","element":"main","parent":null},{"kind":"element","id":"h1","element":"button","parent":"h0"},
	{"kind":"element","id":"h2","element":"div","parent":"h0","attributes":{"overlay":"","aria-modal":"true"},
	"bindings":[{"attribute":"hidden","value":{"unary":"!","value":{"cell":"state:open"}}}]},
	{"kind":"element","id":"h3","element":"button","parent":"h2"},{"kind":"element","id":"h4","element":"button","parent":"h0"}],
	"events":[{"host":"h1","event":"activate","handler":"handler:open"},{"host":"h2","event":"dismiss","handler":"handler:dismiss"},
	{"host":"h4","event":"activate","handler":"handler:bad"}],
	"handlers":[{"id":"handler:open","ops":[{"op":"assign","cell":"state:open","value":{"literal":true}},{"op":"command","node":{"literal":"h3"},"command":"focus"}]},
	{"id":"handler:dismiss","ops":[{"op":"assign","cell":"state:why","value":{"event":"reason"}},{"op":"assign","cell":"state:open","value":{"literal":false}},
	{"op":"command","command":"focus","node":{"if":{"isElement":{"focusOrigin":{"literal":"h2"}}},"whenTrue":{"focusOrigin":{"literal":"h2"}},"whenFalse":{"literal":null}}}]},
	{"id":"handler:bad","ops":[{"op":"command","node":{"literal":"nope"},"command":"focus"}]}]}
	"""

@Test func runsTheOverlayStackFocusAndAnOutsidePress() throws {
	let runtime = NativeRuntime(payload: try decode(overlay))
	#expect(try runtime.overlays().isEmpty)
	#expect(try runtime.evaluate(.focused) == .string(nativeDocumentBody))
	#expect(try runtime.evaluate(.contains(within: .literal(.string("h2")), node: .literal(.string("h3")))) == .bool(true))
	#expect(try runtime.evaluate(.contains(within: .literal(.string("h3")), node: .literal(.string("h2")))) == .bool(false))
	#expect(try runtime.evaluate(.contains(within: .literal(.string(nativeDocumentBody)), node: .literal(.string("h9")))) == .bool(true))
	#expect(try runtime.evaluate(.contains(within: .literal(.number(1)), node: .literal(.string("h2")))) == .bool(false))
	#expect(try runtime.evaluate(.isElement(.literal(.string("h0")))) == .bool(true))
	#expect(try runtime.evaluate(.isElement(.literal(.string("h9")))) == .bool(false))
	#expect(try runtime.evaluate(.focusOrigin(.literal(.string("h2")))) == .null)
	#expect(throws: RuntimeError.self) { try runtime.evaluate(.event(.reason)) }

	#expect(try runtime.dispatch(NativeAction(event: .activate, host: "h1")) == [
		.attribute(node: "h2", name: "hidden", value: nil), .overlay(node: "h2", open: true, modal: true), .command(node: "h3", command: "focus", preventScroll: false),
	])
	#expect(try runtime.overlays().map(\.node) == ["h2"])
	#expect(try runtime.evaluate(.focusOrigin(.literal(.string("h2")))) == .string("h1"))
	#expect(try runtime.dispatch(NativeAction(event: .pointerdown, host: "h3")) == [])
	#expect(try runtime.dispatch(NativeAction(event: .pointerup, host: "h3")) == [])
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .dismiss, host: "h1", reason: "escape")) }
	#expect(try runtime.dispatch(NativeAction(event: .pointerdown, host: "h0")) == [
		.attribute(node: "h2", name: "hidden", value: ""), .overlay(node: "h2", open: false, modal: true), .command(node: "h1", command: "focus", preventScroll: false),
	])
	#expect(try runtime.value(of: "state:why") == .string("outside-press"))
	#expect(runtime.focused == "h1")
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .activate, host: "h4")) }
}

private let pad = """
	{"version":"markless.native-view/0","component":"P","cells":[{"id":"state:log","name":"log","initial":""}],
	"nodes":[{"kind":"element","id":"h0","element":"main","parent":null},{"kind":"element","id":"h1","element":"div","parent":"h0"},
	{"kind":"element","id":"h2","element":"div","parent":"h0"}],
	"events":[{"host":"h1","event":"pointerdown","handler":"handler:down"},{"host":"h1","event":"pointermove","handler":"handler:move"},
	{"host":"h1","event":"pointercancel","handler":"handler:cancel"},{"host":"h1","event":"pointerleave","handler":"handler:leave"}],
	"handlers":[{"id":"handler:down","ops":[{"op":"capture","node":{"event":"currentTarget"},"pointer":{"event":"pointerId"}}]},
	{"id":"handler:move","ops":[{"op":"assign","cell":"state:log","value":{"binary":"+","left":{"cell":"state:log"},"right":{"template":[" move:",{"captures":{"literal":"h1"},"pointer":{"event":"pointerId"}},"/",{"event":"clientY"}]}}},
	{"op":"capture","node":"h1","pointer":{"event":"pointerId"},"release":true}]},
	{"id":"handler:cancel","ops":[{"op":"assign","cell":"state:log","value":{"binary":"+","left":{"cell":"state:log"},"right":{"template":[" cancel:",{"event":"target"},"/",{"event":"buttons"},"/",{"event":"clientX"}]}}}]},
	{"id":"handler:leave","ops":[{"op":"assign","cell":"state:log","value":{"binary":"+","left":{"cell":"state:log"},"right":{"template":[" leave:",{"event":"relatedTarget"}]}}}]}]}
	"""

@Test func decodesCaptureAndRunsATouchTheCaptureFollows() throws {
	let payload = try decode(pad)
	#expect(payload.handlers[0].ops == [.capture(node: .event(.currentTarget), pointer: .event(.pointerId), release: false)])
	#expect(payload.handlers[1].ops[1] == .capture(node: .literal(.string("h1")), pointer: .event(.pointerId), release: true))
	let runtime = NativeRuntime(payload: payload)
	#expect(try runtime.evaluate(.captures(node: .literal(.string("h1")), pointer: .literal(.number(7)))) == .bool(false))
	#expect(try runtime.dispatch(NativeAction(event: .pointerdown, host: "h1", pointerId: 7, x: 5, y: 6, time: 10)) == [])
	#expect(try runtime.evaluate(.captures(node: .literal(.string("h1")), pointer: .literal(.number(7)))) == .bool(true))
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .pointerdown, host: "h2", pointerId: 7)) }
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .pointermove, host: "h2", pointerId: 8)) }
	_ = try runtime.dispatch(NativeAction(event: .pointermove, host: "h2", pointerId: 7, x: 5, y: 40))
	#expect(try runtime.value(of: "state:log") == .string(" move:true/40"))
	#expect(try runtime.evaluate(.captures(node: .literal(.string("h1")), pointer: .literal(.number(7)))) == .bool(false))
	_ = try runtime.dispatch(NativeAction(event: .pointercancel, host: "h2", pointerId: 7, x: 5, y: 50))
	#expect(try runtime.value(of: "state:log") == .string(" move:true/40 leave:h2"))
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .pointerup, host: "h2", pointerId: 7)) }
}

private let held = """
	{"version":"markless.native-view/0","component":"P","cells":[{"id":"state:log","name":"log","initial":""}],
	"nodes":[{"kind":"element","id":"h0","element":"ul","parent":null},{"kind":"element","id":"h1","element":"li","parent":"h0"},
	{"kind":"element","id":"h2","element":"span","parent":"h1"}],
	"events":[{"host":"h0","event":"contextmenu","handler":"handler:list"},{"host":"h1","event":"contextmenu","handler":"handler:row"}],
	"handlers":[{"id":"handler:list","ops":[{"op":"assign","cell":"state:log","value":{"binary":"+","left":{"cell":"state:log"},"right":{"template":[" list:",{"event":"target"},"/",{"event":"currentTarget"},"/",{"event":"timeStamp"}]}}}]},
	{"id":"handler:row","ops":[{"op":"assign","cell":"state:log","value":{"binary":"+","left":{"cell":"state:log"},"right":{"template":[" row:",{"event":"clientX"},",",{"event":"clientY"}]}}}]}]}
	"""

@Test func runsALongPressOnTheElementPressedThenEachItIsInside() throws {
	let runtime = NativeRuntime(payload: try decode(held))
	_ = try runtime.dispatch(NativeAction(event: .contextmenu, host: "h2", x: 12.5, y: 30, time: 600))
	#expect(try runtime.value(of: "state:log") == .string(" row:12.5,30 list:h2/h0/600"))
	#expect(throws: RuntimeError.self) { try runtime.dispatch(NativeAction(event: .contextmenu, host: "h9")) }
}

@Test func decodesEveryPointerEventAndField() throws {
	for name in ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerover", "pointerout", "pointerenter", "pointerleave"] {
		#expect(try decode(pad.replacingOccurrences(of: "\"event\":\"pointerdown\"", with: "\"event\":\"\(name)\"")).events[0].event.rawValue == name)
	}
	for field in ["target", "currentTarget", "relatedTarget", "button", "buttons", "clientX", "clientY", "pointerId", "pointerType", "isPrimary", "timeStamp"] {
		#expect(try NativeViewPayload.decodeExpression(.object([("event", .string(field))])) == .event(try #require(NativeEventField(rawValue: field))))
	}
}

@Test(arguments: [
	("\"op\":\"capture\",\"node\":\"h1\"", "\"op\":\"capture\",\"node\":1", "expected an object"),
	("\"op\":\"capture\",\"node\":\"h1\"", "\"op\":\"capture\",\"node\":null", "expected an object"),
	(",\"release\":true", ",\"release\":false", "release is only ever true"),
	(",\"release\":true", ",\"release\":1", "expected a boolean"),
	(",\"release\":true", ",\"release\":true,\"preventScroll\":true", "unknown field \"preventScroll\""),
	("\"pointer\":{\"event\":\"pointerId\"},\"release\"", "\"release\"", "missing \"pointer\""),
	("\"node\":\"h1\",\"pointer\":{\"event\":\"pointerId\"}", "\"node\":\"h1\",\"pointer\":\"1\"", "expected an object"),
	("{\"captures\":{\"literal\":\"h1\"},\"pointer\":{\"event\":\"pointerId\"}}", "{\"captures\":{\"literal\":\"h1\"}}", "unknown expression"),
	("{\"captures\":{\"literal\":\"h1\"},\"pointer\":{\"event\":\"pointerId\"}}", "{\"captures\":\"h1\",\"pointer\":{\"literal\":1}}", "expected an object"),
	("{\"captures\":{\"literal\":\"h1\"},\"pointer\":{\"event\":\"pointerId\"}}", "{\"captures\":{\"literal\":\"h1\"},\"pointer\":{\"event\":\"pointerId\"},\"release\":true}", "unknown expression"),
	("{\"event\":\"clientY\"}", "{\"event\":\"screenY\"}", "unknown event read \"screenY\""),
	("\"event\":\"pointerleave\"", "\"event\":\"pointerrawupdate\"", "unknown event \"pointerrawupdate\""),
])
func rejectsTouchShapesItDoesNotKnow(find: String, replace: String, reason: String) throws {
	let mutated = pad.replacingOccurrences(of: find, with: replace)
	#expect(mutated != pad)
	let message = try #require(rejection(mutated))
	#expect(message.contains(reason), "\(message)")
}

@Test func decodesTheCurrentColourSeenThroughAnOpacity() throws {
	let template = #"{"version":"markless.native-view/0","component":"A","cells":[],"nodes":[{"kind":"element","id":"h0","element":"svg","parent":null,"drawing":{"viewBox":null,"shapes":[{"path":[],"fill":PAINT,"fillRule":"nonzero","stroke":"currentColor","width":1,"cap":"butt","join":"miter","miterLimit":4}]}}],"events":[],"handlers":[]}"#
	let svg = { (paint: String) in template.replacingOccurrences(of: "PAINT", with: paint) }
	let shape = try decode(svg(#"{"current":true,"alpha":64}"#)).nodes[0].drawing?.shapes[0]
	#expect(shape?.fill == .current(alpha: 64))
	#expect(shape?.stroke == .currentColor)
	#expect(rejection(svg(#"{"current":true,"alpha":64.5}"#))?.contains("an integer 0-255") == true)
	#expect(rejection(svg(#"{"current":false,"alpha":64}"#))?.contains("unknown paint") == true)
}
