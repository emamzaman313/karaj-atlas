# اطلس کرج | Karaj Atlas

**اطلس جامع، مستند و آفلاین‌محور کرج** برای نمایش راه‌ها، ساختمان‌ها، مکان‌های مهم و داده‌های تاریخی با ذکر منبع و سطح اطمینان.

## وضعیت فعلی (شروع توسعه)
- پوستهٔ رابط فارسی RTL و موتور MapLibre اضافه شده است.
- کنترل لایه‌های راه، ساختمان، آب و کاربری زمین و کلیک روی عارضه در کد پیاده‌سازی شده.
- PMTiles محلی هنوز ساخته/اضافه نشده؛ بنابراین نقشه تا فراهم‌شدن فایل داده نمایش کامل ندارد.
- CI برای build فرانت‌اند اضافه شده است.
- هیچ ادعایی دربارهٔ کامل بودن داده یا صحت مرزهای کرج وجود ندارد.

## اجرای توسعه
نیاز: Node.js 20+

```bash
npm install
npm run dev
```

برای ساخت نسخهٔ production:
```bash
npm run build
npm run preview
```

## افزودن دادهٔ نقشه
فایل PMTiles تولیدشده را در `public/data/karaj.pmtiles` قرار دهید. سپس source-layerهای style در `src/app.js` را دقیقاً با schema کاشی‌های واقعی تطبیق دهید. راهنمای پردازش در [docs/PIPELINE.fa.md](docs/PIPELINE.fa.md) است.

## اصول داده
- هر لایه باید منبع، تاریخ دریافت، مجوز و روش تولید داشته باشد.
- دادهٔ مستند از تخمین جداست؛ ارتفاع تخمینی ساختمان هرگز به‌عنوان ارتفاع واقعی معرفی نمی‌شود.
- تاریخ‌های تاریخی با تفکیک تأسیس/ساخت/افتتاح/مرمت و ذکر شواهد ثبت می‌شوند.
- محدودهٔ محله یا شهر بدون منبع معتبر، رسمی نامیده نمی‌شود.

## فناوری
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js)
- [PMTiles](https://github.com/protomaps/PMTiles)
- [Geofabrik Iran](https://download.geofabrik.de/asia/iran.html)
- [OpenStreetMap Copyright](https://www.openstreetmap.org/copyright)

## مستندات
- [مدل داده](docs/DATA_SCHEMA.fa.md)
- [خط لولهٔ داده](docs/PIPELINE.fa.md)
- [نقشهٔ راه](docs/ROADMAP.fa.md)
- [چک‌لیست کیفیت](docs/QUALITY_CHECKLIST.fa.md)
- [ثبت منابع](sources/sources.json)
