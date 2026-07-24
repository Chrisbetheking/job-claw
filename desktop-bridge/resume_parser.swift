import Foundation
import PDFKit
import Vision
import CoreGraphics

struct ParseResult: Codable {
    let ok: Bool
    let text: String
    let method: String
    let pageCount: Int
    let error: String?
}

func emit(_ result: ParseResult) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"ok\":false,\"text\":\"\",\"method\":\"macos-pdfkit\",\"pageCount\":0,\"error\":\"JSON 编码失败\"}")
    }
}

func normalized(_ text: String) -> String {
    return text
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .replacingOccurrences(of: "[ \\t]+\\n", with: "\n", options: .regularExpression)
        .replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func readableScore(_ text: String) -> Double {
    let compact = text.filter { !$0.isWhitespace }
    guard compact.count > 0 else { return 0 }
    var readable = 0
    var controls = 0
    for scalar in compact.unicodeScalars {
        let value = scalar.value
        if (value >= 0x3400 && value <= 0x9fff) || CharacterSet.alphanumerics.contains(scalar) { readable += 1 }
        if CharacterSet.controlCharacters.contains(scalar) { controls += 1 }
    }
    return max(0, min(1, Double(readable - controls) / Double(compact.count)))
}

func renderPage(_ page: PDFPage, maxDimension: CGFloat = 2300) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let scale = min(2.4, maxDimension / max(bounds.width, bounds.height))
    let width = max(1, Int(bounds.width * scale))
    let height = max(1, Int(bounds.height * scale))
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.saveGState()
    context.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()
    return context.makeImage()
}

func recognize(_ image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ""
    }
    let observations = (request.results ?? []).sorted {
        let yDifference = abs($0.boundingBox.midY - $1.boundingBox.midY)
        if yDifference > 0.018 { return $0.boundingBox.midY > $1.boundingBox.midY }
        return $0.boundingBox.minX < $1.boundingBox.minX
    }
    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

guard CommandLine.arguments.count >= 2 else {
    emit(ParseResult(ok: false, text: "", method: "macos-pdfkit", pageCount: 0, error: "缺少 PDF 路径"))
    exit(1)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url) else {
    emit(ParseResult(ok: false, text: "", method: "macos-pdfkit", pageCount: 0, error: "PDFKit 无法打开文件"))
    exit(1)
}

var pageTexts: [String] = []
for index in 0..<document.pageCount {
    if let text = document.page(at: index)?.string, !text.isEmpty { pageTexts.append(text) }
}
let pdfKitText = normalized(pageTexts.joined(separator: "\n"))
if pdfKitText.count >= 40 && readableScore(pdfKitText) >= 0.52 {
    emit(ParseResult(ok: true, text: pdfKitText, method: "macos-pdfkit", pageCount: document.pageCount, error: nil))
    exit(0)
}

var ocrTexts: [String] = []
for index in 0..<min(document.pageCount, 15) {
    guard let page = document.page(at: index), let image = renderPage(page) else { continue }
    let text = recognize(image)
    if !text.isEmpty { ocrTexts.append(text) }
}
let ocrText = normalized(ocrTexts.joined(separator: "\n"))
if ocrText.count >= 40 && readableScore(ocrText) >= 0.45 {
    emit(ParseResult(ok: true, text: ocrText, method: "macos-vision-ocr", pageCount: document.pageCount, error: nil))
} else {
    emit(ParseResult(ok: false, text: "", method: "macos-vision-ocr", pageCount: document.pageCount, error: "PDFKit 与系统 OCR 均未识别到可靠正文"))
    exit(2)
}
