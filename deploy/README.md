# نشر هدهد على Hostinger VPS خلف Cloudflare

هذا الدليل ينقل المشروع من جهازك إلى متجر يعمل على دومينك. كل ما في مجلد `deploy/` مصمَّم لسيرفر واحد، ويُبنى ويُنشر تلقائياً من GitHub.

```
الزائر ─ Cloudflare (DNS + CDN + حماية) ─ Caddy على السيرفر :443
                                           ├─ example.sa       ← المتجر (ويمرّر /admin إلى لوحة الإدارة)
                                           └─ api.example.sa   ← الـ API (إشعارات الدفع وصفحات البوابات)
داخل السيرفر فقط: PostgreSQL 17 · Redis 7 · Meilisearch 1.15 · لوحة الإدارة · النسخ الاحتياطي
خارج السيرفر:     Cloudflare R2 للصور (عامة وخاصة) وللنسخ الاحتياطية
```

| الملف | وظيفته |
|---|---|
| `compose.yml` | كل الخدمات، مع حدود ذاكرة وفحوص صحة وتدوير السجلات |
| `Caddyfile` | الـ reverse proxy: شهادة Cloudflare، ورفض أي طلب لا يأتي عبر Cloudflare، وتمرير عنوان العميل الحقيقي |
| `.env.example` | قالب كل الإعدادات والأسرار |
| `backup/` | نسخة يومية من قاعدة البيانات إلى R2 |
| `scripts/server-setup.sh` | تجهيز سيرفر Ubuntu جديد (Docker وجدار حماية وSwap وتأمين SSH) |
| `scripts/init-env.sh` | إنشاء `.env` وتوليد كل الأسرار تلقائياً |
| `scripts/deploy.sh` | سحب الصور ثم ترحيل قاعدة البيانات ثم التشغيل |
| `scripts/restore.sh` | استرجاع قاعدة البيانات من نسخة احتياطية |
| `.github/workflows/deploy.yml` (خارج هذا المجلد) | بناء الصور في GitHub ونشرها على السيرفر |

---

## ما تحتاجه قبل البدء

- **VPS** بنظام Ubuntu 24.04: ذاكرة 8 جيجابايت كحد أدنى (KVM 2)، ويُفضّل 16 جيجابايت (KVM 4) عند الإطلاق.
- **دومين** مُضاف إلى Cloudflare (الخطة المجانية تكفي).
- **مستودع GitHub** للمشروع (`Azim190/hudhudfurn`).
- **مفتاح SSH** على جهازك. إن لم يكن لديك واحد: `ssh-keygen -t ed25519 -C "hudhud"`.

> في الأمثلة التالية استبدل `example.sa` بدومينك و`203.0.113.10` بعنوان السيرفر.

---

## الخطوة 1: إعداد Cloudflare

**1. سجلات DNS** (كلها بالسحابة البرتقالية Proxied):

| النوع | الاسم | القيمة |
|---|---|---|
| A | `@` | `203.0.113.10` |
| A | `www` | `203.0.113.10` |
| A | `api` | `203.0.113.10` |

**2. SSL/TLS:**
- **Overview:** اختر **Full (strict)**.
- **Origin Server → Create Certificate:** اترك الإعداد الافتراضي (`example.sa` و`*.example.sa`، مدة 15 سنة). احفظ الشهادة في ملف `origin.pem` والمفتاح في `origin-key.pem`. المفتاح لا يظهر إلا مرة واحدة.
- **Edge Certificates:** فعّل **Always Use HTTPS**.

**3. استثناء إشعارات الدفع من الحماية.** إذا فعّلت Bot Fight Mode أو أي تحدٍّ للزوار، فأنشئ قاعدة من **Security → WAF → Custom rules**:
- الشرط: `Hostname equals api.example.sa` و`URI Path starts with /api/v1/payments/webhooks/`
- الإجراء: **Skip** لكل الحمايات.

بدون هذه القاعدة قد تُحجب إشعارات Moyasar وTabby وTamara، فتبقى الطلبات معلّقة دون تأكيد الدفع.

**4. R2** (من القائمة الجانبية R2 Object Storage):
1. أنشئ ثلاث حاويات: `hudhud-media` و`hudhud-private` و`hudhud-backups`.
2. في `hudhud-media` فقط: **Settings → Custom Domains** واربط `media.example.sa`. هذا هو `MEDIA_PUBLIC_BASE_URL`. لا تجعل الحاويتين الأخريين عامتين أبداً.
3. في `hudhud-backups`: **Settings → Object lifecycle rules**، واحذف الكائنات بعد 30 يوماً (أو المدة التي تريدها).
4. **Manage API Tokens** وأنشئ رمزين:
   - رمز **Object Read & Write** على `hudhud-media` و`hudhud-private`، وقيمه تذهب إلى `S3_ACCESS_KEY` و`S3_SECRET_KEY`.
   - رمز **Object Read & Write** على `hudhud-backups` فقط، وقيمه تذهب إلى `BACKUP_ACCESS_KEY` و`BACKUP_SECRET_KEY`.
5. انسخ عنوان **S3 API** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`) إلى `S3_ENDPOINT` و`BACKUP_S3_ENDPOINT`.

---

## الخطوة 2: تجهيز السيرفر

من جهازك (PowerShell أو Git Bash) داخل مجلد المشروع:

```bash
scp deploy/scripts/server-setup.sh root@203.0.113.10:/root/
ssh root@203.0.113.10 "bash /root/server-setup.sh"
```

السكربت يثبّت Docker، وينشئ المستخدم `deploy` والمجلد `/opt/hudhud`، ويضيف Swap بحجم 4 جيجابايت، ويفعّل جدار الحماية (المنافذ 22 و80 و443 فقط)، والتحديثات الأمنية التلقائية، وfail2ban.

إذا كان مفتاح SSH مضافاً للمستخدم root، فسيُنسخ إلى `deploy` ويُغلق الدخول بكلمة المرور. وإن لم يكن مضافاً، فسيخبرك السكربت بإضافته ثم إعادة تشغيله.

> لوحة Hostinger فيها جدار حماية خاص بها أيضاً. إن كان مفعّلاً، فاسمح فيه بالمنافذ 22 و80 و443.

---

## الخطوة 3: الملفات والأسرار على السيرفر

```bash
# من جهازك، داخل مجلد المشروع: انسخ مجلد deploy والشهادتين
scp -r deploy deploy@203.0.113.10:/tmp/
scp origin.pem origin-key.pem deploy@203.0.113.10:/opt/hudhud/certs/

# على السيرفر
ssh deploy@203.0.113.10
cp -r /tmp/deploy/. /opt/hudhud/ && rm -rf /tmp/deploy
cd /opt/hudhud
chmod 600 certs/*.pem
bash scripts/init-env.sh      # ينشئ .env ويولّد كل كلمات المرور والمفاتيح
nano .env                     # أكمل القيم الفارغة
```

القيم التي تكملها بنفسك في `.env`:

| القيمة | من أين |
|---|---|
| `DOMAIN` | دومينك دون `https://` ودون `www` |
| `GHCR_OWNER` | اسم حساب GitHub بأحرف صغيرة (`azim190`) |
| `S3_*` و`MEDIA_PUBLIC_BASE_URL` | الخطوة 1 (R2) |
| `UNIFONIC_*` | حساب Unifonic. بدونه لا يستطيع العملاء تسجيل الدخول |
| `MOYASAR_*` و`TABBY_*` و`TAMARA_*` | لوحات التجار عند كل بوابة |
| `SEED_OWNER_EMAIL` و`SEED_OWNER_PASSWORD` | حساب المالك الأول. كلمة مرور طويلة وفريدة |
| `BACKUP_*` | الخطوة 1 (R2) |

بعد الانتهاء **احفظ نسخة من ملف `.env` كاملاً في مدير كلمات المرور.** إذا ضاع `ENCRYPTION_KEY`، فلن تستطيع فك تشفير بيانات المصادقة الثنائية للموظفين حتى لو استرجعت قاعدة البيانات. وإذا ضاع `ZATCA_PRIVATE_KEY`، فستنقطع سلسلة الفواتير.

> **مفتاح ZATCA:** `init-env.sh` يولّد مفتاحاً جديداً. استخدم هذا المفتاح نفسه في إنشاء طلب الشهادة (CSR) عند الربط مع منصة فاتورة، لأن شهادة CSID مرتبطة بالمفتاح. أما إذا كنت قد أنهيت الربط بمفتاح آخر، فضع ذلك المفتاح بدلاً منه.

---

## الخطوة 4: ربط GitHub بالسيرفر

**1. مفتاح خاص بالنشر.** على جهازك:
```bash
ssh-keygen -t ed25519 -f hudhud_deploy -N "" -C "github-deploy"
ssh-copy-id -i hudhud_deploy.pub deploy@203.0.113.10     # أو أضف محتوى .pub يدوياً إلى ~/.ssh/authorized_keys
ssh-keyscan -p 22 203.0.113.10                           # انسخ الناتج كاملاً
```

**2. في GitHub:** افتح Settings → Environments → **New environment** وسمّها `production`، ثم أضف:

| النوع | الاسم | القيمة |
|---|---|---|
| Secret | `VPS_SSH_KEY` | محتوى الملف `hudhud_deploy` (المفتاح الخاص) |
| Secret | `VPS_KNOWN_HOSTS` | ناتج `ssh-keyscan` |
| Variable | `VPS_HOST` | `203.0.113.10` |
| Variable | `VPS_USER` | `deploy` |
| Variable | `VPS_PORT` | `22` |
| Variable | `DEPLOY_PATH` | `/opt/hudhud` |

يمكنك تفعيل **Required reviewers** في هذه البيئة، فلا يتم أي نشر إلا بعد موافقتك.

بعد ذلك احذف `hudhud_deploy` من جهازك، أو احفظه في مكان آمن.

---

## الخطوة 5: أول نشر

1. ارفع التعديلات إلى `main` وانتظر نجاح CI.
2. من GitHub افتح **Actions → Deploy → Run workflow** على `main`.
   يبني الصور الثلاث (تستغرق المرة الأولى نحو 10 إلى 15 دقيقة)، ثم يرفعها إلى GHCR، ثم يرحّل قاعدة البيانات، ثم يشغّل كل شيء، ثم يتحقق من الموقع.
3. أنشئ الأدوار والمدن وحساب المالك (مرة واحدة فقط):
   ```bash
   ssh deploy@203.0.113.10
   cd /opt/hudhud
   docker compose run --rm api prisma db seed
   ```
4. احذف `SEED_OWNER_EMAIL` و`SEED_OWNER_PASSWORD` من `.env`، ثم نفّذ `docker compose up -d api`.
5. ادخل إلى `https://example.sa/admin/ar/login` وفعّل المصادقة الثنائية بتطبيق مثل Google Authenticator.

بيانات تجريبية (اختياري، **لا تستخدمها في المتجر الحقيقي**):
```bash
docker compose run --rm api node dist/cli/seed-catalog.js     # 48 منتجاً تجريبياً
docker compose run --rm api node dist/cli/seed-showroom.js    # محتوى صالة العرض
```

---

## التحقق من النجاح

| الرابط | المتوقع |
|---|---|
| `https://example.sa/ar` | المتجر يعمل |
| `https://example.sa/admin/ar/login` | صفحة دخول الإدارة |
| `https://api.example.sa/api/v1/health/ready` | `{"status":"ok","db":"up","redis":"up"}` |
| `https://api.example.sa/api/v1/dev/sms` و`/docs` | **404** |
| `https://203.0.113.10` مباشرة (دون Cloudflare) | الاتصال يُرفض |

وفي لوحات بوابات الدفع اضبط روابط الإشعارات (Webhooks):
- Moyasar: `https://api.example.sa/api/v1/payments/webhooks/moyasar`
- Tabby: `https://api.example.sa/api/v1/payments/webhooks/tabby`
- Tamara: `https://api.example.sa/api/v1/payments/webhooks/tamara`

---

## النشر بعد ذلك والتراجع

- **إصدار جديد:** `git tag v1.0.1 && git push origin v1.0.1`، وسيُنشر تلقائياً. أو استخدم Run workflow يدوياً.
- **التراجع:** من **Actions → Deploy → Run workflow**، اختر من قائمة Branch/Tag الإصدار السابق (مثل `v1.0.0`).
- كل عملية نشر تُسجَّل في `/opt/hudhud/.deploy-history`.

> انتبه: التراجع يعيد الكود فقط، ولا يعكس ترحيلات قاعدة البيانات. إذا احتوى إصدار على ترحيل يحذف أعمدة، فخذ نسخة احتياطية يدوية قبل نشره.

---

## النسخ الاحتياطي والاسترجاع

- نسخة يومية تلقائية الساعة 03:30 بتوقيت الرياض: تُحفظ على السيرفر لمدة 7 أيام، وترفع إلى `hudhud-backups` على R2.
- **نسخة يدوية الآن** (قبل أي تحديث كبير):
  ```bash
  docker compose exec backup backup.sh
  ```
- **عرض النسخ واسترجاع إحداها:**
  ```bash
  bash scripts/restore.sh                                   # يعرض النسخ المتاحة
  bash scripts/restore.sh hudhud-20261107T003000Z.dump      # يطلب كتابة RESTORE للتأكيد
  ```
- **جرّب الاسترجاع مرة واحدة على الأقل** قبل الإطلاق. النسخة التي لم تُجرَّب لا يُعتمد عليها.

الصور محفوظة على R2 وليست على السيرفر. وفهرس Meilisearch يمكن إعادة بنائه من قاعدة البيانات.

---

## وضع التجربة (Staging) قبل اكتمال الحسابات

في وضع الإنتاج، يرفض الـ API العمل دون حساب Unifonic ومفتاح ZATCA، ومع تفعيل محاكي الدفع. وهذا مقصود. أما لتجربة السيرفر قبل اكتمال الحسابات، فضع في `.env`:

```
API_NODE_ENV=development
SMS_PROVIDER=console
PAYMENTS_SIMULATOR=true
```

ثم نفّذ `docker compose up -d api`. ستجد رموز الدخول في سجل الـ API:
```bash
docker compose logs api | grep "dev SMS"
```

مسار `/api/v1/dev/sms` محجوب في Caddy حتى في هذا الوضع. لكن **لا تفتح المتجر للعملاء ولا تُدخل بيانات حقيقية** وهو في هذا الوضع. ولحجب الموقع عن الزوار أثناء التجربة، استخدم Cloudflare Zero Trust → Access على `example.sa` فقط، واترك `api.example.sa` دون حجب حتى تصل صفحات الدفع.

عند الإطلاق أعد القيم إلى `production` و`unifonic` و`false`.

---

## أوامر الصيانة اليومية

```bash
cd /opt/hudhud
docker compose ps                         # حالة الخدمات
docker compose logs -f --tail=100 api     # سجل الـ API مباشرة
docker stats --no-stream                  # استهلاك الذاكرة والمعالج
df -h                                     # المساحة
docker compose restart storefront         # إعادة تشغيل خدمة
```

**عند الحاجة إلى زيادة الموارد:** حدود الذاكرة في `compose.yml` مضبوطة لسيرفر بذاكرة 8 جيجابايت. إن رقّيت إلى 16 جيجابايت، فارفع `shared_buffers` في PostgreSQL إلى `1GB` وحدود الـ API والمتجر.

---

## ملاحظات أمنية

- منفذا 80 و443 مفتوحان في جدار الحماية، لكن Caddy يرفض أي اتصال لا يأتي من عناوين Cloudflare. وهذا يغلق باب تجاوز الحماية بالوصول إلى عنوان السيرفر مباشرة.
- لوحة الإدارة وقاعدة البيانات وRedis وMeilisearch لا تملك أي منفذ عام.
- لا ترفع ملف `.env` ولا مجلد `certs/` إلى Git (مستثناة في `.gitignore`).
- قائمة عناوين Cloudflare في `Caddyfile` نادراً ما تتغير. تحقّق منها مرة في السنة من <https://www.cloudflare.com/ips/>.
