# مرحلهٔ دوم — دادهٔ جغرافیایی کرج

## هدف
ساخت جریان تکرارپذیر از دریافت OSM تا QA و آماده‌سازی vector tiles؛ بدون ادعای دادهٔ جعلی یا مرز رسمی.

## اجزای پیاده‌شده
- `scripts/karaj_data_pipeline.py`: دریافت Overpass با retry، تبدیل node/way، metadata، SHA-256 و گزارش دسته‌ها.
- `scripts/validate_geojson.py`: QA ساختاری GeoJSON.
- `scripts/split_osm_layers.py`: تفکیک FeatureCollection به لایه‌های `building`، `transportation`، `landuse`، `water` و `poi`؛ یک عارضه می‌تواند در چند لایهٔ معنایی حضور داشته باشد.
- `tests/test_data_pipeline.py` و `tests/test_split_layers.py`: تست‌های بدون اینترنت.
- `.github/workflows/karaj-data-pipeline.yml`: تست، استخراج، QA، split و ذخیرهٔ artifact چهارده‌روزه.
- UI: واردکردن GeoJSON و ذخیره/بازیابی در IndexedDB.

## اجرای محلی
```bash
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/karaj_data_pipeline.py --bbox 35.70,50.88,35.98,51.12
python scripts/validate_geojson.py public/data/karaj-osm.geojson
python scripts/split_osm_layers.py public/data/karaj-osm.geojson --out-dir public/data/vector
```

## ساخت PMTiles (پس از استخراج واقعی)
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
