# مرحلهٔ دوم — دادهٔ جغرافیایی کرج

## هدف
ساخت یک جریان قابل تکرار برای دریافت، بررسی و مصرف دادهٔ واقعی OpenStreetMap؛ به‌جای تولید دستی یا ساخت دادهٔ جعلی.

## اجزای این مرحله
- `scripts/karaj_data_pipeline.py`: دریافت Overpass با retry، تبدیل سادهٔ way/node، حذف شناسه‌های تکراری، metadata، SHA-256 و گزارش دسته‌ها.
- `scripts/validate_geojson.py`: بررسی ساختار، مختصات، تعداد ساختمان/راه و پوشش ارتفاع.
- `data/catalog.json`: منبع، مجوز، بازه و محدودیت‌های Dataset.
- `.github/workflows/karaj-data-pipeline.yml`: اجرای دستی pipeline و نگهداری GeoJSON/report به‌صورت artifact چهارده‌روزه.
- UI: واردکردن GeoJSON و ذخیره/بازیابی در IndexedDB.

## اجرای محلی
```bash
python scripts/karaj_data_pipeline.py --bbox 35.70,50.88,35.98,51.12
python scripts/validate_geojson.py public/data/karaj-osm.geojson public/data/karaj-qa.json
```

یا در GitHub:
Actions → Karaj OSM data pipeline → Run workflow → bbox.

## محدوده و صداقت داده
- bbox پیش‌فرض فقط محدودهٔ مطالعاتی تقریبی است، نه مرز رسمی شهر کرج.
- راه‌ها، ساختمان‌ها و POIها به پوشش OSM وابسته‌اند.
- relationهای چندبخشی (multipolygon) در این مرحله assemble نمی‌شوند؛ بنابراین مرزهای administrative/landuse ممکن است کامل نباشند.
- دادهٔ ارتفاع صریح OSM از ارتفاع تخمینی طبقات جداست.
- این QA ساختاری است، نه تأیید دقت نقشه‌برداری/مقیاس‌برداری.
- OSM با ODbL 1.0 منتشر می‌شود؛ attribution در محصول و خروجی حفظ شود.

## معیار عبور مرحلهٔ دوم
- [ ] اجرای واقعی pipeline و دریافت artifact موفق
- [ ] بررسی report: تعداد features، دسته‌ها، هندسه‌های نامعتبر و ارتفاع
- [ ] تأیید مرز مطالعه توسط منبع رسمی/معتبر
- [ ] پوشش راه، ساختمان، آب، کاربری زمین و POI بررسی شود
- [ ] خطاهای relation، polygon و دادهٔ تکراری رفع/مستند شوند
- [ ] دادهٔ استخراج‌شده در نقشه بارگذاری و عملکرد سنجیده شود
- [ ] حجم فایل و زمان بارگذاری روی دستگاه متوسط اندازه‌گیری شود

## مسیر بعد
پس از QA واقعی: clip با مرز تأییدشده، تولید PMTiles چند-zoom، تفکیک لایه‌ها، و سپس SQLite/Tauri.
