# اطلس کرج | Karaj Atlas

**اطلس مستقل و آفلاین‌محور کرج**؛ وب‌سایت و رندر نقشه متعلق به خود پروژه است و شهر را از داده‌های برداری محلی رسم می‌کند. دادهٔ پایه از OpenStreetMap دریافت و با رعایت مجوز آن در بستهٔ خود اطلس میزبانی می‌شود؛ برنامه به سایت یا سرویس کاشی نقشهٔ دیگری هدایت نمی‌کند.

## وضعیت فعلی (شروع توسعه)
- پوستهٔ رابط فارسی RTL و موتور MapLibre اضافه شده است.
- کنترل لایه‌های راه، ساختمان، آب و کاربری زمین با نمایش/مخفی‌سازی گروهی.\n- جست‌وجوی زندهٔ فارسی با نرمال‌سازی «ی/ي» و «ک/ك»، فیلتر نام/نشانی/همه، انتخاب نتیجه و نشانگر نقشه.\n- پنل ویژگی عارضه و خروجی GeoJSON/CSV از دادهٔ محلی بارگذاری‌شده.
- PMTiles هنوز به‌عنوان دادهٔ ثابت در مخزن commit نشده؛ workflow دستی تولید PMTiles و artifact اضافه شده است.
- CI فرانت‌اند و workflow دستی داده/PMTiles اضافه شده‌اند.
- برای تولید بستهٔ داده: GitHub → Actions → **Build Karaj PMTiles dataset** → Run workflow؛ خروجی `karaj.pmtiles` در artifact همان اجراست.
- builder با `scripts/build_pmtiles.sh` پنج لایه را بررسی می‌کند و فقط پس از وجود خروجی غیرخالی موفق می‌شود.
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
فایل PMTiles تولیدشده را در `public/data/karaj.pmtiles` قرار دهید. سپس source-layerهای style در `src/app.ts` را دقیقاً با schema کاشی‌های واقعی تطبیق دهید. راهنمای پردازش در [docs/PIPELINE.fa.md](docs/PIPELINE.fa.md) است.

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


## توسعهٔ نرم‌افزار (TypeScript-first)

هستهٔ رابط و نقشه با **TypeScript strict** توسعه می‌یابد؛ فایل‌های جدید UI و منطق برنامه باید `.ts` باشند و افزودن JavaScript جدید به هسته مجاز نیست.

- **TypeScript**: رابط نقشه، کنترل لایه‌ها، جست‌وجو، تعاملات، state و مدل‌های داده.
- **MapLibre GL JS + PMTiles**: نمایش نقشهٔ برداری و بسته‌های آفلاین.
- **Three.js (مرحلهٔ بعد)**: صحنه‌ها و جلوه‌های سه‌بعدی فراتر از extrusion نقشه.
- **Python**: استخراج/تبدیل/اعتبارسنجی داده‌های OSM و pipeline داده.
- **C++/Rust**: فقط برای اجزای native یا پردازش واقعاً سنگین؛ با benchmark و اتصال مشخص (مثلاً WASM/native)، نه افزودن صوری زبان.
- **Tauri 2**: بسته‌بندی دسکتاپ آفلاین پس از تثبیت داده و نقشه.

### فرمان‌های توسعه

```bash
npm install
npm run dev
npm run build  # type-check + production bundle
npm run preview
```


## نسخهٔ نزدیک انتشار — چک نهایی
- [x] ساخت frontend با TypeScript/Vite در CI
- [x] تست‌های offline pipeline و GeoJSON QA
- [x] رندر اختصاصی MapLibre از دادهٔ محلی، بدون fallback به سرویس کاشی خارجی
- [x] PMTiles vector source و لایه‌های راه/ساختمان/آب/زمین/POI
- [x] ساختمان 3D در GeoJSON و vector tiles
- [x] جست‌وجوی فارسی و کنترل لایه‌ها
- [x] import/export GeoJSON و CSV، ذخیره IndexedDB
- [x] PWA shell و manifest نصب
- [x] محافظت import در برابر فایل‌های خیلی بزرگ و fallback وقتی دادهٔ محلی نیست
- [ ] اجرای استخراج واقعی OSM و بازبینی کیفیت داده
- [ ] تأیید مرز اداری کرج از منبع رسمی (bbox فعلی مرز رسمی نیست)
- [ ] آزمون واقعی PMTiles ساخته‌شده در مرورگر و سنجش عملکرد
- [ ] تست دستی موبایل/دسکتاپ و انتشار GitHub Pages/Release

**تعریف انتشار:** این مخزن buildable است، اما «نقشهٔ نهایی و بدون باگ» تا انجام موارد باز بالا قابل تضمین نیست. CI موفق نیز جای آزمون واقعی داده و مرورگر را نمی‌گیرد.


### کنترل کیفیت PMTiles
در مرحلهٔ ساخت آرشیو، اسکریپت `scripts/verify_pmtiles.py` اکنون magic header، نسخهٔ PMTiles v3، حداقل طول فایل و SHA-256 را بررسی و گزارش checksum تولید می‌کند. این کنترل صحت header/فایل را می‌سنجد، نه decode کامل همهٔ tileها؛ برای آن آزمون نقشه/ابزار PMTiles لازم است.


## فعال‌سازی انتشار عمومی (یک‌بار برای مخزن)
ساخت production در Actions موفق است؛ برای اجازهٔ انتشار، مالک مخزن باید یک‌بار:
1. وارد **Settings → Pages** همین مخزن شود.
2. در **Build and deployment → Source** گزینهٔ **GitHub Actions** را انتخاب کند.
3. ذخیره کند؛ سپس workflow انتشار را از Actions دوباره اجرا کند.

پس از آن، با push به شاخهٔ `main` سایت build و deploy می‌شود. پس از اجرای موفق workflow **Build Karaj PMTiles dataset** نیز workflow انتشار همان artifact داده را دریافت می‌کند و `public/data/karaj.pmtiles` را داخل خروجی خود سایت قرار می‌دهد. برنامه هیچ کاشی تصویری را از وب‌سایت دیگری نمی‌گیرد؛ بدون artifact داده، نمای اختصاصی اطلس باز می‌شود و پیام کمبود بستهٔ داده نمایش داده خواهد شد.
