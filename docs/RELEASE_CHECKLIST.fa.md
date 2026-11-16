# مسیر انتشار اطلس کرج

این سند معیار انتشار است؛ انتشار فقط وقتی انجام می‌شود که موارد P0/P1 واقعاً آزمایش و تیک شوند.

## P0 — داده و اعتماد
- [ ] مرز رسمی محدودهٔ مطالعه با منبع و تاریخ مشخص
- [ ] دریافت OSM با محدودهٔ دقیق و ثبت زمان استخراج
- [ ] حفظ attribution و مجوز ODbL در UI و خروجی
- [ ] QA هندسه، شناسه‌های تکراری، مختصات، شمارش دسته‌ها
- [ ] تفکیک دادهٔ واقعی، تخمین ارتفاع و دادهٔ مشتق‌شده
- [ ] گزارش خطا و امکان بازتولید pipeline

## P0 — کیفیت اجرا
- [x] TypeScript strict و build خودکار
- [x] خطای Build در CI شناسایی و رفع شد (Run #89)
- [ ] آزمون smoke روی Chrome/Edge/Firefox
- [ ] خطاهای tile/data و مسیر نبود فایل با پیام روشن
- [ ] آزمون جست‌وجوی فارسی/عربی/اعداد
- [ ] آزمون دادهٔ حجیم و جلوگیری از freeze

## P1 — نقشه و 3D
- [ ] PMTiles واقعی تولید و تست zoom/coverage
- [ ] مرزها و محله‌ها با source provenance
- [ ] footprint ساختمان و ارتفاع همراه source/uncertainty
- [x] Three.js building massing preview (prototype)
- [ ] مدل 3D قابل‌اتکا و مدیریت GPU memory
- [ ] نمایش لایه‌ها، legend، scale و attribution

## P1 — آفلاین و ذخیره
- [x] IndexedDB dataset storage primitive
- [ ] import/export dataset در UI
- [ ] PMTiles offline bundle + service worker
- [ ] SQLite/Tauri database و migrations
- [ ] تست نصب/بسته‌بندی Windows

## P2 — محصول
- [ ] طراحی responsive و accessibility
- [ ] keyboard navigation و screen reader
- [ ] عملکرد روی دستگاه متوسط و حافظه محدود
- [ ] صفحه About/Data sources/License
- [ ] changelog، نسخه و release notes
- [ ] GitHub Release و artifact قابل دانلود
