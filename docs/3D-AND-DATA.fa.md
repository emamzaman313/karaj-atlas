# دادهٔ واقعی و نمای سه‌بعدی

## گردش کار داده
1. استخراج OSM به GeoJSON:
   `python scripts/fetch_osm_karaj.py public/data/karaj-osm.geojson`
2. غنی‌سازی ارتفاع:
   `python scripts/build_3d_buildings.py public/data/karaj-osm.geojson public/data/karaj-3d.geojson`
3. برنامه فایل `public/data/karaj-3d.geojson` را در صورت موجود بودن بارگذاری می‌کند.
4. کلید «نمای سه‌بعدی ساختمان‌ها» pitch دوربین را بالا می‌برد و fill-extrusion را روشن می‌کند.

## سیاست ارتفاع
- `height` یا `building:height` قابل‌خواندن و معقول: منبع `osm_height`
- `building:levels`: ارتفاع تقریبی طبقات × ۳ متر؛ منبع `estimated_from_levels_3m`
- بدون هر دو: ۹ متر صرفاً برای نمایش بصری؛ منبع `visual_fallback_not_verified`
- `min_height` در صورت وجود برای پایهٔ extrusion اعمال می‌شود.
- هیچ مقدار fallback نباید در گزارش علمی یا دادهٔ اندازه‌گیری‌شده تلقی شود.

## محدودیت‌های نسخه
- Overpass محدودیت نرخ/حجم دارد؛ برای دادهٔ کل شهر از PBF منطقه‌ای و Osmium استفاده شود.
- GeoJSON بزرگ ممکن است مرورگر را کند کند؛ PMTiles و vector tiles برای مقیاس نهایی ضروری‌اند.
- ارتفاع OSM پوشش کامل ندارد و کیفیت آن باید با شمارش و اعتبارسنجی منتشر شود.
- مرز bbox فعلی مستطیلی و صرفاً محدودهٔ نمونه است، نه مرز رسمی.
- این مرحله ساخت extrusion واقعی روی نقشه است، اما هنوز مدل LoD1 دقیق/دادهٔ شهرداری یا mesh فوتورئالیستی نیست.
