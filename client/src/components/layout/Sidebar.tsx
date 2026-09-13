import React, { useState, useEffect } from 'react';
import { Store } from '../../types/erp';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  Store as StoreIcon,
  LayoutDashboard,
  Wrench,
  Smartphone,
  Users,
  Truck,
  Package,
  ShoppingCart,
  Layers,
  ShoppingBag,
  BarChart3,
  Wallet,
  Clock,
  Sparkles,
  Settings,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  ShieldCheck,
  Cpu,
  AlertTriangle,
  Palette,
  Award,
  Calendar,
  FolderKanban,
  Building2,
  RotateCcw,
  Warehouse,
  ClipboardList,
  DollarSign,
  Undo2,
  AlertCircle,
  MessageSquare,
  QrCode,
  CreditCard,
  PackageCheck,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Receipt,
  BookOpen,
  Scale,
  UserCheck
} from 'lucide-react';

interface SidebarProps {
  store: Store | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface SubMenuItem {
  id: string;
  labelAr: string;
  labelEn: string;
  targetTab: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

interface SectionMenuItem {
  key: string;
  labelAr: string;
  labelEn: string;
  primaryTab: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  visible?: boolean;
  subItems?: SubMenuItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ store, activeTab, onTabChange }) => {
  const { dir, language, t } = useLanguage();
  const isAr = language === 'ar';
  const auth = useAuth();

  // State to track expanded accordions
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    repairs: true, // Default open matching Image 2
    pos: false,
    inventory: false,
    crm: false,
    suppliers: false,
    procurement: false,
    reports: false,
    finance: false
  });

  // Automatically expand section if activeTab is inside it
  useEffect(() => {
    const tabToSectionMap: Record<string, string> = {
      repair: 'repairs',
      appointments: 'repairs',
      pos: 'pos',
      'spare-parts': 'inventory',
      warehouses: 'inventory',
      crm: 'crm',
      procurement: 'procurement',
      reports: 'reports',
      fintech: 'finance',
      accounting: 'finance'
    };

    const sectionKey = tabToSectionMap[activeTab];
    if (sectionKey) {
      setOpenSections(prev => ({
        ...prev,
        [sectionKey]: true
      }));
    }
  }, [activeTab]);

  const toggleSection = (key: string, primaryTab?: string) => {
    setOpenSections(prev => {
      const willOpen = !prev[key];
      // If opening and primary tab is provided, also navigate there if not already on a related tab
      if (willOpen && primaryTab && activeTab !== primaryTab) {
        onTabChange(primaryTab);
      }
      return { ...prev, [key]: willOpen };
    });
  };

  const showRepair = store ? Boolean(store.enable_repair) : true;
  const showRetail = store ? Boolean(store.enable_retail) : true;
  const showSpares = store ? Boolean(store.enable_spare_parts) : true;
  const showFintech = store ? Boolean(store.enable_fintech) : true;

  // Hierarchical Structure Matching Image 2
  const menuSections: SectionMenuItem[] = [
    // 1. الرئيسية (لوحة القيادة)
    {
      key: 'dashboard',
      labelAr: 'الرئيسية',
      labelEn: 'Dashboard',
      primaryTab: 'dashboard',
      icon: LayoutDashboard,
      iconColor: 'text-sky-400'
    },

    // 2. الإصلاحات (الصيانة الفنية) - Accordion
    {
      key: 'repairs',
      labelAr: 'الإصلاحات',
      labelEn: 'Repairs & Lab',
      primaryTab: 'repair',
      icon: Wrench,
      iconColor: 'text-sky-400',
      badge: 'SLA',
      badgeColor: 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
      visible: showRepair,
      subItems: [
        {
          id: 'repairs-board',
          labelAr: 'الإصلاحات (تذاكر الصيانة)',
          labelEn: 'Repair Tickets',
          targetTab: 'repair',
          icon: Wrench
        },
        {
          id: 'repairs-intake',
          labelAr: 'استلام جهاز وفحص أولي',
          labelEn: 'Intake & Diagnostics',
          targetTab: 'repair',
          icon: Plus
        },
        {
          id: 'repairs-invoices',
          labelAr: 'فواتير مجمعة ومطالبات الضمان',
          labelEn: 'Batch Invoices & Warranty',
          targetTab: 'repair',
          icon: FileText
        },
        {
          id: 'repairs-spare-report',
          labelAr: 'تقرير قطع الغيار والمحجوز',
          labelEn: 'Parts Consumption Report',
          targetTab: 'spare-parts',
          icon: Cpu
        },
        {
          id: 'repairs-scrap',
          labelAr: 'القطع المعلقة والتالف (Defective Scrap)',
          labelEn: 'Defective Scrap & Scraps',
          targetTab: 'repair',
          icon: AlertTriangle
        },
        {
          id: 'repairs-device-attr',
          labelAr: 'إدارة ألوان وبيانات الأجهزة',
          labelEn: 'Device Attributes & Colors',
          targetTab: 'repair',
          icon: Palette
        },
        {
          id: 'repairs-technicians',
          labelAr: 'الفنيين وتقييم العمولات',
          labelEn: 'Technicians & Commissions',
          targetTab: 'repair',
          icon: UserCheck
        },
        {
          id: 'repairs-appointments',
          labelAr: 'تقييم الصيانة وحجز المواعيد',
          labelEn: 'Appointments & Feedback',
          targetTab: 'appointments',
          icon: Calendar
        }
      ]
    },

    // 3. شراء - بيع الأجهزة (الاستبدال Trade-In)
    {
      key: 'trade-in',
      labelAr: 'شراء - بيع الأجهزة',
      labelEn: 'Trade-In & Used Devices',
      primaryTab: 'pos',
      icon: Smartphone,
      iconColor: 'text-emerald-400',
      badge: 'Trade-In',
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      visible: showRetail
    },

    // 4. العملاء (CRM والولاء) - Accordion
    {
      key: 'crm',
      labelAr: 'العملاء',
      labelEn: 'Customers & CRM',
      primaryTab: 'crm',
      icon: Users,
      iconColor: 'text-indigo-400',
      badge: 'CRM',
      badgeColor: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
      subItems: [
        {
          id: 'crm-list',
          labelAr: 'قاعدة بيانات العملاء وسجل المعاملات',
          labelEn: 'Customer Directory',
          targetTab: 'crm',
          icon: Users
        },
        {
          id: 'crm-whatsapp',
          labelAr: 'تنبيهات ورسائل الواتساب',
          labelEn: 'WhatsApp Notifications',
          targetTab: 'crm',
          icon: MessageSquare
        },
        {
          id: 'crm-portal',
          labelAr: 'بوابة تتبع الصيانة للعميل',
          labelEn: 'Customer Tracking Portal',
          targetTab: 'crm',
          icon: QrCode
        },
        {
          id: 'crm-loyalty',
          labelAr: 'برنامج الولاء والشرائح',
          labelEn: 'Loyalty Tiers & Rewards',
          targetTab: 'crm',
          icon: Award
        },
        {
          id: 'crm-credit',
          labelAr: 'ائتمان العملاء والمديونيات',
          labelEn: 'Customer Credit & Ledger',
          targetTab: 'fintech',
          icon: CreditCard
        }
      ]
    },

    // 5. الموردين (Suppliers) - Accordion
    {
      key: 'suppliers',
      labelAr: 'الموردين',
      labelEn: 'Suppliers & Vendors',
      primaryTab: 'procurement',
      icon: Truck,
      iconColor: 'text-blue-400',
      badge: 'Vendors',
      badgeColor: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
      subItems: [
        {
          id: 'suppliers-directory',
          labelAr: 'سجل الموردين وتقييم الأداء',
          labelEn: 'Supplier Scorecards',
          targetTab: 'procurement',
          icon: Building2
        },
        {
          id: 'suppliers-quotes',
          labelAr: 'مقارنة عروض الأسعار والتكاليف',
          labelEn: 'Price Quotations Matrix',
          targetTab: 'procurement',
          icon: TrendingDown
        },
        {
          id: 'suppliers-rtv',
          labelAr: 'مرتجع الموردين والضمان (RTV / RMA)',
          labelEn: 'Return to Vendor (RTV)',
          targetTab: 'spare-parts',
          icon: RotateCcw
        }
      ]
    },

    // 6. المخزون (Inventory & Warehouses) - Accordion
    {
      key: 'inventory',
      labelAr: 'المخزون',
      labelEn: 'Inventory & Warehouses',
      primaryTab: 'spare-parts',
      icon: Package,
      iconColor: 'text-purple-400',
      badge: 'Stock',
      badgeColor: 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
      visible: showSpares,
      subItems: [
        {
          id: 'inv-parts',
          labelAr: 'قائمة الأصناف وقطع الغيار',
          labelEn: 'Items & Spare Parts Catalog',
          targetTab: 'spare-parts',
          icon: Cpu
        },
        {
          id: 'inv-warehouses',
          labelAr: 'المستودعات والتحويلات المخزنية',
          labelEn: 'Warehouses & Stock Transfers',
          targetTab: 'warehouses',
          icon: Warehouse
        },
        {
          id: 'inv-cycles',
          labelAr: 'الجرد الدوري وتجميد الأرصدة',
          labelEn: 'Cycle Counting & Freeze',
          targetTab: 'warehouses',
          icon: ClipboardList
        },
        {
          id: 'inv-deadstock',
          labelAr: 'مصفوفة التوافق والتصريف (Dead Stock)',
          labelEn: 'Compatibility & Dead Stock',
          targetTab: 'spare-parts',
          icon: Layers
        },
        {
          id: 'inv-valuation',
          labelAr: 'التقييم المخزني (FIFO / WAC)',
          labelEn: 'Inventory Valuation',
          targetTab: 'warehouses',
          icon: DollarSign
        }
      ]
    },

    // 7. نقطة البيع (POS & Cashier) - Accordion
    {
      key: 'pos',
      labelAr: 'نقطة البيع',
      labelEn: 'Point of Sale (POS)',
      primaryTab: 'pos',
      icon: ShoppingCart,
      iconColor: 'text-emerald-400',
      badge: 'F1',
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      visible: showRetail,
      subItems: [
        {
          id: 'pos-cashier',
          labelAr: 'شاشة البيع السريع والكاشير',
          labelEn: 'Fast Checkout Screen',
          targetTab: 'pos',
          icon: ShoppingCart
        },
        {
          id: 'pos-drafts',
          labelAr: 'فواتير المبيعات والمعلقات (Drafts)',
          labelEn: 'Sales Invoices & Drafts',
          targetTab: 'pos',
          icon: FileText
        },
        {
          id: 'pos-returns',
          labelAr: 'المرتجعات وفحص الأجهزة',
          labelEn: 'Returns & Inspections',
          targetTab: 'pos',
          icon: Undo2
        },
        {
          id: 'pos-aging',
          labelAr: 'أعمار ديون التقسيط والتحصيل',
          labelEn: 'Installment Collections & Aging',
          targetTab: 'pos',
          icon: Clock
        },
        {
          id: 'pos-demands',
          labelAr: 'النواقص وطلبات العملاء',
          labelEn: 'Missing Demand Requests',
          targetTab: 'pos',
          icon: AlertCircle
        }
      ]
    },

    // 8. المبيعات الخارجية (Omnichannel Hub)
    {
      key: 'omnichannel',
      labelAr: 'المبيعات الخارجية',
      labelEn: 'Omnichannel Sales',
      primaryTab: 'omnichannel-hub',
      icon: Layers,
      iconColor: 'text-emerald-400',
      badge: 'v3',
      badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
    },

    // 9. المشتريات (Procurement) - Accordion
    {
      key: 'procurement',
      labelAr: 'المشتريات',
      labelEn: 'Procurement & PO',
      primaryTab: 'procurement',
      icon: ShoppingBag,
      iconColor: 'text-blue-400',
      badge: 'PO',
      badgeColor: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
      subItems: [
        {
          id: 'proc-orders',
          labelAr: 'أوامر وطلبات الشراء (PO)',
          labelEn: 'Purchase Requisitions',
          targetTab: 'procurement',
          icon: FileCheck
        },
        {
          id: 'proc-grn',
          labelAr: 'استلام البضائع وفحص الوارد (GRN)',
          labelEn: 'Goods Receipt Notes (GRN)',
          targetTab: 'procurement',
          icon: PackageCheck
        },
        {
          id: 'proc-pending',
          labelAr: 'متابعة التوريدات المعلقة',
          labelEn: 'Pending Deliveries Tracking',
          targetTab: 'procurement',
          icon: Clock
        }
      ]
    },

    // 10. التقارير (Reports & Analytics) - Accordion
    {
      key: 'reports',
      labelAr: 'التقارير',
      labelEn: 'Reports & Analytics',
      primaryTab: 'reports',
      icon: BarChart3,
      iconColor: 'text-indigo-400',
      badge: 'BI',
      badgeColor: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
      subItems: [
        {
          id: 'rep-overview',
          labelAr: 'لوحة التقارير الشاملة',
          labelEn: 'Comprehensive BI Dashboard',
          targetTab: 'reports',
          icon: BarChart3
        },
        {
          id: 'rep-tech-profit',
          labelAr: 'أرباح الصيانة وإنتاجية الفنيين',
          labelEn: 'Technician Quality & Profit',
          targetTab: 'reports',
          icon: Award
        },
        {
          id: 'rep-cogs',
          labelAr: 'حركة المبيعات وتكلفة البضاعة (COGS)',
          labelEn: 'Sales Performance & COGS',
          targetTab: 'reports',
          icon: TrendingUp
        },
        {
          id: 'rep-deadstock',
          labelAr: 'تقرير الركود وتدوير المخزون',
          labelEn: 'Dead Stock & Capital Tied',
          targetTab: 'reports',
          icon: TrendingDown
        }
      ]
    },

    // 11. الخزينة والمالية (Fintech & Accounting) - Accordion
    {
      key: 'finance',
      labelAr: 'الخزينة',
      labelEn: 'Fintech & Treasury',
      primaryTab: 'fintech',
      icon: Wallet,
      iconColor: 'text-amber-400',
      badge: '95% Lock',
      badgeColor: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
      visible: showFintech,
      subItems: [
        {
          id: 'fin-wallets',
          labelAr: 'المحافظ الإلكترونية وماكينات POS',
          labelEn: 'E-Wallets & Terminals',
          targetTab: 'fintech',
          icon: Wallet
        },
        {
          id: 'fin-expenses',
          labelAr: 'سندات الصرف والمصروفات اليومية',
          labelEn: 'Expense Vouchers',
          targetTab: 'fintech',
          icon: Receipt
        },
        {
          id: 'fin-approvals',
          labelAr: 'الاعتمادات والموافقات الكبرى (> 5000)',
          labelEn: 'Dual-Control Approvals (>5K)',
          targetTab: 'fintech',
          icon: ShieldCheck
        },
        {
          id: 'fin-ledger',
          labelAr: 'دفتر اليومية والقيود العامة',
          labelEn: 'General Journal & Entries',
          targetTab: 'accounting',
          icon: BookOpen
        },
        {
          id: 'fin-statements',
          labelAr: 'قائمة الدخل والميزانية العمومية',
          labelEn: 'Income Statement & Balance Sheet',
          targetTab: 'accounting',
          icon: Scale
        },
        {
          id: 'fin-cashflow',
          labelAr: 'التدفقات النقدية والتسوية البنكية',
          labelEn: 'Cash Flow & Bank Reconciliation',
          targetTab: 'fintech',
          icon: TrendingUp
        }
      ]
    },

    // 12. شؤون الموظفين والرواتب (HR)
    {
      key: 'hr',
      labelAr: 'شؤون الموظفين (HR)',
      labelEn: 'HR & Payroll',
      primaryTab: 'hr',
      icon: Users,
      iconColor: 'text-violet-400',
      badge: 'PRO',
      badgeColor: 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60'
    },

    // 13. إغلاق الوردية وحساب العجز
    {
      key: 'shift',
      labelAr: 'إغلاق الوردية وحساب العجز',
      labelEn: 'Shift & Cash Variance',
      primaryTab: 'shift',
      icon: Clock,
      iconColor: 'text-amber-400',
      badge: 'Shift',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-800/60'
    },

    // 14. الذكاء الاصطناعي والتكاملات
    {
      key: 'advanced-hub',
      labelAr: 'الذكاء الاصطناعي والتكاملات',
      labelEn: 'AI & Integrations Hub',
      primaryTab: 'advanced-hub',
      icon: Sparkles,
      iconColor: 'text-amber-400',
      badge: 'AI',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-800/60'
    },

    // 15. المشاريع والمهام الفنية
    {
      key: 'projects',
      labelAr: 'المشاريع والمهام الفنية',
      labelEn: 'Projects & Tasks',
      primaryTab: 'projects',
      icon: FolderKanban,
      iconColor: 'text-orange-400'
    }
  ];

  return (
    <aside className="w-64 bg-white dark:bg-[#0B0F17] border-e border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 select-none overflow-y-auto transition-colors">
      <div className="p-3 space-y-4">
        {/* Top Store Header Matching Image 2 */}
        <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between shadow-sm transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <StoreIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {store?.name || 'Selfi store'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {store?.address ? `${store.address} • فرع نشط` : 'فرع الصيانة ونقاط البيع'}
              </div>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] shrink-0" />
        </div>

        {/* Navigation Sections */}
        <nav className="space-y-1.5" aria-label="Main Navigation">
          {menuSections
            .filter(section => section.visible !== false)
            .map(section => {
              const SectionIcon = section.icon;
              const hasSubItems = Boolean(section.subItems && section.subItems.length > 0);
              const isOpen = Boolean(openSections[section.key]);
              const isDirectActive = activeTab === section.primaryTab;
              const isChildActive = section.subItems?.some(sub => sub.targetTab === activeTab);
              const isHighlighted = isDirectActive || isChildActive;

              return (
                <div key={section.key} className="space-y-1">
                  {/* Main Section Header / Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasSubItems) {
                        toggleSection(section.key, section.primaryTab);
                      } else {
                        onTabChange(section.primaryTab);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700/60'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SectionIcon className={`w-4 h-4 shrink-0 ${section.iconColor}`} />
                      <span className="truncate">{isAr ? section.labelAr : section.labelEn}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ms-2">
                      {section.badge && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                            section.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {section.badge}
                        </span>
                      )}

                      {hasSubItems ? (
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                            isOpen ? 'rotate-0 text-sky-400' : dir === 'rtl' ? 'rotate-90' : '-rotate-90'
                          }`}
                        />
                      ) : (
                        <div className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>

                  {/* Sub-items Tree Accordion */}
                  {hasSubItems && isOpen && section.subItems && (
                    <div
                      className="space-y-0.5 ps-3 ms-4 py-1 border-s-2 border-slate-200 dark:border-slate-700/60 animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                      {section.subItems.map(subItem => {
                        const SubIcon = subItem.icon;
                        const isSubActive = activeTab === subItem.targetTab;

                        return (
                          <button
                            key={subItem.id}
                            type="button"
                            onClick={() => onTabChange(subItem.targetTab)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                              isSubActive
                                ? 'bg-sky-500/15 text-sky-400 font-semibold border-s-2 border-sky-400'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-sky-400' : 'text-slate-500 dark:text-slate-500'}`} />
                              <span className="truncate">{isAr ? subItem.labelAr : subItem.labelEn}</span>
                            </div>

                            {subItem.badge && (
                              <span
                                className={`px-1 py-0.2 rounded text-[8px] font-mono border ${
                                  subItem.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {subItem.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </nav>
      </div>

      {/* Bottom Footer Section: Settings, Logout, and System Status */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1 bg-slate-50 dark:bg-slate-900/60 transition-colors">
        {/* Settings Navigation Button */}
        <button
          type="button"
          onClick={() => onTabChange('settings')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>{isAr ? 'الإعدادات والنظام' : 'Settings & System'}</span>
          </div>
          {dir === 'rtl' ? (
            <ChevronLeft className="w-3.5 h-3.5 opacity-50 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" />
          )}
        </button>

        {/* Logout Button */}
        <button
          type="button"
          onClick={() => auth?.logout?.()}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/30 transition"
        >
          <div className="flex items-center gap-2.5">
            <LogOut className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{isAr ? 'تسجيل الخروج' : 'Logout'}</span>
          </div>
        </button>

        {/* Database WAL-2 Engine Status Indicator */}
        <div className="pt-2 px-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
            {t.sidebar.sqliteMode || (isAr ? 'قاعدة بيانات SQLite المحلية' : 'Local SQLite DB')}
          </span>
          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
            WAL-2
          </span>
        </div>
      </div>
    </aside>
  );
};
