# คู่มือแอพ iOS ของ Parkly

อ่านวิธีติดตั้งและใช้งานฉบับเต็มที่ **[Mobile app/Readme_app.md](Mobile%20app/Readme_app.md)**

มี Xcode project หนึ่งชุดและแอพแยกสาม targets: Parkly Renter, Parkly Landlord และ Parkly Admin ติดตั้งพร้อมกัน ใช้ session แยกกัน และเชื่อมกับเซิร์ฟเวอร์ Parkly เดิม

เปิด `Mobile app/iOS/Parkly.xcodeproj` ใน Xcode แล้วทำตามคู่มือสำหรับ Simulator, การเซ็นลง iPhone, การตั้งค่าเซิร์ฟเวอร์, สร้างบัญชี Admin และเตรียม TestFlight

สถานะเป็น source project ยังไม่มีไฟล์ติดตั้งที่เซ็นแล้ว ยังไม่ได้ full build/test บน iOS SDK หรืออุปกรณ์จริง ดู [ผลตรวจ](Mobile%20app/VERIFICATION.md)
