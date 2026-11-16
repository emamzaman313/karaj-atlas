# طرح دادهٔ اطلس کرج

## قواعد مشترک
هر رکورد مکانی باید تا حد امکان شامل این فیلدها باشد:

| فیلد | توضیح |
|---|---|
| id | شناسهٔ پایدار داخلی |
| name / name:fa | نام اصلی و فارسی |
| geometry | هندسه با CRS مشخص؛ در خروجی GeoJSON معمولاً WGS84 |
| source | منبع/شناسهٔ اصلی |
| source_date | تاریخ دریافت یا مشاهده |
| confidence | high / medium / low |
| method | surveyed / source-tagged / inferred |
| notes | توضیحات و محدودیت |

## ساختمان
- footprint: چندضلعی اثر ساختمان
- building_type: نوع ساختمان
- levels: تعداد طبقات، فقط اگر مستند باشد
- height_m: ارتفاع متر، فقط در صورت وجود منبع
- height_method: tagged / measured / estimated
- roof_type و roof_material: در صورت وجود
- source_tags: تگ‌های خام OSM یا منبع دیگر

## راه و معبر
- geometry: خط یا چندخط
- highway_class: طبقه‌بندی راه
- name: نام ثبت‌شده
- surface، access، oneway، width: فقط مقادیر موجود و قابل استناد
- routing_status: وضعیت اعتبار برای مسیریابی

## مکان مهم (POI)
- category: مسجد، مدرسه، درمان، حمل‌ونقل، فرهنگی، خدماتی و غیره
- name، address، opening_hours، contact: در صورت وجود و مجاز بودن
- location_accuracy: دقیق/تقریبی
- verification: verified / source-only / needs-review

## محدودهٔ محله
- polygon: مرز
- boundary_source: مرجع مرز
- boundary_date: تاریخ/نسخه
- boundary_confidence: رسمی / منبع‌دار غیررسمی / تقریبی
- هرگز مرز تخمینی را «رسمی» معرفی نکنید.

## بناها و تاریخ
- event_type: تأسیس، ساخت، افتتاح، توسعه، مرمت
- date_start / date_end: تاریخ یا بازه
- date_calendar: شمسی / قمری / میلادی
- evidence: URL، کتاب، سند یا تصویر آرشیوی
- evidence_quote: نقل کوتاه و مجاز
- certainty: قطعی / محتمل / نامعلوم
- conflicting_sources: منابع دارای اختلاف

## انتساب و مجوز
برای هر مجموعه‌داده، مجوز، انتساب، تاریخ دریافت، روش تبدیل و تغییرات ثبت شود. دادهٔ OSM با انتساب OpenStreetMap و شرایط ODbL منتشر می‌شود.
