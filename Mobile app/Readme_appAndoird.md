# Parkly Android — คู่มือติดตั้งและใช้งานทั้ง 3 แอพ

ชื่อไฟล์ `Readme_appAndoird.md` ใช้ตามที่ระบุในงานนี้ เนื้อหาครอบคลุมแอพ **Parkly Renter**, **Parkly Landlord** และ **Parkly Admin** บน Android

**สถานะ:** มี source project สำหรับ Android Studio และ Gradle Wrapper พร้อมสาม product flavors ใช้โค้ดร่วมกัน แต่สร้างเป็นสามแอพที่ติดตั้งพร้อมกันและแยก session ได้ ยังไม่มี APK/AAB ที่ตรวจ build สำเร็จหรือทดสอบบนมือถือจริง เพราะเครื่องพัฒนางานนี้ไม่มี Android SDK ดูผลตรวจจริงที่ [Android/VERIFICATION.md](Android/VERIFICATION.md)

Branch `Android-App` เริ่มจาก `main` โดยไม่ได้ merge โค้ด iOS เข้ามา คู่มือ iOS เปลี่ยนชื่อเป็น `Readme_appIOS.md` บน branch `IOS-App` แล้ว อ่านได้ที่ [คู่มือ iOS](https://github.com/Svinyoo/Lorjod/blob/IOS-App/Mobile%20app/Readme_appIOS.md)

## 1. ทั้งสามแอพและระบบที่ใช้ร่วมกัน

| แอพ | Flavor | หน้าที่ | หน้าแรก | Application ID รุ่น Release เริ่มต้น |
| --- | --- | --- | --- | --- |
| Parkly Renter | `renter` | สมัคร ค้นหาลาน เพิ่มรถ ขอราคา จอง ดู Pass ต่อเวลา | `/` | `com.example.parkly.renter` |
| Parkly Landlord | `landlord` | สมัคร สร้างลาน เพิ่มช่อง เปิดรับจอง บันทึกเข้า–ออก | `/landlord/` | `com.example.parkly.landlord` |
| Parkly Admin | `admin` | ตรวจและแก้ข้อมูลพร้อมเหตุผลและ audit | `/admin/` | `com.example.parkly.admin` |

รุ่น Debug เพิ่ม `.debug` ต่อท้าย เช่น `com.example.parkly.renter.debug` จึงติดตั้งแยกจาก Release ได้ด้วย เปลี่ยน prefix เป็นของคุณก่อนแจกจ่ายจริง บัญชีของแต่ละแอพต้องมี role ตรงกัน การติดตั้ง Admin ไม่ทำให้ผู้ใช้มีสิทธิ์ Admin

แอพใช้ **Java + Android WebView** และ native views ของ Android หน้าธุรกิจโหลดจาก Express เดิม ไม่ได้ย้าย Node.js/SQLite เข้าโทรศัพท์ และไม่ทำงานแบบ offline

```text
Android Renter   ─ WebView ─ /          ┐
Android Landlord ─ WebView ─ /landlord/ ├─ HTTPS ─ Express ─ SQLite
Android Admin    ─ WebView ─ /admin/    ┘
```

ฟังก์ชัน native ที่เพิ่ม: ปุ่มย้อนกลับ/หน้าแรก/การเชื่อมต่อ, progress, หน้าข้อผิดพลาด, ตั้ง URL ใน Debug, ล้างคุกกี้/แคช, รองรับ JavaScript dialog, เปิดแผนที่ภายนอกเมื่อกด และปรับขอบจอ/แป้นพิมพ์ด้วย window insets

WebView โหลดหน้าและ API จาก origin เดียวกัน ไม่เปิด CORS เพิ่ม ไม่ส่ง password/token ผ่าน native JavaScript bridge และไม่ยอมข้าม certificate error รุ่น Release ปิด HTTP และห้ามผู้ใช้เปลี่ยน URL

## 2. โครงสร้างไฟล์

```text
Mobile app/
  Readme_appAndoird.md
  Android/
    settings.gradle / build.gradle / gradle.properties
    gradlew / gradlew.bat / gradle/wrapper/
    parkly.properties.example
    VERIFICATION.md
    THIRD_PARTY.md
    app/
      build.gradle                         # 3 flavors × Debug/Release
      src/main/
        AndroidManifest.xml
        java/com/parkly/mobile/
          MainActivity.java                # หน้าจอ, WebView, cookies, navigation
          ServerPolicy.java                # URL/role policy ใช้ทดสอบบน JVM ได้
        assets/mobile.css                  # CSS เฉพาะแอพ
        res/layout/activity_main.xml
        res/values/                        # ข้อความและ theme
        res/drawable/                      # ไอคอนแยก R, L, A
        res/xml/data_extraction_rules.xml  # ไม่ย้ายข้อมูลล็อกอินผ่าน backup
      src/debug/AndroidManifest.xml        # อนุญาต HTTP เฉพาะรุ่น Debug
      src/test/java/com/parkly/mobile/      # policy checks + JUnit entry point
    scripts/
      check-project.py
      check-policy.sh
      generate-icons.py
```

ไฟล์เว็บและ API เดิมยังอยู่ที่เดิม Backend เพิ่ม `HOST` และ `TRUST_LOCAL_PROXY=1` แบบเดียวกับฝั่ง iOS เพื่อรองรับ HTTPS session หลัง proxy บนเครื่องเดียวกัน ไม่เปลี่ยนสิทธิ์หรือกติกาจอง

## 3. เตรียมเครื่องพัฒนา

- Android Studio รุ่นที่รองรับ AGP 8.13.2
- JDK 17 หรือ Gradle JDK ของ Android Studio ที่รองรับชุดนี้
- Android SDK Platform 36, SDK Build-Tools 35.0.0 และ Android SDK Platform-Tools
- Android Emulator/system image หากจะทดสอบบน emulator หรือ Android จริง **8.0/API 26 ขึ้นไป**
- Node.js 24 ตาม `.nvmrc` และ npm สำหรับเซิร์ฟเวอร์

โปรเจกต์ pin AGP **8.13.2** และ Gradle **8.13**, `compileSdk=36`, `targetSdk=36`, `minSdk=26` ตาม [ตาราง compatibility ของ Android Gradle Plugin](https://developer.android.com/build/releases/agp-8-13-0-release-notes) ก่อนส่ง Google Play ต้องตรวจข้อกำหนด target API และนโยบายล่าสุดอีกครั้ง

ติดตั้ง Android Studio จาก [เว็บไซต์ทางการ](https://developer.android.com/studio) เปิด SDK Manager เลือกแพ็กเกจข้างต้น และอ่าน/ยอมรับ license ที่เครื่องมือขอด้วยตนเอง งานนี้ไม่ได้ยอมรับ SDK license แทนคุณ

ตรวจ:

```sh
java -version
node --version
adb version
```

ถ้า Terminal หา Java ไม่พบ ให้กำหนด `JAVA_HOME` ไปยัง JDK ที่ติดตั้งจริง หรือเลือก Gradle JDK ใน Android Studio Settings → Build, Execution, Deployment → Build Tools → Gradle ตัวอย่าง macOS หากใช้ JDK ที่มากับ Android Studio:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

Android Studio มักสร้าง `local.properties` ให้เอง หากใช้ Terminal ให้กำหนด SDK path ที่ถูกต้อง เช่นไฟล์ `Mobile app/Android/local.properties` บน Mac:

```properties
sdk.dir=/Users/YOUR_USER/Library/Android/sdk
```

เปลี่ยน `YOUR_USER` เป็นของคุณ ไฟล์นี้ถูก ignore ไม่ควร commit path ของเครื่อง ส่วน Windows ใช้ SDK path จาก SDK Manager และใช้ `/` ใน path หรือ escape backslash ตามรูปแบบ Java properties

## 4. เปิดเซิร์ฟเวอร์สำหรับทดสอบ

จากราก repository `Lorjod` ที่มี `package.json` แนะนำใช้ข้อมูลทดสอบแยก:

```sh
npm ci
export DATA_DIR="$TMPDIR/parkly-android-demo"
export HOST=0.0.0.0
export PORT=3000
export NODE_ENV=development
export SESSION_SECRET="$(openssl rand -hex 32)"
npm start
```

ตัวอย่างนี้เป็น shell บน Mac หากใช้ Windows ให้ตั้ง environment variables ด้วย PowerShell และเลือก DATA_DIR เป็นโฟลเดอร์ทดลองของคุณ เปิด Terminal นี้ไว้ตลอดการใช้งาน

ถ้าจะใช้ข้อมูลเดิม ให้ใช้ `DATA_DIR` เดิมหรือไม่กำหนดเพื่อใช้ `data/app.db` ห้ามลบฐานข้อมูลจริงเพื่อแก้ปัญหาล็อกอิน

เปิด `http://localhost:3000` บนคอมพิวเตอร์ให้ได้ก่อน แล้วเลือก URL ในแอพ:

| สภาพแวดล้อม | URL ตัวอย่าง |
| --- | --- |
| Android Emulator บนคอมพิวเตอร์เดียวกัน | `http://10.0.2.2:3000` |
| โทรศัพท์จริงใน Wi-Fi เดียวกัน | `http://192.168.1.10:3000` โดยเปลี่ยนเป็น IP ของคอมพิวเตอร์ |
| ต่อ USB และรัน `adb reverse tcp:3000 tcp:3000` | `http://127.0.0.1:3000` |
| เซิร์ฟเวอร์ออนไลน์ | `https://โดเมนของคุณ` |

บนโทรศัพท์ `localhost` หมายถึงโทรศัพท์ ไม่ใช่ Mac ส่วน `10.0.2.2` ใช้กับ Android Emulator ไม่ใช่ IP สำหรับโทรศัพท์จริง ดู [Android Emulator networking](https://developer.android.com/studio/run/emulator-networking)

กรอก URL ต้นทางเท่านั้น ไม่เติม `/api`, `/landlord` หรือ `/admin` รุ่น Debug อนุญาต HTTP เฉพาะ localhost/loopback, IPv4 10.x, 172.16–31.x, 192.168.x และชื่อ `.local` ใช้ HTTPS สำหรับที่อยู่อื่น การอนุญาต HTTP ใน manifest ของ Debug ไม่ใช่นโยบายสำหรับ Release

## 5. เปิดโปรเจกต์ใน Android Studio

1. เลือก **Open** แล้วเปิดโฟลเดอร์ `Mobile app/Android` ไม่ใช่ `app/` หรือรากเว็บ
2. รอ Gradle sync ดาวน์โหลด dependencies ครั้งแรก
3. ถ้าแจ้ง SDK missing ให้ตั้ง SDK path และติดตั้ง Platform 36/Build-Tools 35.0.0
4. เปิด Build Variants เลือก `renterDebug` ของ module `app`
5. สร้างและเปิด emulator ใน Device Manager หรือเลือกโทรศัพท์ที่เชื่อมต่อแล้ว
6. กด Run รอแอพติดตั้ง
7. กด **การเชื่อมต่อ** ใส่ URL แล้วกด **บันทึกและเชื่อมต่อ**
8. เปลี่ยน variant เป็น `landlordDebug` แล้ว Run
9. ทำซ้ำ `adminDebug`

จะมีสามไอคอนอยู่พร้อมกัน ต้องกำหนด URL แยกในแต่ละแอพ Session ไม่ใช้ร่วมกับ Chrome หรือสองแอพอื่น ข้อมูลทางธุรกิจใช้ฐานข้อมูลร่วมบนเซิร์ฟเวอร์

## 6. สร้าง Debug APK จาก Terminal

จากราก `Lorjod`:

```sh
cd "Mobile app/Android"
./gradlew :app:assembleRenterDebug :app:assembleLandlordDebug :app:assembleAdminDebug
```

Windows ใช้ `gradlew.bat` แทน `./gradlew` ครั้งแรกต้องมีอินเทอร์เน็ตเพื่อดาวน์โหลด Gradle/AGP/dependencies

ไฟล์ผลลัพธ์หลัง build ผ่าน:

```text
app/build/outputs/apk/renter/debug/app-renter-debug.apk
app/build/outputs/apk/landlord/debug/app-landlord-debug.apk
app/build/outputs/apk/admin/debug/app-admin-debug.apk
```

Debug APK เซ็นด้วย development key โดยอัตโนมัติสำหรับทดสอบ ห้ามใช้ debug key แจกเป็น production และไฟล์ build ไม่ถูก commit เข้า Git

## 7. ติดตั้งบน Android จริง

### ผ่าน USB / Android Studio / adb

1. เปิด Developer options และ USB debugging บนโทรศัพท์
2. ต่อ USB กับคอมพิวเตอร์ ปลดล็อกและอนุญาตคอมพิวเตอร์ของคุณเมื่อโทรศัพท์ถาม
3. ตรวจ `adb devices` ให้เห็นสถานะ `device` ถ้า `unauthorized` ให้ยืนยันบนโทรศัพท์
4. Run แต่ละ variant ใน Android Studio หรือหลัง build แล้วใช้จากโฟลเดอร์ Android:

   ```sh
   adb install -r app/build/outputs/apk/renter/debug/app-renter-debug.apk
   adb install -r app/build/outputs/apk/landlord/debug/app-landlord-debug.apk
   adb install -r app/build/outputs/apk/admin/debug/app-admin-debug.apk
   ```

5. ใช้ Wi-Fi เดียวกับคอมพิวเตอร์แล้วตั้ง IP คอมพิวเตอร์ หรือรัน `adb reverse tcp:3000 tcp:3000` เพื่อใช้ localhost ผ่าน USB
6. เปิดทั้งสามแอพ ตั้ง URL และล็อกอินตามบทบาท

ดู [วิธีรันบนอุปกรณ์จริงของ Android](https://developer.android.com/studio/run/device) หากมีหลายเครื่องต่ออยู่ ให้ใช้ `adb -s SERIAL ...` เลือกเครื่องที่ตั้งใจ

### ติดตั้งจากไฟล์ APK

นำ Debug APK ที่ build แล้วไปยังโทรศัพท์ทดสอบ เปิดไฟล์ และอนุญาตติดตั้งจากแอพที่ใช้เปิดไฟล์ตามหน้าจอ Android เฉพาะไฟล์ที่คุณสร้างและเชื่อถือได้ วิธีนี้ไม่ต้องมี Play Console สำหรับทดสอบในเครื่อง แต่การแจกจริงต้องใช้ release signing และช่องทางที่เหมาะสม

ถ้าเกิด `INSTALL_FAILED_UPDATE_INCOMPATIBLE` แปลว่ามีแอพ ID เดียวกันแต่ signing key ต่างกัน ให้ใช้ key เดิมหรือ ID ใหม่ การถอนติดตั้งทำให้ session/ข้อมูลในเครื่องของแอพหาย อย่าถอนโดยไม่ตรวจสิ่งที่ต้องเก็บก่อน

## 8. สมัครและเข้าใช้งานแต่ละบทบาท

### Parkly Renter

1. เชื่อมเซิร์ฟเวอร์แล้วเลือก **สมัครสมาชิก** หรือเข้าสู่ระบบผู้เช่าที่มีอยู่
2. สมัครด้วยชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร
3. เพิ่มรถพร้อมทะเบียนและประเภท `car`, `ev` หรือ `motorcycle`
4. ค้นหาลาน เลือกรถและเวลา ขอราคา แล้วตรวจยอดก่อนยืนยัน
5. ดู Digital Pass และกดแผนที่เพื่อเปิดแอพภายนอก
6. ต่อเวลาโดยตรวจจำนวนชั่วโมงและยอดที่แสดงก่อนบันทึก
7. กด **ออกจากระบบ** ในหน้าธุรกิจเมื่อเลิกใช้

การจองใหม่ต้องเริ่มก่อนจบ ระยะเวลาไม่เกิน 24 ชั่วโมง และรถต้องตรงประเภทช่อง ราคา/ช่องถูกตรวจใหม่ที่ backend ตอนจอง ใบเสนอราคาไม่ได้กันช่องไว้

### Parkly Landlord

1. สมัครบัญชีผู้ให้เช่าในแอพนี้ด้วยอีเมลที่ยังไม่ใช้ อีเมลในระบบไม่ซ้ำข้ามบทบาท
2. สร้างลาน ใส่ชื่อ ที่อยู่ พิกัด ราคาและจุดสังเกต ลานเริ่มเป็นฉบับร่าง
3. เพิ่มช่องจอดและประเภทรถ แล้วเปิดรับจอง
4. อัปเดตข้อมูล Renter เพื่อตรวจว่าลานแสดงและจองได้
5. ดูรายการจองเฉพาะลานของตน ตรวจ Pass/ทะเบียน
6. ในเวลาจอง บันทึกเข้า `confirmed → active` และออก `active → completed`
7. ยอดที่แสดงเป็นมูลค่าการจอง ไม่ใช่ยอดรับเงินจริง

ลานตัวอย่างไม่มีเจ้าของไม่ได้ถูกยกให้บัญชีใหม่ ต้องสร้างลานของคุณสำหรับทดสอบ

### Parkly Admin

ไม่มีหน้าสมัคร Admin ให้เปิดเซิร์ฟเวอร์อย่างน้อยหนึ่งครั้งเพื่อสร้าง schema แล้วสร้างบัญชีจากเครื่องเซิร์ฟเวอร์ด้วย `DATA_DIR` เดียวกัน ตัวอย่าง zsh บน Mac:

```sh
# รันที่ราก Lorjod ใน Terminal อีกหน้าต่าง
export DATA_DIR="$TMPDIR/parkly-android-demo"
read "ADMIN_EMAIL?อีเมล Admin: "
read -s "ADMIN_PASSWORD?รหัสผ่าน Admin (อย่างน้อย 12 ตัวอักษร): "
echo
export ADMIN_EMAIL ADMIN_PASSWORD
node server/create-admin.js
unset ADMIN_EMAIL ADMIN_PASSWORD
```

ถ้าเซิร์ฟเวอร์ใช้ `data/app.db` ไม่ต้องตั้ง DATA_DIR ใน Terminal นี้ด้วย ไม่มีบัญชีหรือรหัสผ่านเริ่มต้น การสร้างด้วยอีเมลซ้ำจะไม่เขียนทับหรือยกระดับบัญชีเก่า

เปิด Parkly Admin ล็อกอิน เลือกข้อมูล → ตรวจค่า → แก้ไข → ระบุเหตุผล → บันทึก → ตรวจ audit ถ้าข้อมูลเปลี่ยนระหว่างแก้ ให้โหลดใหม่ก่อน ระบบไม่ให้แก้ role/password ผ่านหน้าจัดการ และการแก้ยอดเงินไม่ใช่การเรียกเก็บหรือคืนเงินจริง

## 9. ตั้งค่าเซิร์ฟเวอร์และ session

- Debug กด **การเชื่อมต่อ** เพื่อกรอก URL ได้ และจำค่าต่อแอพ
- Release อ่าน URL ที่กำหนดตอน build เท่านั้น ไม่เปิดช่องแก้ URL และไม่อ่าน URL จาก Debug
- หน้าเว็บและ API ใช้ origin เดียวกัน ระบบ session cookie และการตรวจสิทธิ์เดิมยังอยู่ครบ
- เปลี่ยน URL จะล้าง cookies/cache/web storage ของแอพนั้นก่อนเชื่อมใหม่ ต้องล็อกอินอีกครั้ง
- ปุ่ม **ล้างการเข้าสู่ระบบในเครื่องนี้** ไม่ลบบัญชีหรือฐานข้อมูล และไม่ยกเลิก session ฝั่งเซิร์ฟเวอร์ ให้กดออกจากระบบในหน้าเว็บก่อนเมื่อยังต่อได้
- ปุ่ม native หน้าแรกส่ง GET และไม่ retry รายการจองอัตโนมัติ ข้อมูลฟอร์มที่ยังไม่บันทึกอาจหาย
- ถ้า timeout หลังส่งรายการ ให้ตรวจรายการจองก่อนทำซ้ำ เซิร์ฟเวอร์อาจบันทึกแล้ว
- Session backend ปัจจุบันเก็บใน memory การรีสตาร์ตเซิร์ฟเวอร์อาจทำให้ต้องล็อกอินใหม่
- แอพไม่ขอ camera, contacts, location หรือ storage permissions; แผนที่เป็นลิงก์ภายนอก

## 10. ตั้ง Release และ HTTPS

จากโฟลเดอร์ `Mobile app/Android`:

```sh
cp parkly.properties.example parkly.properties
```

แก้เป็นค่าจริง:

```properties
applicationIdPrefix=com.yourcompany.parkly
serverUrl=https://parkly.your-domain.com
```

`parkly.properties` ถูก ignore เพื่อไม่เอาค่าของเครื่องเข้า Git URL ต้องเป็น HTTPS origin เท่านั้น ไม่มี credentials, path, query หรือ fragment ใบรับรองต้องเชื่อถือได้ และ backend ต้องเสิร์ฟ `/`, `/landlord/`, `/admin/`, `/api/` จาก origin เดียว ไม่รองรับย้ายทั้งระบบไปใต้ `/parkly/`

อีกทางกำหนด `PARKLY_APPLICATION_ID_PREFIX` และ `PARKLY_SERVER_URL` ผ่าน environment ซึ่งมีลำดับเหนือค่าในไฟล์ ห้ามฝังรหัสผ่าน, API secret หรือ session secret ลงในแอพ URL ที่ build ลงแอพไม่ใช่ข้อมูลลับ

Release build จะถูกปฏิเสธถ้าไม่ได้ตั้ง HTTPS URL ที่ถูกต้อง Debug ยอมให้ URL ว่างได้เพื่อกรอกหลังติดตั้ง

ถ้า HTTPS จบที่ reverse proxy บนเครื่องเดียวกับ Node และ proxy เชื่อม upstream ผ่าน loopback:

```sh
export NODE_ENV=production
export HOST=127.0.0.1
export PORT=3000
export TRUST_LOCAL_PROXY=1
export DATA_DIR=/path/to/persistent/parkly-data
export SESSION_SECRET="เปลี่ยนเป็น secret สุ่มยาวเฉพาะของคุณ"
npm start
```

รันคำสั่งนี้ที่รากเว็บและเปลี่ยน path/secret เป็นค่าจริง Proxy ต้องเขียนทับ `X-Forwarded-Proto`, `X-Forwarded-For`, `X-Forwarded-Host` ให้ถูกต้อง ไม่เปิดพอร์ต Node ตรงสู่สาธารณะ `TRUST_LOCAL_PROXY=1` เชื่อถือเฉพาะ loopback ไม่ครอบคลุม proxy ต่างเครื่อง/container ต้องปรับให้ตรง topology ก่อน [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)

## 11. Signing และแจกจ่าย

### Android Studio

เลือก Build → Generate Signed Bundle / APK เลือก APK สำหรับติดตั้งตรงหรือ Android App Bundle สำหรับ Play สร้าง/เลือก release keystore ของเจ้าของแอพและเลือก flavor ที่ต้องการ ทำซ้ำทั้งสามแอพ เก็บสำรอง keystore/password อย่างปลอดภัยและห้าม commit ลง Git ดู [Sign your app](https://developer.android.com/studio/publish/app-signing)

### Terminal

ตั้งค่า HTTPS ก่อน แล้วกำหนดข้อมูล signing ผ่าน environment:

```sh
export PARKLY_STORE_FILE=/absolute/path/to/your-release-key.jks
export PARKLY_KEY_ALIAS=your-key-alias
# ตั้ง PARKLY_STORE_PASSWORD และ PARKLY_KEY_PASSWORD ผ่าน secret manager
# หรือช่องรับค่าลับของ shell/CI โดยไม่ใส่ค่าจริงลง source หรือ command history
./gradlew :app:assembleRenterRelease :app:assembleLandlordRelease :app:assembleAdminRelease
```

ต้องกำหนดครบทั้งสี่ค่าเพื่อเซ็น หรือไม่กำหนดทั้งหมดเพื่อได้ unsigned build ที่ยังไม่พร้อมติดตั้ง ห้ามเข้าใจว่า unsigned APK ติดตั้งได้เลย และห้ามใส่ release key ในไฟล์ที่ส่งเข้า Git

สำหรับ AAB:

```sh
./gradlew :app:bundleRenterRelease :app:bundleLandlordRelease :app:bundleAdminRelease
```

ผลอยู่ใน `app/build/outputs/apk/<flavor>/release/` หรือ `app/build/outputs/bundle/<flavor>Release/` ตรวจ signing ก่อนแจก AAB ไม่ใช่ไฟล์สำหรับกดติดตั้งตรงบนโทรศัพท์

ถ้าจะส่ง Google Play ให้ตั้ง Application IDs จริง สร้าง app records แยกตามแอพ เพิ่ม `versionCode` ทุกครั้งที่อัปโหลด และเตรียม privacy policy, Data safety, screenshots, บัญชี reviewer และช่องทางลบบัญชีที่ตรงกับบริการจริง ประเมินช่องทางแจก Admin สำหรับผู้มีสิทธิ์เฉพาะ งานนี้ยังไม่อัปโหลด Play Console และไม่รับประกันการผ่าน review ของแอพที่มีหน้าธุรกิจเป็น WebView

## 12. ตรวจและทดสอบ

จากราก `Lorjod`:

```sh
python3 "Mobile app/Android/scripts/check-project.py"
sh "Mobile app/Android/scripts/check-policy.sh"
npm test
```

ชุดแรกตรวจโครงสร้าง XML/resources/flavors และ Gradle Wrapper checksum ชุดที่สอง compile/run Java policy จริงบน JVM โดยไม่ต้องมี SDK ชุด npm ใช้ฐานข้อมูลชั่วคราวและทดสอบ API/shared HTTPS session ไม่ใช่ UI test

เมื่อมี Android SDK แล้ว จากโฟลเดอร์ Android:

```sh
./gradlew :app:testRenterDebugUnitTest :app:testLandlordDebugUnitTest :app:testAdminDebugUnitTest
./gradlew :app:lintRenterDebug :app:lintLandlordDebug :app:lintAdminDebug
./gradlew :app:assembleRenterDebug :app:assembleLandlordDebug :app:assembleAdminDebug
```

ก่อนส่งให้คนอื่น ให้ทดสอบจริงอย่างน้อย:

1. ติดตั้งครบสามไอคอน ล็อกอินแต่ละ role และสลับโดยไม่แย่ง session
2. URL ไม่ถูกต้อง/HTTP สาธารณะ/Release HTTP ถูกปฏิเสธ และ HTTPS certificate ผิดต้องไม่ผ่าน
3. สมัคร Renter/Landlord; Admin ไม่มีสมัคร; บัญชีผิดบทบาทถูกปฏิเสธ
4. Landlord สร้างลาน/ช่อง → เปิดจอง → Renter จอง/ดู Pass → Landlord บันทึกเข้า–ออก
5. Admin แก้พร้อมเหตุผล ดู audit และทดสอบ conflict
6. ตรวจหน้าว่าง/loading/error, ตัดเน็ต, ปิดเซิร์ฟเวอร์, session หมดอายุ และกู้คืนโดยไม่ส่งรายการซ้ำ
7. ปุ่ม back ของ Android/ปุ่ม native, ลิงก์แผนที่, dialogs, keyboard, TalkBack, จอเล็ก/ใหญ่/แท็บเล็ต และการหมุนจอ
8. เปลี่ยนเซิร์ฟเวอร์/ล้างข้อมูลต้องกระทบเฉพาะแอพนั้น
9. ทดสอบ Android 8 และรุ่นใหม่ที่มี edge-to-edge รวมถึง WebView เวอร์ชันที่ใช้งานจริง
10. Build Release ด้วย signing จริงและทดสอบ HTTPS/session ก่อนแจก

## 13. แก้ปัญหา

| อาการ | วิธีตรวจ |
| --- | --- |
| ไม่พบ Java | ตั้ง JAVA_HOME/Gradle JDK ให้ถูกต้อง |
| SDK location not found | ติดตั้ง SDK และตั้ง sdk.dir ใน local.properties หรือ ANDROID_HOME |
| แพ็กเกจ SDK ไม่ครบ/license ไม่ผ่าน | เปิด SDK Manager ติดตั้ง Platform 36/Build-Tools 35.0.0 และอ่านยอมรับ license ด้วยตนเอง |
| Gradle sync ช้า/ดาวน์โหลดไม่ได้ | ตรวจอินเทอร์เน็ต, proxy, repositories และรอการดาวน์โหลดครั้งแรก ห้ามใช้ offline ถ้า cache ยังไม่ครบ |
| Emulator ต่อ localhost ไม่ได้ | ใช้ 10.0.2.2 แทน หรือใช้ adb reverse |
| มือถือจริงต่อ 10.0.2.2 ไม่ได้ | ใช้ IP คอมพิวเตอร์ใน Wi-Fi เดียวกัน หรือ USB + adb reverse |
| เบราว์เซอร์บนมือถือก็เข้า IP ไม่ได้ | ตรวจ server, HOST, PORT, firewall และ guest Wi-Fi ที่แยกลูกข่าย |
| Release ล็อกอินไม่อยู่ | ตรวจ HTTPS, secure cookie และการตั้ง trust proxy ให้ตรงระบบ |
| ERR_CLEARTEXT_NOT_PERMITTED | ถ้า Release ต้องใช้ HTTPS; ทดสอบ LAN ให้ใช้ Debug |
| ใบรับรอง HTTPS ไม่ผ่าน | แก้ certificate chain/hostname ฝั่งเซิร์ฟเวอร์ ไม่ปิดการตรวจ TLS ในแอพ |
| บัญชีผิดบทบาท | เปิดแอพที่ตรงกับบัญชี ห้ามข้ามการตรวจ role |
| ไม่พบ Admin | ตรวจ DATA_DIR ของคำสั่งสร้างให้ตรงกับเซิร์ฟเวอร์ |
| ถอน/ติดตั้งใหม่แล้วต้องล็อกอิน | แต่ละแอพมี cookies/storage ของตัวเอง การล้างหรือถอนจะลบข้อมูลในเครื่อง |
| session หายหลัง restart backend | server ใช้ memory session store ต้องล็อกอินใหม่ |
| INSTALL_FAILED_UPDATE_INCOMPATIBLE | ตรวจ Application ID และ signing key ให้ตรงแอพเดิม |

## 14. สิ่งที่ยังต้องทำก่อน production

ระบบชำระเงิน, QR เปิดประตู และ push ยังเป็นต้นแบบ การกัน concurrent booking, persistent/shared session store, CSRF, rate limit และ flow ลบบัญชียังต้องพัฒนาตาม [README หลัก](../README.md) การเพิ่มแอพ Android ไม่ได้ทำให้ backend พร้อม production โดยอัตโนมัติ

Source Java และ CSS ใช้ร่วมสาม flavors เพิ่มความสามารถแล้วต้องทดสอบทุกบทบาท ไม่เปลี่ยน role จาก client เพื่อแก้สิทธิ์ ข้อมูลธุรกิจและกติกายังยึด API เดิม
