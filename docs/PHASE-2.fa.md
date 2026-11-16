# فاز دوم — دادهٔ واقعی و لایه‌های محلی

## آنچه اکنون در مخزن پیاده شده
- نقشهٔ پایهٔ OSM (آنلاین) با MapLibre
- بارگذاری GeoJSON محلی در صورت وجود فایل `public/data/karaj-osm.geojson`
- لایهٔ راه‌ها، footprint ساختمان و POIهای OSM
- کلیک روی عارضه و نمایش خواص خام
- کنترل روشن/خاموش لایه‌ها
- اسکریپت دریافت داده از Overpass
- workflow دستی GitHub برای ساخت artifact استخراج آزمایشی

## دریافت داده در رایانه
```bash
python scripts/fetch_osm_karaj.py public/data/karaj-osm.geojson
npm install
npm run dev
```
به دلیل اندازهٔ داده و محدودیت Overpass، دریافت ممکن است طول بکشد یا نیازمند retry باشد.

## دریافت از GitHub Actions
1. مخزن → Actions
2. workflow «Prepare Karaj OSM study extract»
3. Run workflow
4. artifact را دریافت و فایل GeoJSON را در `public/data/` قرار دهید.

## هشدار محدوده
bbox اسکریپت صرفاً مستطیل تقریبی اطراف کرج است؛ **مرز رسمی شهر/شهرستان نیست**. تحلیل محله‌ها و آمار نهایی باید پس از انتخاب polygon معتبر انجام شود.

## گام بعد
- مرز رسمی/قابل استناد و نسخه‌دار
- extract کامل PBF و clip با Osmium
- تولید PMTiles با schema ثابت
- نمایهٔ نام فارسی و جست‌وجوی مکانی
- برچسب ارتفاع: tag معتبر، تخمین، یا نامعلوم
