import Foundation
@testable import MarklessCore
import Testing

// The u122 rung's payload and Dragon's export of it (proofs/u122-box-shadow): an outer, an inset and a rounded spread shadow.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func shadows(_ edit: (String) -> String = { $0 }) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u122-box-shadow.payload")))
	let runtime = NativeRuntime(payload: payload)
	let export = Data(edit(String(decoding: try fixture("u122-box-shadow.native-style"), as: UTF8.self)).utf8)
	return try StyleExport.decode(export).resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

@Test func anOuterShadowCarriesItsBoxAndTheBackgroundsBeneathIt() throws {
	let layout = try shadows()
	let outer = try #require(layout.styles["h2"]?.shadow)
	#expect(outer.shadows == [BoxShadow.Shadow(inset: false, x: 0, y: 2, blur: 6, spread: 0, color: RGBA(r: 0, g: 0, b: 0, alpha: 51))])
	#expect(outer.hasOuter && !outer.hasInset)
	#expect(outer.dpr == 3)
	// The page device px border box, snapped from the frame at y 254.625.
	#expect(outer.box.edges == [60, 255, 1146, 402])
	#expect(outer.originY == 254.625)
	#expect(outer.box.background == RGBA(r: 255, g: 255, b: 255, alpha: 255))
	// The white canvas, then main's background; html's and body's transparent writes paint nothing.
	#expect(outer.backdrop.map(\.background) == [RGBA(r: 255, g: 255, b: 255, alpha: 255), RGBA(r: 244, g: 241, b: 234, alpha: 255)])
	#expect(outer.backdrop[1].edges == [0, 0, 1206, 1200])
}

@Test func anInsetShadowAndARoundedSpreadShadow() throws {
	let layout = try shadows()
	let inset = try #require(layout.styles["h3"]?.shadow)
	#expect(inset.hasInset && !inset.hasOuter)
	#expect(inset.shadows.first?.color == RGBA(r: 0, g: 0, b: 0, alpha: 89))
	let rounded = try #require(layout.styles["h4"]?.shadow)
	#expect(rounded.shadows.first?.spread == 3)
	#expect(rounded.box.borders == [6, 6, 6, 6])
	#expect(rounded.box.radii == Array(repeating: BoxShadow.RadiusLength(percent: false, value: 14), count: 8))
	// A box without box-shadow has none.
	#expect(layout.styles["h5"]?.shadow == nil)
}

@Test func theShadowFollowsTheBoxIntoAnotherAssignment() throws {
	let layout = try shadows()
	let short = try #require(layout.assignments[0]["h4"]?.shadow)
	let tall = try #require(layout.assignments[1]["h4"]?.shadow)
	#expect(short.box.edges[3] - short.box.edges[1] == 159)
	#expect(tall.box.edges[3] - tall.box.edges[1] == 456)
	#expect(short != tall)
}

@Test func refusesAShadowWriteWithAnotherKey() throws {
	#expect(throws: PayloadError.self) { try shadows { $0.replacingOccurrences(of: "\"dragonShadow.shadows\"", with: "\"dragonShadow.list\"") } }
}
