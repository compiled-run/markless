import Foundation
@testable import MarklessCore
import Testing

// The u18 rung (base.visuallyhidden, its inline style through Dragon's cw/dragon-bugs-inline-style): its export and payload.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func resolved(_ edit: (String) -> String = { $0 }) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u18-visually-hidden.payload")))
	let runtime = NativeRuntime(payload: payload)
	let export = Data(edit(String(decoding: try fixture("u18-visually-hidden.native-style"), as: UTF8.self)).utf8)
	return try StyleExport.decode(export).resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

@Test func theVisuallyHiddenSpanClipsToNothing() throws {
	let span = try #require(try resolved().styles["component-edge:0/h0"])
	#expect(span.clipsChildren)
	#expect(span.clipRect == Frame(x: 0, y: 0, width: 0, height: 0))
	#expect(span.frame?.width == 1)
	let card = try #require(try resolved().styles["h2"])
	#expect(card.clipRect == nil)
	#expect(!card.clipsChildren)
}

@Test func aBoxThatPaintsInAnotherStackingOrderIsRefusedUnlessItPaintsNothing() throws {
	// inset(0) leaves the whole box, so its re-hosted paint order would matter.
	let edited = { (s: String) in s.replacingOccurrences(of: "\"value\": 50", with: "\"value\": 0") }
	#expect(throws: PayloadError.self) { try resolved(edited) }
}
