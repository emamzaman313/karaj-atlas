# فاز ۳ — دادهٔ عملیاتی و ساختمان سه‌بعدی

## جریان داده
1. `scripts/fetch_osm_karaj.py` از Overpass عوارض ساختمان/راه/POI را در bbox مطالعاتی تقریبی دریافت می‌کند.
2. `scripts/build_3d_buildings.py` ویژگی‌های ارتفاعی را اضافه می‌کند:
   - `height` یا `building:height`: منبع ارتفاع OSM (در صورت قابل‌تبدیل و بازهٔ معقول).
   - `building:levels × 3m`: تخمین صریح با `height_source=estimated_from_levels_3m`.
   - بدون ارتفاع/طبقه: ۹ متر صرفاً جایگزین بصری با `visual_fallback_not_verified`؛ نه ارتفاع واقعی.
3. `scripts/validate_osm_3d.py` ساختار FeatureCollection، هندسه و ارتفاع‌های نمایشی را کنترل می‌کند.
4. Workflow `.github/workflows/osm-3d-data.yml` این مراحل را اجرا و GeoJSON را به‌صورت Artifact موقت منتشر می‌کند.

## فعال‌سازی در رابط
- فایل `public/data/karaj-3d.geojson` در اجرا از `/data/karaj-3d.geojson` خوانده می‌شود.
- لایهٔ ۲D و extrusion سه‌بعدی از یک منبع GeoJSON تغذیه می‌شوند.
- جست‌وجوی Enter در نام‌های ثبت‌شدهٔ محلی، نقشه را به اولین نتیجه می‌برد و اطلاعات آن را نشان می‌دهد.
- PMTiles در `public/data/karaj.pmtiles` برای نقشهٔ برداری آفلاین استفاده می‌شود؛ source-layerهای style باید با خروجی واقعی tilemaker تطبیق داده شوند.

## محدودیت‌های شفاف
- bbox مستطیلی فعلی مرز رسمی شهر/شهرداری نیست؛ دادهٔ بیرون محدودهٔ اداری ممکن است وارد شود.
- Overpass ممکن است محدودیت نرخ/زمان داشته باشد. برای استخراج بزرگ و پایدار، Geofabrik PBF + Osmium و مرز معتبر لازم است.
- GeoJSON حجیم است و برای تولید نهایی باید به vector tiles/PMTiles تبدیل شود.
- این QA فقط ساختار را بررسی می‌کند، نه جامعیت، صحت موقعیت یا دقت ارتفاع.
- OSM تحت ODbL است؛ انتساب © OpenStreetMap contributors باید حفظ شود.
