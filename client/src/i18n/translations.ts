export type Language = 'ar' | 'en';

export const translations = {
  ar: {
    // Common / General
    common: {
      appName: 'الفا موبايل ERP',
      appSubtitle: 'نظام إدارة معامل الصيانة ونقاط البيع وقطع الغيار والمحافظ',
      save: 'حفظ التغييرات',
      saved: 'تم الحفظ بنجاح!',
      cancel: 'إلغاء',
      close: 'إغلاق',
      delete: 'حذف',
      clear: 'مسح',
      search: 'بحث...',
      status: 'الحالة',
      actions: 'إجراءات',
      hotkeys: 'الاختصارات:',
      currency: 'ج.م',
      total: 'الإجمالي:',
      subtotal: 'المجموع الفرعي:',
      discount: 'الخصم:',
      quantity: 'الكمية',
      customer: 'العميل',
      phone: 'الهاتف',
      notes: 'ملاحظات',
      date: 'التاريخ',
      yes: 'نعم',
      no: 'لا',
      refresh: 'تحديث البيانات',
      loading: 'جاري التحميل...',
      active: 'نشط',
      disabled: 'معطل',
      enabled: 'مفعل',
      print: 'طباعة الإيصال الحراري (ESC/POS)',
      copy: 'نسخ النص',
      copied: 'تم النسخ!',
      whatsappCustomer: 'إرسال للعميل عبر واتساب',
      sentToWa: 'تم الإرسال للواتساب!'
    },

    // Header & Navigation
    header: {
      shiftActive: 'الوردية نشطة',
      shiftClosed: 'لا توجد وردية مفتوحة',
      openFloat: 'عهدة الافتتاح:',
      language: 'اللغة',
      switchLang: 'English',
      userRole: 'المدير العام'
    },

    sidebar: {
      dashboardNav: 'لوحة القيادة والتحليلات',
      coreSection: 'العمليات الأساسية',
      alwaysOn: 'مفعل دائماً',
      crmNav: 'إدارة العملاء والواتساب',
      shiftNav: 'إغلاق الوردية وحساب العجز',
      activeModules: 'الموديولات المفعلة',
      repairNav: 'معمل الصيانة الفنية',
      posNav: 'نقاط البيع وتتبع السيريال',
      sparesNav: 'قطع الغيار والتوافق',
      fintechNav: 'المحافظ الإلكترونية والكاش',
      settingsNav: 'إعدادات المتجر والموديولات',
      sqliteMode: 'قاعدة بيانات SQLite المحلية'
    },

    // Settings View
    settings: {
      title: 'إعدادات النظام والموديولات المعيارية (Feature Flags)',
      subtitle: 'يمكن تفعيل أو تعطيل أي موديول حسب نشاط كل فرع. التغيير ينعكس فوراً على القائمة الجانبية ومسارات الـ API.',
      featureFlagsTitle: 'التحكم في الموديولات المعيارية لكل متجر',
      featureFlagsDesc: 'تفعيل أو إيقاف المحركات وفق نوع الفرع (معمل صيانة، محل تجزئة وإكسسوارات، توزيع جملة، أو مركز تحويل كاش).',
      apiGuarded: 'محمي بنظام الصلاحيات وحارس مسارات الـ API',

      repairTitle: 'موديول معمل الصيانة الفنية',
      repairDesc: 'استلام الأجهزة، قائمة الفحص الظاهري، مؤقتات SLA التنازلية، حساب عمولة الفني، مخزن التخريد، والتشخيص الذكي.',
      retailTitle: 'موديول نقاط البيع ومبيعات الهواتف',
      retailDesc: 'ماسح الباركود، نظام الدفع ثنائي الخطوات، التتبع الصارم لسيريال الهواتف (IMEI)، ورصد النواقص والبضاعة الراكدة.',
      sparesTitle: 'موديول توزيع قطع الغيار بالجملة',
      sparesDesc: 'تصنيف جودة الشاشات (OEM، Incell، OLED)، التسعير ثلاثي المستويات، مصفوفة التوافق التبادلي، وفحص المرتجعات RMA.',
      fintechTitle: 'موديول ماكينات ومحافظ الكاش',
      fintechDesc: 'أرصدة فودافون كاش وإنستاباي وفوري، قفل الأمان التنظيمي التلقائي عند 95%، ومنع الاحتيال في السحب، ومطابقة الكشوفات.',

      storeProfileTitle: 'هوية المتجر وتنسيق الفاتورة الحرارية (ESC/POS)',
      storeName: 'اسم المتجر / العلامة التجارية',
      storePhone: 'رقم خدمة العملاء والمبيعات',
      storeAddress: 'عنوان المتجر أو الفرع',
      receiptHeader: 'ترويسة الفاتورة الحرارية (80 مم)',
      receiptFooter: 'تذييل الفاتورة وشروط الضمان',
      googleReviewUrl: 'رابط تقييم خرائط جوجل (يرسل للعميل آلياً بعد 45 دقيقة)',

      staffTitle: 'إدارة الموظفين والصلاحيات (RBAC)',
      staffSubtitle: 'أدوار النظام: المدير العام، مدير الفرع، مهندس الصيانة، الكاشير، موظف المبيعات، موظف الاستقبال.',
      addStaff: '+ إضافة موظف جديد',
      fullName: 'الاسم بالكامل',
      username: 'اسم المستخدم',
      role: 'الدور / الصلاحية',
      commissionRate: 'نسبة عمولة الصيانة',
      profitShare: 'مشاركة أرباح',
      salaried: 'راتب ثابت (0%)',
      activeStatus: 'نشط'
    },

    // Shifts & Handover View
    shift: {
      title: 'إدارة الورديات والتسليم التتابعي (Cascading Handover)',
      subtitle: 'مطابقة نقدية درج الكاشير مع حركة المبيعات الفعلية. أي عجز يسجل فورياً كعهد ومسؤولية على الموظف المسلم.',
      refreshSummary: 'تحديث كشف النقدية المباشر',
      statusLabel: 'حالة الوردية:',
      openedBy: 'افتتحت بواسطة',
      atTime: 'في تمام',
      closeShiftBtn: 'إغلاق الوردية وبدء التسليم',
      acceptHandoverBtn: 'قبول استلام الوردية (الكاشير المستلم)',
      noOpenShiftTitle: 'لا توجد وردية مفتوحة حالياً',
      noOpenShiftDesc: 'قم ببدء الوردية وإدخال عهدة الافتتاح لبدء إصدار فواتير المبيعات واستلام أجهزة الصيانة وعمليات الكاش.',
      openShiftBtn: 'افتتاح وردية جديدة (إدخال عهدة الدرج)',

      openingCash: 'عهدة الافتتاح',
      cashSales: '+ مبيعات الكاش',
      repairCash: '+ تحصيل الصيانة',
      fintechIn: '+ إيداع المحافظ',
      fintechOut: '- سحب المحافظ',
      expectedCash: '= المتوقع بالدرج',

      deficitAlert: 'تنبيه: تم رصد عجز في درج النقدية بمقدار',
      balancedNotice: 'الدرج متطابق: النقدية المحصية تطابق الحسابات النظامية تماماً.',
      actualCounted: 'النقدية الفعلية بالدرج:',
      devicesInLab: 'أجهزة الصيانة بالمعمل:',
      handoverNotes: 'ملاحظات التسليم:',

      // Modal
      closeModalTitle: 'إغلاق الوردية وجرد النقدية والأجهزة',
      mandatoryActualCash: 'إلزامي: النقدية الفعلية الموجودة بالدرج (ج.م)',
      mandatoryDevices: 'عدد الأجهزة الفعلية داخل معمل الصيانة / الخزينة',
      handoverPlaceholder: 'أي ملاحظات خاصة بالتسليم أو فروق النقدية...',
      submitHandover: 'تأكيد التسليم',

      openModalTitle: 'إدخال عهدة افتتاح الوردية',
      openingFloatLabel: 'مبلغ العهدة النقدية الافتتاحي (ج.م)',
      startShift: 'بدء الوردية الآن',

      acceptModalTitle: 'مراجعة وتأكيد استلام الوردية',
      acceptVerifyText: 'بصفتك الموظف المستلم، يرجى التأكيد أنك قمت بعدّ وفحص النقدية والأجهزة فعلياً قبل الموافقة.',
      flagDispute: 'تسجيل اعتراض (يوجد خلاف في النقدية أو عدد الأجهزة)',
      disputeNotesPlaceholder: 'تفاصيل الخلاف أو النواقص...',
      confirmTakeover: 'تأكيد واستلام الوردية رسمياً'
    },

    // CRM View
    crm: {
      title: 'إدارة علاقات العملاء ومحرك رسائل الواتساب والتقييمات',
      subtitle: 'تصنيف سلوك العملاء، سجل المشتريات والصيانة، إرسال التحديثات، وجدولة طلبات تقييم خرائط جوجل.',
      profilesTab: 'سجل العملاء',
      whatsappTab: 'صندوق رسائل الواتساب',
      directWaBtn: 'إرسال واتساب مباشر',
      searchPlaceholder: 'بحث باسم العميل أو رقم الهاتف...',
      customerCol: 'العميل',
      phoneCol: 'رقم الهاتف',
      tagCol: 'التصنيف السلوكي',
      ltvCol: 'إجمالي التعاملات',
      actionsCol: 'إجراءات',
      vipTag: '⭐ عميل مميز (VIP)',
      regularTag: 'عميل عادي (Regular)',
      highReturnTag: '⚠️ مرتجع عالي / عميل حساس',
      problematicTag: '🚫 عميل مشاغب',
      totalSpend: 'إجمالي مدفوعات العميل:',
      historyTitle: 'سجل أجهزة الصيانة والمبيعات',
      noHistory: 'لا توجد فواتير أو تذاكر صيانة سابقة مسجلة.',
      ticketLabel: 'تذكرة صيانة #',
      invoiceLabel: 'فاتورة مبيعات #',
      waOutboxTitle: 'طابور رسائل الواتساب والتقييمات التلقائية',
      waOutboxDesc: 'محاكاة كاملة لـ WhatsApp Cloud API و Webhooks',
      recipientCol: 'المستلم',
      typeCol: 'نوع الرسالة',
      contentCol: 'نص الرسالة',
      statusCol: 'حالة الإرسال',
      timeCol: 'التوقيت'
    },

    // Repair Lab View
    repair: {
      title: 'معمل الصيانة والعمليات الفنية وإدارة الورشة',
      subtitle: 'مؤقتات اتفاقية مستوى الخدمة SLA، قوائم الفحص، احتساب عمولات الفنيين، وتخريد الأجهزة الميتة.',
      kanbanTab: 'لوحة الصيانة ومؤقتات SLA',
      scrapTab: 'مخزن التخريد واستخراج القطع',
      diagnosticsTab: 'المساعد التشخيصي وقاعدة الأعطال',
      newIntakeBtn: 'استلام جهاز جديد (المعالج)',
      searchPlaceholder: 'بحث برقم التذكرة، الموديل، السيريال/IMEI، العميل...',
      allStatuses: 'جميع الحالات',

      intakeStatus: 'استلام جديد (INTAKE)',
      diagnosingStatus: 'فحص وتشخيص (DIAGNOSING)',
      waitingStatus: 'في انتظار موافقة العميل',
      inRepairStatus: 'جاري الصيانة (IN REPAIR)',
      readyStatus: 'جاهز للاستلام (READY)',
      deliveredStatus: 'تم التسليم للعميل (DELIVERED)',

      priorityNormal: 'عادي (SLA 4 ساعات)',
      priorityUrgent: 'مستعجل (SLA ساعة واحدة)',
      priorityVip: 'عميل VIP (ساعتان)',

      customerLabel: 'العميل:',
      techLabel: 'الفني المسؤول:',
      defectsLabel: 'العطل / شكوى العميل:',
      passcodeLabel: 'رمز القفل:',
      patternLabel: 'النمط:',
      secretOtpLabel: 'كود الاستلام السري:',
      totalCostLabel: 'التكلفة الإجمالية:',
      techCommissionLabel: 'عمولة الفني:',
      verifyDeliverBtn: 'تحقق من كود OTP وسلّم الجهاز',
      printTagBtn: 'طباعة باركود الجهاز',

      // Wizard Modal
      wizardTitle: 'معالج استلام جهاز جديد وقائمة الفحص الظاهري',
      clientName: 'اسم العميل',
      clientPhone: 'رقم هاتف العميل (+20...)',
      brand: 'الشركة المصنعة',
      model: 'موديل الجهاز بالتحديد',
      imeiSn: 'رقم السيريال / IMEI',
      passcode: 'رمز القفل أو الباسكود',
      physicalCondition: 'الحالة الظاهرية (خدوش، صدمات، رطوبة)',
      reportedDefects: 'الأعطال والشكاوى بالتفصيل',
      checklistTitle: 'قائمة الفحص الظاهري السريع:',
      powerCheck: 'يعمل باور',
      screenCheck: 'الشاشة سليمة',
      touchCheck: 'اللمس يعمل',
      camerasCheck: 'الكاميرات',
      faceIdCheck: 'بصمة/FaceID',
      chargingCheck: 'منفذ الشحن',
      speakerCheck: 'السماعات والمايك',
      priority: 'أولوية الصيانة',
      estCost: 'التكلفة التقديرية (ج.م)',
      laborCharge: 'سعر المصنعية فقط (ج.م)',
      assignTech: 'تعيين مهندس الصيانة',
      confirmIntake: 'تأكيد الاستلام وطباعة الباركود والإيصال',

      // OTP Modal
      otpModalTitle: 'التحقق من كود الاستلام السري (Release OTP)',
      otpDesc: 'أدخل كود الـ OTP المكون من 4 أرقام المستلم على هاتف العميل لتأكيد تسليم الجهاز بأمان.',
      verifyBtn: 'تحقق وتسليم الجهاز',

      // Scrap Warehouse
      scrapTitle: 'محرك تخريد وتفكيك الأجهزة التالفة (مخزن السكراب)',
      scrapDesc: 'استخراج وتخزين قطع الغيار الأصلية الصالحة (شاشات، كاميرات، فلاتات، مواتير) بباركود منفصل لكل قطعة.',
      donorModel: 'الجهاز المتبرع',
      partName: 'اسم القطعة المستخرجة',
      conditionGrade: 'فئة الحالة الفنية',
      estValue: 'القيمة التقديرية',
      testedWorking: 'تم الاختبار ويعمل 100%',

      // AI Diagnostics
      aiTitle: 'المساعد التشخيصي الذكي لأعطال الهاردوير والبوردات',
      dcDrawLabel: 'سحب الباور سبلاي عند الستاندباي (DC Bench Power)',
      symptomsLabel: 'الأعراض المرئية وملاحظات الميكروسكوب',
      runAiBtn: 'بدء المسار التشخيصي الذكي',
      aiRecommendation: 'توصيات التشخيص ومسار التتبع:',
      hardwareDbTitle: 'قاعدة بيانات قراءات الملتيميتر (Diode Mode) والحلول الجاهزة'
    },

    // Retail POS View
    pos: {
      title: 'نقاط البيع ومبيعات الهواتف والإكسسوارات (تتبع السيريال الصارم)',
      subtitle: 'دعم كامل لقارئ الباركود، نظام الدفع ثنائي الخطوات، تتبع سيريال الهواتف، خزانة النواقص، وبضاعة الركود.',
      posTab: 'نقطة البيع (F1)',
      cashierQueueTab: 'طابور الكاشير المالي',
      agingTab: 'مخزون الركود (>60 يوم)',
      missingTab: 'خزانة النواقص (طلبات الزبائن)',
      scannerPlaceholder: 'امسح الباركود بجهاز المسح أو اكتب الاسم/الكود (اضغط F1)...',
      strictImeiBadge: 'يلزم سيريال IMEI',
      stockLabel: 'المتاح:',
      units: 'قطع',
      cartTitle: 'درج المبيعات ونقطة الدفع النشطة',
      clearCart: 'تفريغ السلة (Esc)',
      emptyCart: 'السلة فارغة. قم بمسح باركود أو اضغط على صنف للإضافة.',
      clientName: 'اسم المشتري',
      clientPhone: 'رقم هاتف المشتري',
      payMethod: 'طريقة الدفع',
      cashPay: 'نقداً (كاش)',
      cardPay: 'بطاقة بنكية (فيزا/ماستركارد)',
      walletPay: 'محفظة كاش (فودافون/إنستاباي)',
      draftSaleBtn: 'مسودة للكاشير (F3)',
      payPrintBtn: 'دفع وطباعة الفاتورة (F2)',

      // Strict IMEI Modal
      imeiModalTitle: 'إلزامية اختيار السيريال (Strict IMEI):',
      imeiModalDesc: 'أجهزة الهواتف المحمولة تتطلب إلزامياً تسجيل رقم السيريال الخاص بالجهاز من المخزون لأغراض الضمان ومنع السرقات.',
      selectInStockImei: 'اختر السيريال المتاح من المخزون:',
      confirmImeiBtn: 'تأكيد السيريال وإضافة للسلة',

      // Cashier Queue
      draftInvoiceCol: 'رقم المسودة',
      salespersonCol: 'موظف المبيعات',
      amountCol: 'المبلغ الإجمالي',
      acceptDraftBtn: 'تحصيل وطباعة الفاتورة',

      // Aging Stock
      agingTitle: 'مخزون الركود والأصناف عديمة الحركة (أكثر من 60 يوماً)',
      agingDesc: 'تحديد الإكسسوارات والقطع الراكدة التي لم تباع منذ فترة لجدولتها في عروض التصفية.',
      daysIdle: 'يوم ركود',

      // Missing Demand Log
      missingTitle: 'تسجيل طلبات الزبائن غير المتوفرة (خزانة النواقص)',
      missingDesc: 'تسجيل أي صنف يطلبه العميل وهو غير متوفر، مع عداد ذكي للتكرار لاقتراح أوامر الشراء تلقائياً.',
      requestedItem: 'اسم الصنف أو الموديل المطلوب',
      requestCount: 'مرات تكرار الطلب',
      generatePoBtn: 'إنشاء أمر شراء (PO)'
    },

    // Spare Parts Wholesale View
    spareParts: {
      title: 'تجارة وتوزيع قطع الغيار بالجملة ومصفوفة التوافق التبادلي',
      subtitle: 'تصنيف جودة الشاشات (OEM، Incell، OLED)، التسعير متعدد المستويات، ومحرك التوافق وسياسات المرتجعات.',
      catalogTab: 'القطع والتسعير ثلاثي المستويات',
      compatTab: 'مصفوفة التوافق التبادلي',
      rmaTab: 'المرتجعات ونسب عيوب الموردين',
      searchPlaceholder: 'بحث باسم القطعة، الموديل، كود الصنف، أو الهاتف المتوافق...',
      allGrades: 'جميع فئات الجودة',

      gradeServicePack: 'شاشات التوكيل الأصلية (Service Pack)',
      gradeOriginalPull: 'خلع أصلي من الأجهزة (Original Pull)',
      gradeOled: 'شاشات أوليد (OLED)',
      gradeIncell: 'شاشات إنسل الاقتصادية (Incell)',
      gradeRefurbished: 'مجدد باغة أصلية (Refurbished)',

      tier1Wholesale: 'المستوى 1: سعر الفنيين (جملة)',
      tier2Retail: 'المستوى 2: سعر العميل (قطاعي)',
      tier3Bulk: 'المستوى 3: كبار التجار (كميات)',
      compatCol: 'الأجهزة المتوافقة',

      compatMatrixTitle: 'محرك التوافق التبادلي بين موديلات الهواتف المختلفة',
      compatMatrixDesc: 'معرفة الشاشات والفلاتات والبطاريات التي تقبل التركيب على أكثر من موديل بدقة تامة.',
      targetModelCol: 'الهاتف المتوافق',
      compatNotesCol: 'ملاحظات التوافق والتركيب',

      rmaTitle: 'سياسات فحص المرتجعات (RMA) وتحليل عيوب الموردين',
      vendorDefectRates: 'نسب عيوب الموردين والمستوردين (استبعاد الموردين السيئين):',
      logRmaBtn: '+ تسجيل مطالبة مرتجع (RMA)',
      defectRateLabel: 'نسبة العيوب',
      securitySealCol: 'ختم الأمان والستيكر',
      solderTraceCol: 'آثار لحام حراري',
      defectReasonCol: 'سبب العيب',
      intactSeal: '✅ سليم وغير ممزق',
      voidSeal: '❌ تالف / لاغي للضمان',
      solderDetected: '⚠️ تم رصد لحام (مرفوض)',
      solderClean: 'نظيف بدون لحام',
      approveRma: 'قبول وتعويض',
      rejectRma: 'رفض المرتجع'
    },

    // Fintech View
    fintech: {
      title: 'المحافظ الإلكترونية وماكينات الكاش (فودافون كاش / إنستاباي / فوري)',
      subtitle: 'مراقبة حية للأرصدة، القفل التنظيمي التلقائي عند 95% لمنع المخالفات، ومنع الاحتيال في السحب النقدي.',
      walletsTab: 'المحافظ وحدود السحب',
      historyTab: 'سجل العمليات والتحويلات',
      reconcileTab: 'مطابقة كشوفات الشبكات',
      refreshBalances: 'تحديث الأرصدة',

      lockedBadge: 'مقفل تلقائياً (تجاوز 95%)',
      activeBadge: 'محفظة نشطة',
      currentBalance: 'الرصيد الإلكتروني الحالي:',
      dailyCap: 'الحد اليومي:',
      monthlyCap: 'الحد الشهري:',
      supervisorUnlock: 'إلغاء القفل بتدخل المشرف',
      executeTxBtn: 'تنفيذ معاملة كاش',

      amlTitle: 'مراقبة الأرقام المتكررة والامتثال المالي لمكافحة غسيل الأموال (AML)',
      amlDesc: 'رصد الأرقام التي تنفذ معاملات متكررة أو أحجام سحب كاش مرتفعة لتجنب المساءلة القانونية.',
      txCount: 'معاملات',
      cumulativeVol: 'إجمالي الحركات:',

      // Modal
      txModalTitle: 'تنفيذ معاملة عبر محفظة',
      cashOutType: 'سحب كاش (Cash-Out)',
      cashInType: 'إيداع كاش (Cash-In)',
      txAmount: 'مبلغ المعاملة (ج.م)',
      commissionEarned: 'العمولة المحصلة من العميل (ج.م)',
      antiFraudTitle: 'إلزامية الحماية التنظيمية ومنع الاحتيال:',
      clientPhoneLabel: 'رقم هاتف العميل المحول منه/إليه (إلزامي)',
      carrierTxIdLabel: 'رقم العملية المرجعي من رسالة الشبكة TxID (إلزامي)',
      nationalIdLabel: 'الرقم القومي (إلزامي للعمليات أكبر من 5,000 ج.م)',
      authorizeTx: 'تأكيد وإتمام المعاملة',

      // Reconcile
      reconcileTitle: 'أداة المطابقة السريعة لكشوفات الحسابات الإلكترونية',
      reconcileDesc: 'قم بلصق كشف حساب الشبكة بصيغة: رقم العملية، المبلغ (TxID, Amount) للمطابقة الفورية.',
      reconcileBtn: 'مطابقة الكشف مع معاملات النظام',
      processedLabel: 'إجمالي المفحوص:',
      matchedLabel: 'متطابق بنجاح:',
      unmatchedLabel: 'غير موجود بالنظام:'
    }
  },

  en: {
    // Common / General
    common: {
      appName: 'Alpha Mobile ERP',
      appSubtitle: 'Modular Mobile Phone Repair Lab, POS, Spare Parts & Fintech System',
      save: 'Save Changes',
      saved: 'Saved Successfully!',
      cancel: 'Cancel',
      close: 'Close',
      delete: 'Delete',
      clear: 'Clear',
      search: 'Search...',
      status: 'Status',
      actions: 'Actions',
      hotkeys: 'Hotkeys:',
      currency: 'EGP',
      total: 'Total Due:',
      subtotal: 'Subtotal:',
      discount: 'Discount:',
      quantity: 'Quantity',
      customer: 'Customer',
      phone: 'Phone',
      notes: 'Notes',
      date: 'Date',
      yes: 'Yes',
      no: 'No',
      refresh: 'Refresh Ledger',
      loading: 'Loading...',
      active: 'Active',
      disabled: 'Disabled',
      enabled: 'Enabled',
      print: 'Print ESC/POS Thermal Receipt',
      copy: 'Copy Text',
      copied: 'Copied!',
      whatsappCustomer: 'WhatsApp Customer',
      sentToWa: 'Sent to WhatsApp!'
    },

    // Header & Navigation
    header: {
      shiftActive: 'Shift Active',
      shiftClosed: 'No Open Shift',
      openFloat: 'Open Float:',
      language: 'Language',
      switchLang: 'العربية',
      userRole: 'SuperAdmin'
    },

    sidebar: {
      dashboardNav: 'Dashboard & Analytics',
      coreSection: 'Core Operations',
      alwaysOn: 'Always On',
      crmNav: 'CRM & WhatsApp Engine',
      shiftNav: 'Shift Handover & Cash',
      activeModules: 'Active Modules',
      repairNav: 'Repair Lab & Technical',
      posNav: 'Retail & POS (IMEI)',
      sparesNav: 'Spare Parts Wholesale',
      fintechNav: 'E-Wallets & Fintech',
      settingsNav: 'Store Onboarding & Flags',
      sqliteMode: 'Local SQLite WAL Database'
    },

    // Settings View
    settings: {
      title: 'Store Onboarding & Modular Engine Settings',
      subtitle: 'Toggle modules dynamically. Activated modules appear instantly in the sidebar and enable corresponding API endpoints.',
      featureFlagsTitle: 'Independent Feature Flags per Store',
      featureFlagsDesc: 'Activate or deactivate ERP engines based on store branch type (Repair Workshop, Retail Store, Wholesale Distributor, or E-Wallet Center).',
      apiGuarded: 'Dynamic RBAC & API Router Guarded',

      repairTitle: 'Repair Lab Module',
      repairDesc: 'Device intake checklist, countdown SLA timers (Red/Yellow/Green), dynamic tech commissions, scrap harvesting, and AI diagnostic guide.',
      retailTitle: 'Retail POS & Accessories',
      retailDesc: 'High-speed barcode scanner checkout, 2-step cashier queue, strict IMEI serial tracking, aging dead stock alerts, and Missing Demand Log.',
      sparesTitle: 'Spare Parts Wholesale',
      sparesDesc: 'Multi-tier quality matrix (OEM Service Pack, Refurbished, OLED, Incell), 3-tier pricing, cross-model engine, and RMA testing.',
      fintechTitle: 'E-Wallets & Fintech',
      fintechDesc: 'Vodafone Cash / InstaPay / Fawry tracking, 95% regulatory cap warning & auto-lock, strict Cash-Out fraud checks, and statement reconciliation.',

      storeProfileTitle: 'Store Identity & ESC/POS Thermal Receipt Layout',
      storeName: 'Store / Brand Name',
      storePhone: 'Customer Care Phone',
      storeAddress: 'Physical Address',
      receiptHeader: 'Thermal Receipt Header (80mm Monospace)',
      receiptFooter: 'Thermal Receipt Footer / Disclaimer',
      googleReviewUrl: 'Google Maps Review URL (Dispatched 45m Post-Transaction)',

      staffTitle: 'Staff Management & Role-Based Access Control (RBAC)',
      staffSubtitle: 'Roles: SuperAdmin, Manager, Cashier, Salesperson, Receptionist, MaintenanceEngineer (with individual commission rate).',
      addStaff: '+ Add Staff Member',
      fullName: 'Full Name',
      username: 'Username',
      role: 'Role',
      commissionRate: 'Repair Commission Rate',
      profitShare: 'Profit Share',
      salaried: 'Salaried (0%)',
      activeStatus: 'Active'
    },

    // Shifts & Handover View
    shift: {
      title: 'Shift Management & Cascading Handover',
      subtitle: 'Reconcile physical cash drawer with live transactions. Any missing balance registers an immediate deficit audit record against the closing user.',
      refreshSummary: 'Refresh Live Ledger',
      statusLabel: 'Shift Status:',
      openedBy: 'Opened by',
      atTime: 'at',
      closeShiftBtn: 'Close Shift & Initiate Handover',
      acceptHandoverBtn: 'Accept Shift Handover (Next Cashier)',
      noOpenShiftTitle: 'No Open Shift Currently Active',
      noOpenShiftDesc: 'Start your shift by entering the opening cash drawer float to begin processing POS sales, repair intakes, and fintech operations.',
      openShiftBtn: 'Start New Shift (Open Drawer)',

      openingCash: 'Opening Float',
      cashSales: '+ Cash Sales',
      repairCash: '+ Repair Cash',
      fintechIn: '+ Fintech Cash-In',
      fintechOut: '- Fintech Cash-Out',
      expectedCash: '= Expected in Drawer',

      deficitAlert: 'CASH DEFICIT DETECTED: Missing amount of',
      balancedNotice: 'DRAWER BALANCED: Handover matches expected calculation.',
      actualCounted: 'Actual Cash in Drawer:',
      devicesInLab: 'Devices in Workshop Safe:',
      handoverNotes: 'Handover Notes:',

      // Modal
      closeModalTitle: 'Close Shift & Count Drawer',
      mandatoryActualCash: 'Mandatory: Actual Cash Counted in Drawer (EGP)',
      mandatoryDevices: 'Counted Physical Devices in Lab / Safe',
      handoverPlaceholder: 'e.g. 50 EGP short change returned to customer...',
      submitHandover: 'Submit Handover',

      openModalTitle: 'Open Shift Cash Float',
      openingFloatLabel: 'Opening Cash Float (EGP)',
      startShift: 'Start Shift',

      acceptModalTitle: 'Accept Shift Handover',
      acceptVerifyText: 'As the incoming user, please verify that you have physically counted the cash and devices before confirming.',
      flagDispute: 'Flag as Disputed (Discrepancy in physical count)',
      disputeNotesPlaceholder: 'Explain discrepancy details...',
      confirmTakeover: 'Confirm & Take Over Shift'
    },

    // CRM View
    crm: {
      title: 'Customer CRM & WhatsApp Automation Engine',
      subtitle: 'VIP and High-Return behavior classification, purchase ledger, WhatsApp milestone updates, and automated Google Review dispatch.',
      profilesTab: 'Profiles Ledger',
      whatsappTab: 'WhatsApp Outbox',
      directWaBtn: 'Direct WhatsApp',
      searchPlaceholder: 'Search by customer name or phone...',
      customerCol: 'Customer',
      phoneCol: 'Phone',
      tagCol: 'Classification Tag',
      ltvCol: 'Lifetime Value',
      actionsCol: 'Actions',
      vipTag: '⭐ VIP Client',
      regularTag: 'Regular',
      highReturnTag: '⚠️ High-Return / Sensitive',
      problematicTag: '🚫 Problematic',
      totalSpend: 'Total Customer Spend:',
      historyTitle: 'Repair & POS History',
      noHistory: 'No previous tickets or sales recorded.',
      ticketLabel: 'Ticket #',
      invoiceLabel: 'Invoice #',
      waOutboxTitle: 'WhatsApp Message Dispatch Queue & Review Follow-ups',
      waOutboxDesc: 'Real-time webhook and cloud API simulation',
      recipientCol: 'Phone',
      typeCol: 'Type',
      contentCol: 'Message Content',
      statusCol: 'Status',
      timeCol: 'Timestamp'
    },

    // Repair Lab View
    repair: {
      title: 'Repair Lab & Technical Operations',
      subtitle: 'Dynamic countdown SLA timers, physical checklists, tech commission engine, salvage scrap warehouse, and AI diagnostics.',
      kanbanTab: 'Kanban & SLA Timers',
      scrapTab: 'Scrap Warehouse',
      diagnosticsTab: 'AI Diagnostics KB',
      newIntakeBtn: 'New Device Intake (Wizard)',
      searchPlaceholder: 'Search ticket #, model, IMEI, customer, phone...',
      allStatuses: 'All Statuses',

      intakeStatus: 'INTAKE',
      diagnosingStatus: 'DIAGNOSING',
      waitingStatus: 'WAITING APPROVAL',
      inRepairStatus: 'IN REPAIR',
      readyStatus: 'READY FOR PICKUP',
      deliveredStatus: 'DELIVERED',

      priorityNormal: 'NORMAL (4 hrs SLA)',
      priorityUrgent: 'URGENT (1 hr SLA)',
      priorityVip: 'VIP (2 hrs SLA)',

      customerLabel: 'Customer:',
      techLabel: 'Assigned Tech:',
      defectsLabel: 'Defect / Symptom:',
      passcodeLabel: 'Pass:',
      patternLabel: 'Pattern:',
      secretOtpLabel: 'Release OTP:',
      totalCostLabel: 'Total Cost:',
      techCommissionLabel: 'Tech Comm:',
      verifyDeliverBtn: 'Verify OTP & Deliver',
      printTagBtn: 'Print Barcode Tag',

      // Wizard Modal
      wizardTitle: 'Device Intake Wizard & Physical Checklist',
      clientName: 'Customer Name',
      clientPhone: 'Customer Mobile (+20...)',
      brand: 'Device Brand',
      model: 'Device Model',
      imeiSn: 'IMEI / Serial Number',
      passcode: 'Passcode / PIN',
      physicalCondition: 'Physical Condition (dents, scratches, water)',
      reportedDefects: 'Reported Faults & Client Complaints',
      checklistTitle: 'Intake Physical Checklist:',
      powerCheck: 'Powers On',
      screenCheck: 'Display Screen',
      touchCheck: 'Touch Digitizer',
      camerasCheck: 'Cameras',
      faceIdCheck: 'FaceID / Fingerprint',
      chargingCheck: 'Charging Port',
      speakerCheck: 'Speakers & Mic',
      priority: 'Priority',
      estCost: 'Est. Total Cost (EGP)',
      laborCharge: 'Labor Charge Only (EGP)',
      assignTech: 'Assign Technician',
      confirmIntake: 'Confirm Intake & Print Barcode',

      // OTP Modal
      otpModalTitle: 'OTP Release Verification',
      otpDesc: 'Verify customer 4-digit SMS/WhatsApp OTP code to hand over device safely.',
      verifyBtn: 'Verify & Deliver',

      // Scrap Warehouse
      scrapTitle: 'Salvage & Disassembly Engine (Scrap Warehouse)',
      scrapDesc: 'Harvest genuine OEM parts (cameras, flex cables, screens, vibra motors) from dead donor motherboards with unique barcode labels.',
      donorModel: 'Donor Device Model',
      partName: 'Harvested Part Name',
      conditionGrade: 'Condition Grade',
      estValue: 'Est. Value',
      testedWorking: 'Tested Working 100%',

      // AI Diagnostics
      aiTitle: 'AI Board Diagnostic Guide',
      dcDrawLabel: 'DC Bench Power Supply Standby Draw',
      symptomsLabel: 'Observed Symptoms / Microscope findings',
      runAiBtn: 'Run AI Diagnostic Path',
      aiRecommendation: 'AI Diagnostic Recommendation:',
      hardwareDbTitle: 'Hardware Diode Readings & Known Solutions Repository'
    },

    // Retail POS View
    pos: {
      title: 'Retail POS, Accessories & Strict IMEI Engine',
      subtitle: 'USB Barcode scanner input, two-step checkout option (Sales draft -> Cashier complete), IMEI enforcement, and Aging stock alerts.',
      posTab: 'Point of Sale (F1)',
      cashierQueueTab: 'Cashier Queue',
      agingTab: 'Aging / Dead Stock',
      missingTab: 'Missing Demand Log',
      scannerPlaceholder: 'Scan USB Barcode gun or type SKU / Name (Press F1)...',
      strictImeiBadge: 'STRICT IMEI',
      stockLabel: 'Stock:',
      units: 'units',
      cartTitle: 'Active POS Register Cart',
      clearCart: 'Clear (Esc)',
      emptyCart: 'Cart is empty. Scan barcode or click an item to add.',
      clientName: 'Customer Name',
      clientPhone: 'Customer Mobile',
      payMethod: 'Payment Method',
      cashPay: 'Cash',
      cardPay: 'Credit / Debit Card',
      walletPay: 'E-Wallet (Vodafone/InstaPay)',
      draftSaleBtn: 'Draft Sale (F3)',
      payPrintBtn: 'Pay & Print (F2)',

      // Strict IMEI Modal
      imeiModalTitle: 'Strict IMEI Selection:',
      imeiModalDesc: 'Mobile phones require capturing the exact serial/IMEI for warranty and legal anti-theft tracking.',
      selectInStockImei: 'Select In-Stock IMEI:',
      confirmImeiBtn: 'Confirm IMEI & Add to Cart',

      // Cashier Queue
      draftInvoiceCol: 'Draft Invoice',
      salespersonCol: 'Salesperson',
      amountCol: 'Total Amount',
      acceptDraftBtn: 'Accept Payment & Print',

      // Aging Stock
      agingTitle: 'Aging Inventory & Dead Stock Tracker (>60 Days Zero Movement)',
      agingDesc: 'Identifies slow-moving phone accessories and parts to schedule bundle promotions and inventory clearance.',
      daysIdle: 'Days Idle',

      // Missing Demand Log
      missingTitle: 'Log Customer Demand (Out of Stock)',
      missingDesc: 'Record requests for items currently out of stock. Automatic frequency counter generates Purchase Order recommendations.',
      requestedItem: 'Item Requested / Model',
      requestCount: 'Demand Count',
      generatePoBtn: 'Generate PO'
    },

    // Spare Parts Wholesale View
    spareParts: {
      title: 'Spare Parts Wholesale & Cross-Model Compatibility',
      subtitle: 'Multi-tier quality grading (OEM Service Pack, Refurbished, OLED, Incell), 3-tier wholesale pricing, and strict RMA security checks.',
      catalogTab: 'Parts & 3-Tier Prices',
      compatTab: 'Compatibility Matrix',
      rmaTab: 'RMA & Vendor Defect Rates',
      searchPlaceholder: 'Search spare parts by name, model, SKU, or compatible phone...',
      allGrades: 'All Quality Grades',

      gradeServicePack: 'Service Pack OEM',
      gradeOriginalPull: 'Original Pull',
      gradeOled: 'OLED Hard/Soft',
      gradeIncell: 'Incell Budget',
      gradeRefurbished: 'Refurbished',

      tier1Wholesale: 'Tier 1: Tech Wholesale',
      tier2Retail: 'Tier 2: End-User Retail',
      tier3Bulk: 'Tier 3: Regional Bulk',
      compatCol: 'Compatibility',

      compatMatrixTitle: 'Cross-Model Interchangeability Matrix',
      compatMatrixDesc: 'Quickly locate which screens, batteries, or camera modules work across multiple smartphone generations.',
      targetModelCol: 'Compatible Target Device',
      compatNotesCol: 'Interchangeability Notes',

      rmaTitle: 'RMA Testing Policies & Vendor Defect Analytics',
      vendorDefectRates: 'Vendor Defect Rate Analytics (Filtering Low-Quality Importers):',
      logRmaBtn: '+ Log RMA Claim',
      defectRateLabel: 'Defect Rate',
      securitySealCol: 'Security Sticker',
      solderTraceCol: 'Solder Traces',
      defectReasonCol: 'Defect Reason',
      intactSeal: '✅ Intact',
      voidSeal: '❌ Void / Broken',
      solderDetected: '⚠️ Solder Detected',
      solderClean: 'Clean',
      approveRma: 'Approve',
      rejectRma: 'Reject'
    },

    // Fintech View
    fintech: {
      title: 'E-Wallets & Fintech Services (Vodafone / InstaPay / Fawry)',
      subtitle: 'Real-time balance monitoring, regulatory limits (>95% auto-locking), anti-fraud cash-out enforcement, and statement reconciliation.',
      walletsTab: 'Wallets & Limits',
      historyTab: 'Audit Log',
      reconcileTab: 'Statement Reconciliation',
      refreshBalances: 'Refresh Balances',

      lockedBadge: 'LOCKED (95% LIMIT)',
      activeBadge: 'ACTIVE',
      currentBalance: 'Current E-Balance:',
      dailyCap: 'Daily Cap:',
      monthlyCap: 'Monthly Cap:',
      supervisorUnlock: 'Supervisor Override Unlock',
      executeTxBtn: 'Execute Transaction',

      amlTitle: 'High Frequency Numbers & AML Compliance Monitoring',
      amlDesc: 'Numbers that conduct multiple transactions or high cumulative volumes in short intervals.',
      txCount: 'txs',
      cumulativeVol: 'Cumulative Volume:',

      // Modal
      txModalTitle: 'Execute Transaction for',
      cashOutType: 'Cash-Out',
      cashInType: 'Cash-In',
      txAmount: 'Amount (EGP)',
      commissionEarned: 'Commission Earned (EGP)',
      antiFraudTitle: 'Strict Anti-Fraud & Regulatory Capture:',
      clientPhoneLabel: 'Sender / Receiver Phone (Mandatory)',
      carrierTxIdLabel: 'Carrier Reference TxID (Mandatory)',
      nationalIdLabel: 'National ID (Mandatory for >5,000 EGP)',
      authorizeTx: 'Authorize Transaction',

      // Reconcile
      reconcileTitle: 'Telecom Statement Fast Reconciliation Tool',
      reconcileDesc: 'Paste CSV or list of carrier online statements in format: TransactionID, Amount for instant matching.',
      reconcileBtn: 'Reconcile Against ERP Transactions',
      processedLabel: 'Processed:',
      matchedLabel: 'Matched:',
      unmatchedLabel: 'Missing in ERP:'
    }
  }
};
