# مرحلهٔ دوم — دادهٔ جغرافیایی کرج

## هدف
ساخت جریان تکرارپذیر از دریافت OSM تا QA و آماده‌سازی vector tiles؛ بدون ادعای دادهٔ جعلی یا مرز رسمی.

## اجزای پیاده‌شده
- `scripts/karaj_data_pipeline.py`: دریافت Overpass با retry، تبدیل node/way، metadata، SHA-256 و گزارش دسته‌ها.
- `scripts/validate_geojson.py`: QA ساختاری GeoJSON.
- `scripts/split_osm_layers.py`: تفکیک FeatureCollection به لایه‌های `building`، `transportation`، `landuse`، `water` و `poi`؛ یک عارضه می‌تواند در چند لایهٔ معنایی حضور داشته باشد.
- `tests/test_data_pipeline.py` و `tests/test_split_layers.py`: تست‌های بدون اینترنت.
- `.github/workflows/karaj-data-pipeline.yml`: تست، استخراج، QA، split و ذخیرهٔ artifact چهارده‌روزه.
- `.github/workflows/build-karaj-pmtiles.yml`: اجرای دستی end-to-end؛ استخراج OSM، QA، split، build Tippecanoe و خروجی PMTiles چندلایه در artifact سی‌روزه.
- UI: واردکردن GeoJSON و ذخیره/بازیابی در IndexedDB.

## اجرای محلی
```bash
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/karaj_data_pipeline.py --bbox 35.70,50.88,35.98,51.12
python scripts/validate_geojson.py public/data/karaj-osm.geojson
python scripts/split_osm_layers.py public/data/karaj-osm.geojson --out-dir public/data/vector
```

## ساخت PMTiles (workflow خودکار)
در GitHub → Actions → **Build Karaj PMTiles dataset** → Run workflow، bbox را (در صورت نیاز) وارد کنید. این workflow داده را از Overpass دریافت می‌کند، تست و QA را اجرا می‌کند، Tippecanoe را build کرده و فایل `karaj.pmtiles` و GeoJSONها را در artifact قرار می‌دهد. این اجرا دستی است و با commitهای عادی، درخواست سنگین Overpass اجرا نمی‌شود.

## ساخت PMTiles (محلی، پس از استخراج واقعی)
با نصب Tippecanoe:
```bash
tippecanoe -o public/data/karaj.pmtiles -zg --drop-densest-as-needed \
  -L building:public/data/vector/building.geojson \
  -L transportation:public/data/vector/transportation.geojson \
  -L landuse:public/data/vector/landuse.geojson \
  -L water:public/data/vector/water.geojson \
  -L poi:public/data/vector/poi.geojson
```
سپس PMTiles باید در مرورگر از نظر header، source-layerها، zoom range و حجم آزمایش شود؛ این دستور هنوز به معنی تولید فایل PMTiles نهایی در مخزن نیست.

## محدوده و صداقت داده
- bbox پیش‌فرض، محدودهٔ مطالعاتی تقریبی است، نه مرز رسمی شهر کرج.
- پوشش راه، ساختمان و POI وابسته به OSM است.
- relation/multipolygon هنوز assemble نمی‌شود؛ برخی polygonها/مرزها ناقص خواهند بود.
- ارتفاع صریح OSM از ارتفاع تخمینی طبقات جداست.
- QA ساختاری، تضمین صحت نقشه‌برداری نیست.
- OSM با ODbL 1.0 است؛ attribution باید در نقشه و خروجی حفظ شود.

## اتصال لایه‌ها به نقشه
- Vector source archive: `pmtiles://.../karaj.pmtiles`
- Source-layerهای Tippecanoe: `building`، `transportation`، `landuse`، `water`، `poi`.
- لایه‌های PMTiles در style: `buildings`، `roads`، `land`، `water`، `poi-vector`؛ کلیدهای پنل لایه‌ها اکنون visibility این لایه‌ها و لایه‌های GeoJSON محلی را با هم کنترل می‌کنند.
- GeoJSON محلی نیز لایه‌های راه، footprint ساختمان، آب/آبراه، کاربری زمین و POI دارد. extrusion سه‌بعدی فقط از GeoJSON دارای `render_height_m` ساخته می‌شود؛ دادهٔ PMTiles هنوز برای extrusion محلی آماده‌سازی نشده است.

## معیار عبور مرحلهٔ دوم
- [ ] اجرای واقعی pipeline و بررسی artifact
- [ ] بررسی گزارش featureها، دسته‌ها، هندسه و ارتفاع
- [ ] تأیید مرز مطالعه با منبع رسمی/معتبر
- [ ] بررسی پوشش roads/buildings/water/landuse/POI
- [ ] رسیدگی به relationها و polygonهای ناقص
- [ ] بارگذاری داده در نقشه و سنجش عملکرد
- [ ] ثبت حجم و زمان بارگذاری روی دستگاه متوسط
- [ ] تولید PMTiles و آزمون واقعی source-layerها

## ادامهٔ کار
بعد از QA: clip با مرز معتبر، تولید PMTiles چند-zoom، تکمیل rendering لایه‌ها و سپس بستهٔ آفلاین/SQLite/Tauri.
