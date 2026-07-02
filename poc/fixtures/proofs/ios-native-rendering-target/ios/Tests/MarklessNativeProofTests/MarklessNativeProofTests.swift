import UIKit
import XCTest
@testable import MarklessNativeProof

final class MarklessNativeProofTests: XCTestCase {
	@MainActor
	func testNativeButtonActivationRunsJavaScriptCoreSymbol() throws {
		let artifact = try MarklessNativeProofResources.loadArtifact()
		let runtime = try MarklessNativeRuntime(artifact: artifact)

		let root = try runtime.mount()

		XCTAssertTrue(root is UIStackView)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:title"), "Markless iOS Proof")
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 0")
		XCTAssertEqual(runtime.graphNumber("state:count"), 0)

		try runtime.activate(hostNodeId: "host:button")

		XCTAssertEqual(runtime.graphNumber("state:count"), 1)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 1")
	}
}
