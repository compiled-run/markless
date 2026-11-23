import Foundation
@testable import MarklessCore
import Testing

// The S48 rung's app style and payload as the harness builds them: an empty search field with a placeholder and one holding a fixed value.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func searching() throws -> [String: ResolvedStyle] {
	let styles = try #require(try StyleExport.decodeApp(try fixture("s48-app-search-field.native-app-style"))["/"])
	guard case let .app(app) = try NativePayload.decode(try fixture("s48-app-search-field.payload")) else { throw PayloadError(path: "fixture", reason: "not an app") }
	let page = try #require(app.routes.first { $0.pattern == "/" }).page
	let runtime = NativeRuntime(payload: page)
	return try styles.resolve(for: page, initialTexts: try runtime.texts(), value: runtime.value(of:), arm: runtime.styleArm(of:)).styles
}

@Test func anEmptySearchFieldResolvesItsEditorBoxAndItsPlaceholder() throws {
	let field = try #require(try searching()["h2"]?.textField)
	#expect(field.editor == Frame(x: 17, y: 13, width: 309, height: 16))
	#expect(field.fontFamily == "Ahem")
	#expect(field.fontSize == 16)
	#expect(field.color == RGBA(r: 31, g: 29, b: 26, alpha: 255))
	let placeholder = try #require(field.placeholder)
	#expect(placeholder.text == "Title or tag")
	#expect(placeholder.frame == Frame(x: 17, y: 13, width: 309, height: 16))
	#expect(placeholder.color == RGBA(r: 117, g: 117, b: 117, alpha: 255))
	#expect(field.clear == Frame(x: 327, y: 17.5, width: 7, height: 7))
}

@Test func aFieldHoldingAValueHasNoPlaceholderAndOtherBoxesNoTextField() throws {
	let styles = try searching()
	let field = try #require(styles["h5"]?.textField)
	#expect(field.editor == Frame(x: 17, y: 13, width: 309, height: 16))
	#expect(field.placeholder == nil)
	#expect(styles["h0"]?.textField == nil)
	#expect(styles["h2"]?.font == nil)
}

@Test func aPillRadiusScalesDownToHalfTheFieldsHeight() throws {
	let field = try #require(try searching()["h2"])
	#expect(field.cornerRadius == 21)
}
