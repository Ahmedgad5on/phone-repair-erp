# 🎨 الدليل الشامل لأنظمة وتصاميم UI/UX وأحدث لوحات الألوان لعام 2026
## مشروع Modular Mobile Repair Lab, Retail POS, Spare Parts Wholesale, and Fintech ERP

مبني وفق دراسة معمقة لأحدث الاتجاهات العالمية من منصات **Dribbble, Behance, Mobbin, Linear, Stripe, Square POS, Toast POS, Apple HIG**.

---

## 1. أحدث أنماط واتجاهات UI/UX لعام 2026 حسب أقسام النظام

### أ. معمل الصيانة وفحص البوردات (Mobile Repair Lab & Diagnostics)
* **واجهة الأجهزة المعملية (Cyber-Industrial HUD / Diagnostic Deck):**
  - **مخططات الإشارات والجهد (Boot Amperage Waveforms):** مستوحاة من أجهزة القياس Oscilloscope مع شبكة Grid خافتة ورسم بياني تفاعلي لحظي لقراءات الشورت والسحب الميلي أمبير (mA).
  - **عارض مخططات البوردات (2.5D Boardview & Schematic Viewer):** تصميم طبقات (Layers) شفافة مع تكبير فائق السرعة، وتحديد مسارات الفولتيات والأرضي (GND) بنظام تسليط ضوء (Spotlight/Hover Pinout).
  - **لوحة كانبان الصيانة المتقدمة (Linear-Style Kanban):**
    - كروت مدمجة عالية الكثافة المعلوماتية (High Density) لا تهدر المساحة.
    - شريط SLA ذكي ينبض (Breathing Glow) عند اقتراب انتهاء الوقت المخصص للإصلاح.
    - مؤشرات مرئية لنوع العطل (Hardware, IC Micro-soldering, Screen, Water Damage) بأيقونات دقيقة.
    - استعراض فوري لصور الفحص قبل/أثناء/بعد الصيانة (Photo Evidence Carousel).

### ب. الكاشير ونقاط البيع السريعة (Retail & Quick-Service Touch POS)
* **بيئة عمل لمسية مريحة (Ergonomic 60/40 Split Grid):**
  - شاشة مقسومة بنسبة 60% لشبكة المنتجات والأقسام السريعة (Touch Tile Grid بمساحة ضغط لا تقل عن 48x48px) و 40% لسلة الشراء الحية الثابتة (Fixed Active Cart).
  - أزرار الفئات العلوية تعتمد أسلوب **Segmented Floating Pills** مع تمرير أفقي ناعم.
  - **حاوية الدفع السريع المجمعة (Quick-Tender Tray):** أزرار عائمة أسفل الشاشة بمبالغ نقدية شائعة (50, 100, 200, 500 ج.م) بلمسة واحدة لإتمام البيع في أقل من 3 ثوانٍ.
  - **نافذة الدفع المجزأ (Multi-Method Split Pay Modal):** سلاسة الانتقال بين الكاش، المحافظ، البطاقات، والتقسيط مع عداد متبقي ينخفض لحظياً (Live Remaining Balance).
  - **شاشة العميل (Customer Facing Display - CFD):** واجهة متزامنة آنياً بتصميم جذاب، تظهر تفاصيل السلة، التوفير، ورمز QR للدفع عبر إنستاباي/المحافظ.

### ج. المخازن وإدارة قطع الغيار (Spare Parts & Warehouse Inventory)
* **محدد مواقع الأرفف (2.5D / Isometric Bin Locator):**
  - خريطة بصرية تفاعلية للمخزن تقسم المساحة إلى (Zone ➔ Aisle ➔ Rack ➔ Shelf ➔ Bin) مثل `Z1-R04-S2-B08`.
  - كروت قطع الغيار تضم توافق الأجهزة (Cross-Model Compatibility Badges) مثل: *"متوافق مع iPhone 11 / XR / 12"*.
  - مؤشرات أرقام المسلسلات والـ IMEI مع وسوم حالة فورية (`IN_STOCK`, `RESERVED`, `DEFECTIVE`, `SOLD`).
  - تتبع التكلفة وفق نظام الوارد أولاً يصرف أولاً (FIFO Cost Badges) مع تنبيهات إعادة الطلب التلقائية (Reorder Trigger Pill).

### د. المحافظ الإلكترونية والتدفق النقدي (Fintech Dashboard & E-Wallets)
* **تصميم بطاقات المحافظ الرقمية (Stripe & Revolut Card Style):**
  - بطاقات محافظ تفاعلية تشبه البطاقات البنكية الحقيقية (Glassmorphic Gradient Surface) تحمل شعار الشبكة، الرصيد المتاح، وحد المعاملات اليومي.
  - شريط السيولة اليومي (Cash Drawer vs Digital Floating Capital) يوضح بدقة حجم السيولة بالدرج مقابل المبالغ بالمحافظ الرقمية.
  - رسم بياني للتدفق النقدي لـ 30 يوماً بنمط **Bento Card Glow Chart**، مع تصنيف المصروفات وقيود اليومية المزدوجة بدقة تامة.

---

## 2. لوحات الألوان الدقيقة (Color Palettes) مع أكواد HEX و Tailwind

### أ. الوضع الليلي المعملي (Industrial Modern Dark Mode - Lab Mode)
> مخصص لراحة عين الفني في معمل الصيانة لـ 10-12 ساعة عمل متواصلة تحت إضاءة الميكروسكوب ومحطات اللحام، مع تباين فائق للأرقام والـ IMEI.

| العنصر | كود HEX | كلاس Tailwind الموصى به | الاستخدام |
|---|---|---|---|
| **Deep Void Canvas** | `#0B0F17` | `bg-[#0B0F17]` | الخلفية الرئيسية لكامل التطبيق |
| **Surface Card** | `#111827` | `bg-slate-900` | خلفية الكروت واللوحات الرئيسية |
| **Elevated Surface** | `#1E293B` | `bg-slate-800` | القوائم المنسدلة، النوافذ، الكروت العائمة |
| **Subtle Hairline Border** | `#334155` / `#1E293B` | `border-slate-800` / `border-slate-700/60` | الحدود الفاصلة الدقيقة |
| **High-Contrast Text** | `#F8FAFC` | `text-slate-50` | العناوين الرئيسية، الأسعار، وقراءات الـ IMEI |
| **Muted Secondary Text** | `#94A3B8` | `text-slate-400` | الملاحظات، التاريخ، والبيانات الوصفية |
| **Oscilloscope Cyan Accent** | `#00F2FE` | `text-[#00F2FE]` / `bg-[#00F2FE]` | قراءات الجهد، المسارات النشطة، وتركيز البحث |
| **Cyber Amber Warning** | `#F59E0B` | `text-amber-400` | تحذيرات اقتراب الـ SLA وقطع الغيار الحرجة |

---

### ب. الوضع النهاري عالي التباين (Clean High-Contrast Light Mode)
> مخصص لشاشات الكاشير والإدارة للمقاومة العالية للإضاءة الفلورية وضوء النهار التجاري.

| العنصر | كود HEX | كلاس Tailwind الموصى به | الاستخدام |
|---|---|---|---|
| **Porcelain Base** | `#F8FAFC` | `bg-slate-50` | خلفية النظام في الوضع الفاتح |
| **Pure White Card** | `#FFFFFF` | `bg-white` | كروت المنتجات وسلة المبيعات |
| **Panel Surface** | `#F1F5F9` | `bg-slate-100` | أعمدة الكانبان وحاويات التصنيفات |
| **Crisp Slate Border** | `#E2E8F0` | `border-slate-200` | خطوط التقسيم والجداول |
| **Deep Charcoal Text** | `#0F172A` | `text-slate-900` | أسماء الأصناف والأسعار البارزة |
| **Subtle Label Text** | `#64748B` | `text-slate-500` | أرقام الباركود والتسميات الفرعية |
| **Primary Brand Blue** | `#2563EB` | `bg-blue-600` | زر إتمام البيع والأزرار الرئيسية |

---

### ج. لوحة الحالات الدلالية لتذاكر الصيانة (Repair Ticket Statuses)

| الحالة (Status) | كود المظهر الأساسي (Solid) | كود الخلفية الخافتة (Badge BG) | لون النص المتناسق |
|---|---|---|---|
| **Received (تم الاستلام)** | `#0284C7` (Sky 600) | `#E0F2FE` (Sky 100) / Dark: `#0C4A6E` | `#0369A1` / Dark: `#38BDF8` |
| **In-Progress (قيد الفحص/الصيانة)** | `#D97706` (Amber 600) | `#FEF3C7` (Amber 100) / Dark: `#78350F` | `#B45309` / Dark: `#FBBF24` |
| **Testing / QA (اختبار الجودة)** | `#6366F1` (Indigo 500) | `#EEF2FF` (Indigo 100) / Dark: `#312E81` | `#4338CA` / Dark: `#818CF8` |
| **Ready for Pickup (جاهز للتسليم)** | `#059669` (Emerald 600) | `#D1FAE5` (Emerald 100) / Dark: `#064E3B` | `#047857` / Dark: `#34D399` |
| **Delivered (تم التسليم للعميل)** | `#475569` (Slate 600) | `#F1F5F9` (Slate 100) / Dark: `#1E293B` | `#334155` / Dark: `#94A3B8` |
| **Cancelled / Breached (ملغي/مخترق)** | `#E11D48` (Rose 600) | `#FFE4E6` (Rose 100) / Dark: `#4C0519` | `#BE123C` / Dark: `#FB7185` |

---

### د. الهوية البصرية للمحافظ الإلكترونية والشبكات المصرية (Fintech Brands)

| المحفظة / القناة | كود HEX الأساسي | كود التدرج اللوني (Gradient) | لون النص والشعار |
|---|---|---|---|
| **Vodafone Cash (فودافون كاش)** | `#E60000` | `from-[#E60000] to-[#B30000]` | أبيض ناصع `#FFFFFF` |
| **InstaPay (إنستاباي)** | `#381B6D` | `from-[#381B6D] via-[#4D2395] to-[#00C2FF]` | أبيض ناصع `#FFFFFF` مع لمسة تركواز |
| **Orange Money (أورنج كاش)** | `#FF7900` | `from-[#FF7900] to-[#E06A00]` | أسود داكن `#000000` أو أبيض `#FFFFFF` |
| **Etisalat / e& Cash (اتصالات)** | `#719E19` | `from-[#719E19] to-[#00B140]` | أبيض ناصع `#FFFFFF` |
| **WE Pay (وي باي)** | `#5C2D91` | `from-[#5C2D91] to-[#401C66]` | أبيض ناصع `#FFFFFF` |
| **Cash Drawer (الدرج النقدي)** | `#16A34A` | `from-[#16A34A] to-[#15803D]` | أبيض ناصع `#FFFFFF` |
| **Bank POS Card (فيزا/ماستركارد)** | `#0284C7` | `from-[#0284C7] to-[#0369A1]` | أبيض ناصع `#FFFFFF` |

---

## 3. أنماط التصميم والتيبوغرافي (Design Patterns & Typography)

### أ. التيبوغرافي ثنائي اللغة (Arabic RTL & English LTR)
1. **النصوص العامة وواجهات المستخدم (UI Body & Headers):**
   - **Arabic:** خط **Readex Pro** أو **Cairo** أو **IBM Plex Sans Arabic**. يمنح راحة استثنائية في قراءة القوائم والنوافذ والرسائل.
   - **English:** خط **Inter** أو **Geist Sans** (معايير وتطبيقات Vercel وLinear الحديثة).
2. **الأرقام والعمليات المالية والـ IMEI والباركود:**
   - خط **JetBrains Mono** أو **Geist Mono** مع تفعيل خاصية:
   ```css
   font-variant-numeric: tabular-nums;
   -webkit-font-feature-settings: "tnum";
   font-feature-settings: "tnum";
   ```
   *الفائدة:* ثبات عرض الأرقام ومحاذاتها الرأسية بدقة متناهية داخل جداول المخازن، كروت الأسعار، وسجلات القيود اليومية دون أي اهتزاز عند التحديث الحي.
3. **طباعة الفواتير الحرارية (ESC/POS 80mm & 57mm):**
   - خط المونوسبيس الكلاسيكي الموفر للحبر والأعلى وضوحاً: `'Courier New', Courier, monospace` مع وزن خط `font-bold` ومسافات أسطر مدمجة (`leading-tight`).

---

### ب. أنماط الـ UI المتقدمة (Modern Design Patterns 2026)
* **Bento Grid Architecture:**
  - تقسيم الشاشات المعقدة (مثل لوحة التحكم والتقارير المالية) إلى كتل هندسية محكمة بأطراف ناعمة (`rounded-2xl`) مع تأثير زجاجي خافت (`backdrop-blur-md bg-slate-900/80 border border-slate-800`).
* **Dynamic Island / Floating Status Pill:**
  - شريط علوي عائم يعرض مؤشرات حية: حالة الوردية المفتوحة، عدد أجهزة الصيانة المتأخرة، وإشعارات المزامنة مع فروع المخازن دون حجب الشاشة.
* **Micro-Interactions & Feedback:**
  - تأثير نبضات التنبيه (Breathing Aura / Ping Badge) للأعطال الحرجة.
  - وميض تأكيد المسح السريع (Scanner Success Flash: وميض أخضر خفيف `ring-2 ring-emerald-500` يستمر 250ms عند مسح باركود صنف أو IMEI).
  - فيزياء مرنة (Spring Physics) عند سحب وإفلات كروت الصيانة بين أعمدة الكانبان.
* **Skeleton Loaders:**
  - استبدال دوائر التحميل التقليدية بهياكل متحركة تحاكي المحتوى الأصلي بتدرج لوني شيمر (`bg-gradient-to-r from-slate-800 via-slate-700/60 to-slate-800 bg-[length:200%_100%] animate-shimmer`).

---

## 4. نماذج كود مكونات React + Tailwind CSS جاهزة للدمج

### نموذج 1: كرت صيانة تفاعلي بنظام Linear / Cyber-Industrial
```tsx
import React from 'react';
import { AlertCircle, Clock, Smartphone } from 'lucide-react';

interface TicketCardProps {
  id: string;
  customer: string;
  device: string;
  imei: string;
  issue: string;
  slaBreach: boolean;
  timeLeft: string;
}

export const ModernRepairCard: React.FC<TicketCardProps> = ({
  id, customer, device, imei, issue, slaBreach, timeLeft
}) => {
  return (
    <div className={`group relative p-4 rounded-xl transition-all duration-200 cursor-pointer
      bg-slate-900/90 hover:bg-slate-850 border shadow-lg
      ${slaBreach 
        ? 'border-rose-500/50 shadow-rose-950/20 animate-pulse' 
        : 'border-slate-800 hover:border-sky-500/50 hover:shadow-sky-950/20'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/60">
          #{id}
        </span>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          slaBreach 
            ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' 
            : 'bg-slate-800 text-slate-300'
        }`}>
          <Clock className="w-3 h-3" />
          <span className="tabular-nums">{timeLeft}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="w-4 h-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors">
          {device}
        </h4>
      </div>

      <div className="text-xs text-slate-400 mb-2 truncate">
        العميل: <span className="text-slate-200 font-medium">{customer}</span>
      </div>

      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 mb-3">
        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{issue}</p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
        <span className="text-slate-400 font-mono tabular-nums tracking-wider select-all">
          IMEI: {imei}
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          جاهز للفحص
        </span>
      </div>
    </div>
  );
};
```

---

### نموذج 2: كرت محفظة مالية رقمية (Fintech E-Wallet Card)
```tsx
import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface WalletCardProps {
  type: 'VODAFONE_CASH' | 'INSTAPAY' | 'ORANGE_CASH' | 'CASH_DRAWER';
  balance: number;
  accountNumber: string;
  dailyLimitUsedPercent: number;
}

export const ModernWalletCard: React.FC<WalletCardProps> = ({
  type, balance, accountNumber, dailyLimitUsedPercent
}) => {
  const configs = {
    VODAFONE_CASH: {
      title: 'فودافون كاش',
      bgGradient: 'from-[#E60000] to-[#8A0000]',
      badge: 'bg-red-950 text-red-200 border-red-800',
      tag: 'Vodafone Cash',
    },
    INSTAPAY: {
      title: 'إنستاباي مصر',
      bgGradient: 'from-[#381B6D] via-[#4D2395] to-[#00C2FF]',
      badge: 'bg-purple-950 text-purple-200 border-purple-800',
      tag: 'InstaPay IPA',
    },
    ORANGE_CASH: {
      title: 'أورنج كاش',
      bgGradient: 'from-[#FF7900] to-[#B35500]',
      badge: 'bg-orange-950 text-orange-200 border-orange-800',
      tag: 'Orange Cash',
    },
    CASH_DRAWER: {
      title: 'الدرج النقدي الرئيسي',
      bgGradient: 'from-[#16A34A] to-[#0F5132]',
      badge: 'bg-emerald-950 text-emerald-200 border-emerald-800',
      tag: 'Physical Cash',
    },
  }[type];

  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br ${configs.bgGradient} shadow-xl`}>
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <span className="text-xs font-bold uppercase tracking-wider bg-black/30 px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/10">
          {configs.tag}
        </span>
        <div className="flex items-center gap-1 text-xs text-white/80">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>مؤمن ومشفر</span>
        </div>
      </div>

      <div className="mb-4 relative z-10">
        <div className="text-xs text-white/75 font-medium mb-1">{configs.title}</div>
        <div className="text-2xl font-black font-mono tracking-tight tabular-nums">
          {balance.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
          <span className="text-sm font-normal mr-1.5 opacity-80">ج.م</span>
        </div>
        <div className="text-xs font-mono text-white/60 tracking-widest mt-1">
          {accountNumber}
        </div>
      </div>

      <div className="relative z-10 pt-3 border-t border-white/15">
        <div className="flex justify-between text-[11px] text-white/80 mb-1">
          <span>الحد اليومي المستهلك</span>
          <span className="font-mono tabular-nums">{dailyLimitUsedPercent}%</span>
        </div>
        <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white/90 rounded-full transition-all duration-500"
            style={{ width: `${dailyLimitUsedPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
```
