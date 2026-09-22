import SwiftUI
import WebKit

@main
@MainActor
struct ParklyApp: App {
    @StateObject private var browser = BrowserModel()
    var body: some Scene {
        WindowGroup { MobileRootView(browser: browser) }
    }
}

struct MobileRootView: View {
    @ObservedObject var browser: BrowserModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var settings = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemBackground)
                if let webView = browser.webView {
                    WebPage(webView: webView).id(browser.generation)
                }
                if let failure = browser.failure {
                    VStack(spacing: 18) {
                        Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                        Text("ยังเปิด Parkly ไม่ได้").font(.title2.bold())
                        Text(failure).multilineTextAlignment(.center)
                        Button("เปิดหน้าแรกอีกครั้ง") { browser.home() }
                            .buttonStyle(.borderedProminent).disabled(browser.origin == nil)
                        Button("ตั้งค่าการเชื่อมต่อ") { settings = true }
                    }
                    .padding(28).frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(uiColor: .systemBackground))
                }
                if browser.loading {
                    VStack { ProgressView("กำลังเชื่อมต่อ…").padding(12).background(.regularMaterial).cornerRadius(12); Spacer() }
                }
                if scenePhase != .active {
                    Color(uiColor: .systemBackground)
                    VStack(spacing: 12) {
                        Image(systemName: "parkingsign.circle.fill").font(.system(size: 56))
                        Text(browser.role.title).font(.title2.bold())
                    }
                }
            }
            .navigationTitle(browser.role.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { browser.back() } label: { Image(systemName: "chevron.left") }
                        .disabled(!browser.canGoBack).accessibilityLabel("ย้อนกลับ")
                }
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button { browser.home() } label: { Image(systemName: "house") }
                        .disabled(browser.origin == nil).accessibilityLabel("หน้าแรก")
                    Button { settings = true } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel("ตั้งค่าการเชื่อมต่อ")
                }
            }
            .sheet(isPresented: $settings) { ConnectionSettings(browser: browser) }
            .alert("Parkly", isPresented: Binding(get: { browser.notice != nil }, set: { if !$0 { browser.notice = nil } })) {
                Button("ตกลง", role: .cancel) { browser.notice = nil }
            } message: { Text(browser.notice ?? "") }
        }
        .tint(Color(red: 0.09, green: 0.30, blue: 0.23))
    }
}

private struct WebPage: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct ConnectionSettings: View {
    @ObservedObject var browser: BrowserModel
    @Environment(\.dismiss) private var dismiss
    @State private var server = ""
    @State private var error: String?
    @State private var busy = false
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            Form {
                Section("แอพนี้สำหรับ\(browser.role.subtitle)") {
                    Text("ใช้บัญชีบทบาทนี้เท่านั้น บัญชีและการเชื่อมต่อแยกจากแอพ Parkly อีกสองแอพ")
                }
                Section("เซิร์ฟเวอร์ Parkly") {
                    #if DEBUG
                    TextField("https://parkly.example.com", text: $server)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("URL เซิร์ฟเวอร์")
                    Text("สำหรับผู้ทดสอบ: ใช้ URL จากผู้ดูแลระบบ เมื่อทดสอบกับ Mac ให้ใช้ IP ของ Mac และ Wi-Fi เดียวกัน")
                        .font(.footnote)
                    Button("บันทึกและเชื่อมต่อ") {
                        do {
                            let origin = try ServerPolicy.origin(server, allowLocalHTTP: true)
                            busy = true
                            browser.changeServer(origin) { dismiss() }
                        } catch { self.error = error.localizedDescription }
                    }.disabled(busy)
                    #else
                    Text(browser.origin?.absoluteString ?? "ยังไม่ได้กำหนดเซิร์ฟเวอร์ใน Release.xcconfig")
                    Text("รุ่นแจกจ่ายใช้ HTTPS ที่กำหนดตอนสร้างแอพ โปรดติดต่อผู้ดูแลเมื่อเชื่อมต่อไม่ได้")
                        .font(.footnote)
                    #endif
                    if let error { Text(error).foregroundStyle(.red) }
                }
                Section {
                    Button("ล้างการเข้าสู่ระบบในเครื่องนี้", role: .destructive) { confirmReset = true }
                        .disabled(busy)
                } footer: {
                    Text("การเปลี่ยนเซิร์ฟเวอร์หรือล้างข้อมูลจะลบคุกกี้และแคชของแอพนี้ และต้องเข้าสู่ระบบใหม่ หากยังเชื่อมต่อได้ ให้ใช้ปุ่มออกจากระบบในหน้าเว็บก่อน เพื่อยกเลิก session บนเซิร์ฟเวอร์ด้วย ข้อมูลที่ยังไม่บันทึกจะหายไป")
                }
                Section("เกี่ยวกับรุ่นนี้") {
                    Text("รุ่นพัฒนา iOS · ต้องเชื่อมต่อเซิร์ฟเวอร์ระหว่างใช้งาน")
                    Text("การชำระเงิน, ภาพ QR และการแจ้งเตือนยังเป็นความสามารถต้นแบบของระบบเดิม")
                        .font(.footnote)
                }
            }
            .disabled(busy)
            .navigationTitle("การเชื่อมต่อ")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("ปิด") { dismiss() }.disabled(busy) } }
            .onAppear { server = browser.origin?.absoluteString ?? "" }
            .confirmationDialog("ล้างคุกกี้และแคชของแอพนี้?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("ล้างข้อมูลในเครื่อง", role: .destructive) {
                    busy = true
                    browser.resetSession { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled(busy)
    }
}
