import React, { useState, useEffect, useRef } from 'react';
import { Item, ImeiRecord, Sale, MissingDemand } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import { ThermalReceiptModal } from '../components/receipt/ThermalReceiptModal';
import { A4InvoiceModal } from '../components/invoices/A4InvoiceModal';
import { CustomerFacingDisplayModal } from '../components/retail/CustomerFacingDisplayModal';
import { LoanerPhonesModal } from '../components/retail/LoanerPhonesModal';
import { OcrScannerModal } from '../components/retail/OcrScannerModal';
import { SplitPaymentModal, SplitPaymentLine } from '../components/retail/SplitPaymentModal';
import { InstallmentSalesModal } from '../components/retail/InstallmentSalesModal';
import { TradeInModal } from '../components/retail/TradeInModal';
import {
  ShoppingCart,
  Barcode,
  Plus,
  Minus,
  Trash2,
  Clock,
  AlertTriangle,
  Package,
  Smartphone,
  FileText,
  ShieldCheck,
  CheckSquare,
  Monitor,
  Scan,
  PhoneCall,
  CreditCard,
  Calendar,
  RefreshCw,
  Tag,
  Undo2,
  CheckCircle2,
  XCircle,
  Search,
  X
} from 'lucide-react';

export const PosView: React.FC = () => {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'pos' | 'drafts' | 'aging' | 'missing' | 'inspections' | 'returns'>('pos');
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Array<{
    item: Item;
    quantity: number;
    unit_price: number;
    imei?: string;
  }>>([]);

  // Customer on checkout
  const [customerName, setCustomerName] = useState('عميل صالة (نقدي)');
  const [customerPhone, setCustomerPhone] = useState('+201012345678');
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  // Multi-tier Discounts & Role Limits
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [discountReason, setDiscountReason] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [isEvaluatingDiscount, setIsEvaluatingDiscount] = useState(false);

  // Loyalty Points
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState(0);

  // Trade-In Assessment Credit (R2.3)
  const [showTradeInModal, setShowTradeInModal] = useState(false);
  const [tradeInCredit, setTradeInCredit] = useState(0);
  const [tradeInId, setTradeInId] = useState<string | undefined>(undefined);
  const [tradeInDetails, setTradeInDetails] = useState<string | undefined>(undefined);

  // Split Payment Multi-Method (R2.1)
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPaymentLine[] | null>(null);

  // Installment Sales Engine (R2.2)
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);

  // Negative Inventory & Stock Errors (R2.8)
  const [stockErrorModal, setStockErrorModal] = useState<{
    isOpen: boolean;
    items: Array<{ item_id: string; name: string; requested: number; available: number }>;
  } | null>(null);

  // Void Sale with Reason (R2.7)
  const [voidModalSale, setVoidModalSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Return & Exchange Management (R2.5)
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [returnSaleData, setReturnSaleData] = useState<any | null>(null);
  const [previousReturns, setPreviousReturns] = useState<any[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('عيب صناعة / تلف مصنعي');
  const [isSearchingReturn, setIsSearchingReturn] = useState(false);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [lastCreditNote, setLastCreditNote] = useState<any | null>(null);

  // IMEI Selection Modal for Phones
  const [imeiModalItem, setImeiModalItem] = useState<Item | null>(null);
  const [availableImeis, setAvailableImeis] = useState<ImeiRecord[]>([]);
  const [selectedImei, setSelectedImei] = useState('');

  // Draft Sales
  const [draftSales, setDraftSales] = useState<Sale[]>([]);

  // Aging Inventory
  const [agingItems, setAgingItems] = useState<Item[]>([]);

  // Missing Demand Log
  const [missingDemands, setMissingDemands] = useState<MissingDemand[]>([]);
  const [newDemandForm, setNewDemandForm] = useState({ query: '', phone: '', notes: '' });

  // Inspections
  const [inspections, setInspections] = useState<any[]>([]);
  const [inspectionForm, setInspectionForm] = useState({
    device_model: '',
    imei: '',
    battery_health: 90,
    screen_condition: 'EXCELLENT',
    face_touch_id: 'WORKING',
    cameras_working: 1,
    icloud_status: 'CLEAN',
    network_unlocked: 1,
    speaker_mic_working: 1,
    purchase_price: 12000,
    customer_name: '',
    customer_phone: '',
    notes: ''
  });

  // Receipts and Printable Invoices
  const [receiptToPrint, setReceiptToPrint] = useState<{ text: string; phone?: string } | null>(null);
  const [a4InvoiceData, setA4InvoiceData] = useState<any | null>(null);

  // 70 Proposals Retail State (CFD, Loaner Phones, OCR Scanner)
  const [showCfdModal, setShowCfdModal] = useState(false);
  const [showLoanerModal, setShowLoanerModal] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Requirement 9: Restore Cart State from sessionStorage on load/refresh (R2.9)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('erp_pos_active_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
          setCart(parsed.cart);
        }
        if (parsed.customerName) setCustomerName(parsed.customerName);
        if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
        if (parsed.discount !== undefined) setDiscount(parsed.discount);
        if (parsed.discountType) setDiscountType(parsed.discountType);
        if (parsed.discountReason) setDiscountReason(parsed.discountReason);
        if (parsed.tradeInCredit !== undefined) setTradeInCredit(parsed.tradeInCredit);
        if (parsed.tradeInId) setTradeInId(parsed.tradeInId);
        if (parsed.tradeInDetails) setTradeInDetails(parsed.tradeInDetails);
        if (parsed.couponCode) setCouponCode(parsed.couponCode);
      }
    } catch (e) {
      console.error('Failed to restore cart from sessionStorage:', e);
    }
  }, []);

  // Requirement 9: Persist Cart State to sessionStorage on every change (R2.9)
  useEffect(() => {
    try {
      if (cart.length > 0 || tradeInCredit > 0 || discount > 0) {
        sessionStorage.setItem('erp_pos_active_cart', JSON.stringify({
          cart,
          customerName,
          customerPhone,
          paymentMethod,
          discount,
          discountType,
          discountReason,
          tradeInCredit,
          tradeInId,
          tradeInDetails,
          couponCode
        }));
      } else {
        sessionStorage.removeItem('erp_pos_active_cart');
      }
    } catch (e) {
      console.error('Failed to persist cart to sessionStorage:', e);
    }
  }, [cart, customerName, customerPhone, paymentMethod, discount, discountType, discountReason, tradeInCredit, tradeInId, tradeInDetails, couponCode]);

  // Subtotal, Precision Calculations, and Trade-In Deductions (R2.6)
  const subtotal = Math.round(cart.reduce((acc, c) => acc + c.unit_price * c.quantity, 0) * 100) / 100;
  const calculatedDiscount = discountType === 'PERCENTAGE'
    ? Math.round(((subtotal * (discount || 0)) / 100) * 100) / 100
    : (discount || 0);

  const loyaltyDiscount = useLoyaltyPoints ? Math.floor(loyaltyPointsToUse / 10) : 0;
  const totalDiscount = Math.round((calculatedDiscount + loyaltyDiscount + tradeInCredit) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

  // Dual-screen Customer Facing Display (CFD) live cart mirroring (Proposal 8)
  useEffect(() => {
    api.updateCfdCart?.({
      storeName: 'Modular Mobile ERP POS',
      cashierName: 'Main Cashier',
      customerName,
      items: cart.map(c => ({
        name: c.item.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: c.quantity * c.unit_price
      })),
      subtotal,
      tax: 0,
      discount: totalDiscount,
      total,
      paymentMethod: splitPayments ? 'SPLIT' : paymentMethod
    }).catch(() => {});
  }, [cart, totalDiscount, total, customerName, paymentMethod, splitPayments, subtotal]);

  // Headless POS Keyboard Shortcuts (Proposal 9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        showToast(isAr ? 'تركيز باركود الصنف (F2)' : 'Focused Barcode Scanner (F2)', 'info');
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 || tradeInCredit > 0) {
          setCart([]);
          setTradeInCredit(0);
          setTradeInId(undefined);
          setTradeInDetails(undefined);
          setSplitPayments(null);
          sessionStorage.removeItem('erp_pos_active_cart');
          showToast(isAr ? 'تم تفريغ السلة (F4)' : 'Cart cleared (F4)', 'info');
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setShowLoanerModal(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        setShowCfdModal(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        setShowOcrModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isAr, showToast, tradeInCredit]);

  const loadItems = async () => {
    try {
      const data = await api.searchItems(searchQuery);
      setItems(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadDrafts = async () => {
    try {
      const data = await api.getDraftSales();
      setDraftSales(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadAging = async () => {
    try {
      const data = await api.getAgingInventory();
      setAgingItems(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadMissing = async () => {
    try {
      const data = await api.getMissingDemand();
      setMissingDemands(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadInspections = async () => {
    try {
      const data = await api.getUsedInspections();
      setInspections(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadItems();
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === 'drafts') loadDrafts();
    if (activeTab === 'aging') loadAging();
    if (activeTab === 'missing') loadMissing();
    if (activeTab === 'inspections') loadInspections();
  }, [activeTab]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [activeTab]);

  const handleAddItemToCart = async (item: Item) => {
    if (item.category === 'PHONE') {
      try {
        const imeis = await api.getItemImeis(item.id);
        if (imeis.length === 0) {
          showToast(isAr ? `لا توجد أرقام سيريال/IMEI متاحة في المخزون للصنف "${item.name}"!` : `No IMEI serials in stock for "${item.name}"!`, 'error');
          return;
        }
        setAvailableImeis(imeis);
        setImeiModalItem(item);
        setSelectedImei(imeis[0].imei);
      } catch (e: any) {
        showToast(e.message, 'error');
      }
    } else {
      const existingIdx = cart.findIndex(c => c.item.id === item.id);
      if (existingIdx >= 0) {
        const newCart = [...cart];
        newCart[existingIdx].quantity += 1;
        setCart(newCart);
      } else {
        setCart([...cart, { item, quantity: 1, unit_price: item.retail_price }]);
      }
    }
  };

  const handleConfirmImei = () => {
    if (!imeiModalItem || !selectedImei) return;
    setCart([
      ...cart,
      {
        item: imeiModalItem,
        quantity: 1,
        unit_price: imeiModalItem.retail_price,
        imei: selectedImei
      }
    ]);
    setImeiModalItem(null);
    setSelectedImei('');
    showToast(isAr ? `تم ربط السيريال: ${selectedImei}` : `IMEI linked: ${selectedImei}`, 'success');
  };

  const handleUpdateQty = (index: number, delta: number) => {
    const newCart = [...cart];
    if (newCart[index].imei && delta > 0) {
      showToast(isAr ? 'الهواتف ذات السيريال الصارم يجب إضافتها كوحدة منفردة لكل سيريال.' : 'Phone IMEI units must be added individually.', 'warning');
      return;
    }
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  // Requirement 4: Role Discount Limits Enforcement
  const handleDiscountChange = (val: number) => {
    const roleMaxPct = 10; // Cashier default: 10%
    if (discountType === 'PERCENTAGE' && val > roleMaxPct) {
      showToast(isAr ? `الحد الأقصى لخصم الكاشير هو ${roleMaxPct}%. للخصومات الأعلى يتطلب اعتماد المدير.` : `Cashier discount capped at ${roleMaxPct}%.`, 'warning');
      setDiscount(roleMaxPct);
      return;
    }
    setDiscount(val);
  };

  // Requirement 4: Dynamic Discount Rule Engine Evaluation (R2.4)
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    if (cart.length === 0) {
      showToast(isAr ? 'أضف أصنافاً للسلة أولاً لتقييم كود الخصم' : 'Add items to cart first', 'warning');
      return;
    }

    setIsEvaluatingDiscount(true);
    try {
      const res = await fetch('/api/retail/cart/apply-discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(c => ({
            item_id: c.item.id,
            name: c.item.name,
            unit_price: c.unit_price,
            quantity: c.quantity
          })),
          coupon_code: couponCode.trim().toUpperCase(),
          user_role: 'CASHIER'
        })
      });

      if (!res.ok) {
        throw new Error('Failed to evaluate discounts');
      }

      const data = await res.json();
      if (data.discount > 0) {
        setDiscount(data.discount);
        setDiscountType('FIXED');
        const ruleNames = (data.applied_rules || []).map((r: any) => r.name).join(', ') || couponCode.trim();
        setDiscountReason(`كوبون: ${ruleNames}`);
        showToast(isAr ? `تم تطبيق خصم بقيمة ${data.discount} ج.م بنجاح!` : `Discount of ${data.discount} EGP applied!`, 'success');
      } else {
        showToast(isAr ? 'الكوبون غير صالح أو لم يستوفِ شروط الحد الأدنى' : 'Coupon invalid or criteria not met', 'warning');
      }
    } catch (e: any) {
      showToast(e.message || 'Error evaluating discount coupon', 'error');
    } finally {
      setIsEvaluatingDiscount(false);
    }
  };

  // Requirement 1 & 8: Checkout Handler with Split Payments and Negative Stock Guard
  const handleCheckout = async (isDraft: boolean) => {
    if (cart.length === 0) {
      showToast(isAr ? 'السلة فارغة. يرجى مسح باركود أو اختيار صنف.' : 'Cart is empty. Scan an item barcode.', 'warning');
      return;
    }

    try {
      const payload: any = {
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: splitPayments ? 'SPLIT' : paymentMethod,
        discount: calculatedDiscount,
        discount_type: discountType,
        discount_reason: discountReason,
        loyalty_points_to_use: useLoyaltyPoints ? loyaltyPointsToUse : 0,
        is_draft: isDraft,
        salesperson_id: 'usr-sales',
        cashier_id: 'usr-cashier',
        trade_in_id: tradeInId,
        trade_in_credit: tradeInCredit,
        items: cart.map(c => ({
          item_id: c.item.id,
          item_name: c.item.name,
          unit_price: c.unit_price,
          quantity: c.quantity,
          imei: c.imei
        }))
      };

      if (splitPayments && splitPayments.length > 0) {
        payload.payments = splitPayments;
      }

      const res = await fetch('/api/retail/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Requirement 8: Negative Inventory Prevention Error Handling (R2.8)
      if (res.status === 409) {
        const errorData = await res.json();
        setStockErrorModal({
          isOpen: true,
          items: errorData.items || []
        });
        showToast(isAr ? 'عذراً! الكمية المطلوبة غير متوفرة بالمخزن (409 Conflict)' : 'Insufficient stock error (409)', 'error');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const resData = await res.json();

      // Clear state and sessionStorage
      setCart([]);
      setTradeInCredit(0);
      setTradeInId(undefined);
      setTradeInDetails(undefined);
      setSplitPayments(null);
      sessionStorage.removeItem('erp_pos_active_cart');
      loadItems();

      if (isDraft) {
        showToast(isAr ? `تم تحويل المسودة رقم #${resData.invoiceNumber} لطابور الكاشير.` : `Draft #${resData.invoiceNumber} queued for cashier.`, 'success');
      } else {
        showToast(isAr ? `تم إتمام الفاتورة #${resData.invoiceNumber} بنجاح!` : `Invoice #${resData.invoiceNumber} completed!`, 'success');
        if (resData.receiptText) {
          setReceiptToPrint({ text: resData.receiptText, phone: customerPhone });
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Checkout failed', 'error');
    }
  };

  // Requirement 2: Installment Plan Creation
  const handleConfirmInstallmentSale = async (installmentData: any) => {
    setShowInstallmentModal(false);
    if (cart.length === 0) return;

    try {
      // 1. Process Sale with Installment Payment Method
      const salePayload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: 'INSTALLMENT',
        discount: calculatedDiscount,
        discount_type: discountType,
        discount_reason: discountReason,
        is_draft: false,
        salesperson_id: 'usr-sales',
        cashier_id: 'usr-cashier',
        trade_in_id: tradeInId,
        trade_in_credit: tradeInCredit,
        items: cart.map(c => ({
          item_id: c.item.id,
          item_name: c.item.name,
          unit_price: c.unit_price,
          quantity: c.quantity,
          imei: c.imei
        }))
      };

      const saleRes = await fetch('/api/retail/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload)
      });

      if (!saleRes.ok) {
        const err = await saleRes.json();
        throw new Error(err.error || 'Sale creation failed');
      }

      const saleData = await saleRes.json();

      // 2. Create Installment Plan in Database
      const planRes = await fetch('/api/retail/installments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: saleData.saleId,
          customer_id: customerPhone || 'cust-1',
          total_amount: total,
          down_payment: installmentData.down_payment,
          interest_rate: installmentData.interest_rate,
          months: installmentData.months
        })
      });

      if (!planRes.ok) {
        const err = await planRes.json();
        throw new Error(err.error || 'Installment plan creation failed');
      }

      // Clear cart
      setCart([]);
      setTradeInCredit(0);
      setTradeInId(undefined);
      setTradeInDetails(undefined);
      sessionStorage.removeItem('erp_pos_active_cart');
      loadItems();

      showToast(
        isAr ? `تم اعتماد البيع بالتقسيط للفاتورة #${saleData.invoiceNumber} (${installmentData.months} قسط)!` : `Installment plan created for #${saleData.invoiceNumber}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Error processing installment sale', 'error');
    }
  };

  // Requirement 7: Void Sale with Audit Log (R2.7)
  const handleConfirmVoidSale = async () => {
    if (!voidModalSale) return;
    if (!voidReason.trim()) {
      showToast(isAr ? 'سبب الإلغاء إلزامي لتسجيل الرقابة (Reason required)' : 'Reason is required', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/retail/sales/${voidModalSale.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: voidReason.trim(),
          user_id: 'usr-cashier'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to void sale');
      }

      showToast(isAr ? 'تم إلغاء الفاتورة وتسجيل السبب في سجل الرقابة' : 'Sale voided successfully', 'success');
      setVoidModalSale(null);
      setVoidReason('');
      loadDrafts();
      loadItems();
    } catch (err: any) {
      showToast(err.message || 'Error voiding sale', 'error');
    }
  };

  // Requirement 5: Return Search & Processing (R2.5)
  const handleSearchReturnSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSearchQuery.trim()) return;

    setIsSearchingReturn(true);
    setReturnSaleData(null);
    setPreviousReturns([]);
    setReturnQtys({});
    setLastCreditNote(null);

    try {
      let saleId = returnSearchQuery.trim();
      let res = await fetch(`/api/retail/sales/${saleId}/a4-invoice`);
      if (!res.ok) {
        // Try searching sales
        const allSales = await api.getSales();
        const found = allSales.find(s => s.invoice_number?.toString() === saleId || s.id === saleId);
        if (found) {
          saleId = found.id;
          res = await fetch(`/api/retail/sales/${saleId}/a4-invoice`);
        }
      }

      if (!res.ok) {
        throw new Error(isAr ? 'لم يتم العثور على الفاتورة' : 'Invoice not found');
      }

      const invData = await res.json();
      setReturnSaleData(invData);

      // Fetch previous returns
      const retsRes = await fetch(`/api/retail/sales/${invData.sale.id}/returns`);
      if (retsRes.ok) {
        const rets = await retsRes.json();
        setPreviousReturns(rets);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSearchingReturn(false);
    }
  };

  const handleExecuteReturn = async () => {
    if (!returnSaleData || !returnSaleData.sale) return;
    if (!returnReason.trim()) {
      showToast(isAr ? 'يرجى كتابة سبب الإرجاع' : 'Return reason required', 'error');
      return;
    }

    const itemsToReturn: Array<{ item_id: string; quantity: number }> = [];
    for (const [itemId, qty] of Object.entries(returnQtys)) {
      if (qty > 0) {
        itemsToReturn.push({ item_id: itemId, quantity: qty });
      }
    }

    if (itemsToReturn.length === 0) {
      showToast(isAr ? 'يرجى تحديد كمية قطعة واحدة على الأقل للإرجاع' : 'Select at least 1 item to return', 'warning');
      return;
    }

    setIsProcessingReturn(true);
    try {
      const res = await fetch(`/api/retail/sales/${returnSaleData.sale.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToReturn,
          reason: returnReason.trim(),
          created_by: 'Main Cashier'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Return processing failed');
      }

      const creditNote = await res.json();
      setLastCreditNote(creditNote);
      setReturnQtys({});
      loadItems();
      showToast(
        isAr ? `تم إصدار إشعار دائن رقم ${creditNote.credit_note_number} بمبلغ ${creditNote.total_refund_amount} ج.م` : `Credit note ${creditNote.credit_note_number} issued!`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  const handleOpenA4Invoice = async (saleId: string) => {
    try {
      const invData = await api.getA4Invoice(saleId);
      setA4InvoiceData(invData);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleApproveDraft = async (saleId: string) => {
    try {
      const res = await api.approveDraftSale(saleId, 'usr-cashier', 'CASH');
      showToast(res.message, 'success');
      loadDrafts();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAddMissingDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createMissingDemand({
        item_name_or_query: newDemandForm.query,
        customer_phone: newDemandForm.phone,
        notes: newDemandForm.notes
      });
      setNewDemandForm({ query: '', phone: '', notes: '' });
      loadMissing();
      showToast(isAr ? 'تم تسجيل الطلب في خزانة النواقص بنجاح.' : 'Missing demand logged.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleConvertPo = async (id: string) => {
    try {
      await api.convertDemandToPo(id);
      loadMissing();
      showToast(isAr ? 'تم تحويل الصنف لاقتراح أمر شراء.' : 'Converted to Purchase Order suggestion.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUsedInspection(inspectionForm);
      showToast(isAr ? 'تم حفظ تقرير فحص الجهاز المستعمل بنجاح!' : 'Pre-owned inspection saved!', 'success');
      setInspectionForm({
        device_model: '',
        imei: '',
        battery_health: 90,
        screen_condition: 'EXCELLENT',
        face_touch_id: 'WORKING',
        cameras_working: 1,
        icloud_status: 'CLEAN',
        network_unlocked: 1,
        speaker_mic_working: 1,
        purchase_price: 0,
        customer_name: '',
        customer_phone: '',
        notes: ''
      });
      loadInspections();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-emerald-400" />
            {t.pos.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.pos.subtitle}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'pos' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.pos.posTab}
          </button>
          <button
            onClick={() => setActiveTab('drafts')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'drafts' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.pos.cashierQueueTab} ({draftSales.length})
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'returns' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1">
              <Undo2 className="w-3.5 h-3.5 text-amber-400" />
              {isAr ? 'مرتجع واسترجاع' : 'Returns & Credit'}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'aging' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.pos.agingTab}
          </button>
          <button
            onClick={() => setActiveTab('missing')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'missing' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.pos.missingTab}
          </button>
          <button
            onClick={() => setActiveTab('inspections')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              activeTab === 'inspections' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {isAr ? 'فحص المستعمل (12 نقطة)' : 'Used Inspection'}
          </button>
        </div>

        {/* Retail Lab Quick Tools (Proposals 8, 13, 14, Trade-In R2.3) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Trade-In Assessment Button (R2.3) */}
          <button
            onClick={() => setShowTradeInModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
            title="تقييم واستبدال جهاز مستعمل بخصم مباشر من الفاتورة"
          >
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <span>{isAr ? 'استبدال جهاز (Trade-In)' : 'Trade-In Valuation'}</span>
          </button>

          <button
            onClick={() => setShowCfdModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
            title="شاشة العميل الإضافية المزدوجة (F9)"
          >
            <Monitor className="w-4 h-4 text-indigo-400" />
            <span>{isAr ? 'شاشة العميل (CFD)' : 'Customer Display'}</span>
            <span className="text-[10px] bg-indigo-900/60 px-1 py-0.5 rounded font-mono text-indigo-200">F9</span>
          </button>

          <button
            onClick={() => setShowLoanerModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
            title="إدارة هواتف الاستبدال المؤقتة والودائع (F8)"
          >
            <PhoneCall className="w-4 h-4 text-slate-400" />
            <span>{isAr ? 'هواتف بديلة' : 'Loaner Fleet'}</span>
            <span className="text-[10px] bg-slate-900 px-1 py-0.5 rounded font-mono text-slate-400">F8</span>
          </button>

          <button
            onClick={() => setShowOcrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
            title="ماسح بطاقة الرقم القومي المصري وبطاقات الضمان OCR (F10)"
          >
            <Scan className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'ماسح بطاقة/سيريال OCR' : 'OCR ID Scanner'}</span>
            <span className="text-[10px] bg-emerald-900/60 px-1 py-0.5 rounded font-mono text-emerald-200">F10</span>
          </button>
        </div>
      </div>

      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Catalog & Barcode Scanner */}
          <div className="lg:col-span-2 space-y-4">
            {/* Barcode / Search Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-950 text-emerald-400 border border-slate-800">
                <Barcode className="w-5 h-5" />
              </div>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder={t.pos.scannerPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && items.length > 0) {
                    handleAddItemToCart(items[0]);
                    setSearchQuery('');
                  }
                }}
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-hidden font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-500 hover:text-white px-2 cursor-pointer"
                >
                  {t.common.clear}
                </button>
              )}
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pe-1">
              {items.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleAddItemToCart(item)}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 cursor-pointer transition flex flex-col justify-between space-y-2 group"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          item.category === 'PHONE'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.category === 'PHONE' ? t.pos.strictImeiBadge : item.category}
                      </span>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          item.stock_quantity <= item.min_limit ? 'text-rose-400' : 'text-slate-400'
                        }`}
                      >
                        {t.pos.stockLabel} {item.stock_quantity}
                      </span>
                    </div>
                    <h4 className="font-semibold text-white text-xs mt-2 line-clamp-2 group-hover:text-emerald-300 transition">
                      {item.name}
                    </h4>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">SKU: {item.sku}</div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-emerald-400 font-mono font-bold text-sm">
                      {item.retail_price.toLocaleString()} {t.common.currency}
                    </span>
                    <span className="p-1 rounded bg-slate-800 text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Col: Live Cart & Fast Checkout Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-white text-sm">{t.pos.cartTitle}</h3>
                </div>
                <button
                  onClick={() => {
                    setCart([]);
                    setTradeInCredit(0);
                    setTradeInId(undefined);
                    setTradeInDetails(undefined);
                    setSplitPayments(null);
                    sessionStorage.removeItem('erp_pos_active_cart');
                  }}
                  className="text-[11px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> {t.pos.clearCart}
                </button>
              </div>

              {/* Cart Items List */}
              <div className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto mt-2">
                {cart.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-xs">
                    {t.pos.emptyCart}
                  </div>
                ) : (
                  cart.map((c, idx) => (
                    <div key={idx} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="flex-1">
                        <div className="font-medium text-white line-clamp-1">{c.item.name}</div>
                        {c.imei && (
                          <div className="text-[10px] font-mono text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded inline-block mt-0.5">
                            IMEI: {c.imei}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {c.unit_price} {t.common.currency}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!c.imei && (
                          <div className="flex items-center bg-slate-950 border border-slate-800 rounded">
                            <button
                              onClick={() => handleUpdateQty(idx, -1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:text-white cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 font-mono text-white text-xs">{c.quantity}</span>
                            <button
                              onClick={() => handleUpdateQty(idx, 1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:text-white cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div className="font-mono font-bold text-white text-end min-w-[60px]">
                          {(c.unit_price * c.quantity).toLocaleString()} {t.common.currency}
                        </div>

                        <button
                          onClick={() => {
                            const newCart = [...cart];
                            newCart.splice(idx, 1);
                            setCart(newCart);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Customer & Checkout Details */}
            <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">{t.pos.clientName}</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">{t.pos.clientPhone}</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs"
                  />
                </div>
              </div>

              {/* Payment Method & Split Payment Button (R2.1) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400">{t.pos.payMethod}</label>
                  <button
                    type="button"
                    onClick={() => setShowSplitModal(true)}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <CreditCard className="w-3 h-3" />
                    {isAr ? 'دفع متعدد (Split)' : 'Split Payment'}
                  </button>
                </div>

                {splitPayments && splitPayments.length > 0 ? (
                  <div className="p-2 bg-emerald-950/40 border border-emerald-800/60 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-emerald-300 block text-[11px]">
                        {isAr ? 'دفع متعدد مفعل:' : 'Split payment active:'}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {splitPayments.map(p => `${p.method}: ${p.amount} ج.م`).join(' | ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSplitPayments(null)}
                      className="text-slate-400 hover:text-rose-400 text-xs px-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={paymentMethod}
                    onChange={e => {
                      if (e.target.value === 'SPLIT') {
                        setShowSplitModal(true);
                      } else {
                        setPaymentMethod(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs"
                  >
                    <option value="CASH">{t.pos.cashPay}</option>
                    <option value="CARD">{t.pos.cardPay}</option>
                    <option value="WALLET">{t.pos.walletPay}</option>
                    <option value="SPLIT">-- {isAr ? 'دفع متعدد (Split)' : 'Split Payment'} --</option>
                  </select>
                )}
              </div>

              {/* Discount & Coupon Section (R2.4) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-400">{t.common.discount}</label>
                    <button
                      type="button"
                      onClick={() => setDiscountType(discountType === 'FIXED' ? 'PERCENTAGE' : 'FIXED')}
                      className="text-[10px] text-indigo-400 hover:underline cursor-pointer"
                    >
                      {discountType === 'FIXED' ? 'ثابت (ج.م)' : 'نسبة (%)'}
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={e => handleDiscountChange(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{isAr ? 'كود الكوبون' : 'Coupon Code'}</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value)}
                      placeholder="SAVE10"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono text-xs uppercase"
                    />
                    <button
                      type="button"
                      disabled={isEvaluatingDiscount || !couponCode.trim()}
                      onClick={handleApplyCoupon}
                      className="px-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-[10px] font-semibold transition cursor-pointer"
                    >
                      {isAr ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Trade-In Credit Active Badge (R2.3) */}
              {tradeInCredit > 0 && (
                <div className="p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <div>
                      <span className="font-semibold text-amber-300 block text-[11px]">
                        {isAr ? 'رصيد استبدال جهاز مستعمل:' : 'Trade-In Credit Applied:'}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        -{tradeInCredit.toLocaleString()} ج.م {tradeInDetails ? `(${tradeInDetails})` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTradeInCredit(0);
                      setTradeInId(undefined);
                      setTradeInDetails(undefined);
                    }}
                    className="text-slate-400 hover:text-rose-400 text-xs px-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Total Calculation Display */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>{t.common.subtotal}</span>
                  <span className="font-mono">{subtotal.toLocaleString()} {t.common.currency}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>{t.common.discount} {tradeInCredit > 0 ? `(شامل استبدال ${tradeInCredit} ج.م)` : ''}</span>
                    <span className="font-mono">-{totalDiscount.toLocaleString()} {t.common.currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-slate-800">
                  <span>{t.common.total}</span>
                  <span className="text-emerald-400 font-mono">{total.toLocaleString()} {t.common.currency}</span>
                </div>
              </div>

              {/* Fast Action Buttons & Installments (R2.2) */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleCheckout(true)}
                  className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs border border-slate-700 transition cursor-pointer"
                >
                  {t.pos.draftSaleBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstallmentModal(true)}
                  className="py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isAr ? 'تقسيط' : 'Installment'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCheckout(false)}
                  className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                >
                  {t.pos.payPrintBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cashier Queue Tab (Draft Sales) */}
      {activeTab === 'drafts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              {t.pos.cashierQueueTab}
            </h3>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">{t.pos.draftInvoiceCol}</th>
                <th className="px-4 py-3">{t.common.customer}</th>
                <th className="px-4 py-3">{t.pos.salespersonCol}</th>
                <th className="px-4 py-3">{t.pos.amountCol}</th>
                <th className="px-4 py-3">{t.common.date}</th>
                <th className="px-4 py-3 text-end">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {draftSales.map(s => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono font-bold text-white">#{s.invoice_number}</td>
                  <td className="px-4 py-3">{s.customer_name} ({s.customer_phone})</td>
                  <td className="px-4 py-3 font-mono text-indigo-300">{s.salesperson_name || 'موظف الصالة'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-400">{s.total.toLocaleString()} {t.common.currency}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{s.created_at.substring(11, 16)}</td>
                  <td className="px-4 py-3 text-end flex justify-end gap-2">
                    <button
                      onClick={() => handleOpenA4Invoice(s.id)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-xs border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      A4
                    </button>
                    {/* Requirement 7: Void with Reason */}
                    <button
                      onClick={() => {
                        setVoidModalSale(s);
                        setVoidReason('');
                      }}
                      className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded font-semibold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isAr ? 'إلغاء' : 'Void'}
                    </button>
                    <button
                      onClick={() => handleApproveDraft(s.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-xs shadow cursor-pointer"
                    >
                      {t.pos.acceptDraftBtn}
                    </button>
                  </td>
                </tr>
              ))}
              {draftSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    {isAr ? 'لا توجد مسودات معلقة في طابور الكاشير' : 'No pending drafts'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Returns & Exchange Tab (R2.5) */}
      {activeTab === 'returns' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-amber-400" />
                {isAr ? 'إدارة المرتجعات وإشعارات الدائن (Returns & Credit Notes)' : 'Return & Exchange Management'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr ? 'استرجاع جزئي أو كلي للفواتير مع استعادة المخزون وإصدار إشعار دائن رسمي' : 'Process full or partial returns, restore stock, and issue credit notes'}
              </p>
            </div>
          </div>

          {/* Search Invoice Form */}
          <form onSubmit={handleSearchReturnSale} className="flex gap-3 max-w-xl">
            <div className="relative flex-1">
              <input
                type="text"
                value={returnSearchQuery}
                onChange={e => setReturnSearchQuery(e.target.value)}
                placeholder={isAr ? 'أدخل رقم الفاتورة أو المعرف (مثال: 5001)' : 'Enter invoice number or sale ID'}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-white text-xs font-mono focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSearchingReturn || !returnSearchQuery.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>{isAr ? 'بحث عن الفاتورة' : 'Search'}</span>
            </button>
          </form>

          {/* Invoice Found Details */}
          {returnSaleData && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl grid grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">{isAr ? 'رقم الفاتورة' : 'Invoice'}</span>
                  <span className="font-mono font-bold text-white text-sm">#{returnSaleData.sale.invoice_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{isAr ? 'العميل' : 'Customer'}</span>
                  <span className="text-slate-200">{returnSaleData.sale.customer_name || 'عميل نقدي'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{isAr ? 'إجمالي المدفوع' : 'Total Paid'}</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">{returnSaleData.sale.total} ج.م</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{isAr ? 'التاريخ' : 'Date'}</span>
                  <span className="text-slate-300 font-mono">{returnSaleData.sale.created_at?.substring(0, 10)}</span>
                </div>
              </div>

              {/* Items Return Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-start text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                      <th className="px-4 py-2.5 text-center">{isAr ? 'الكمية المباعة' : 'Sold Qty'}</th>
                      <th className="px-4 py-2.5 text-end">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                      <th className="px-4 py-2.5 text-center">{isAr ? 'الكمية المراد إرجاعها' : 'Return Qty'}</th>
                      <th className="px-4 py-2.5 text-end">{isAr ? 'مبلغ الاسترداد' : 'Refund Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {returnSaleData.items.map((itm: any) => {
                      const returnQty = returnQtys[itm.item_id] || 0;
                      const lineRefund = returnQty * itm.unit_price;

                      return (
                        <tr key={itm.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <span className="font-sans font-semibold text-white block">{itm.item_name}</span>
                            {itm.imei && <span className="text-[10px] text-indigo-300 block">IMEI: {itm.imei}</span>}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-300">{itm.quantity}</td>
                          <td className="px-4 py-3 text-end">{itm.unit_price} ج.م</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={itm.quantity}
                              value={returnQty === 0 ? '' : returnQty}
                              placeholder="0"
                              onChange={e => {
                                const val = Math.min(itm.quantity, Math.max(0, parseInt(e.target.value, 10) || 0));
                                setReturnQtys({ ...returnQtys, [itm.item_id]: val });
                              }}
                              className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-white text-xs font-mono focus:border-amber-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-end font-bold text-emerald-400">
                            {lineRefund.toLocaleString()} ج.م
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Reason & Submit */}
              <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      {isAr ? 'سبب الإرجاع والاستبدال (إلزامي)' : 'Return Reason (Required)'}
                    </label>
                    <select
                      value={returnReason}
                      onChange={e => setReturnReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                    >
                      <option value="عيب صناعة / تلف مصنعي">عيب صناعة / تلف مصنعي</option>
                      <option value="استبدال بموديل أو لون آخر">استبدال بموديل أو لون آخر</option>
                      <option value="عدم مطابقة المواصفات المطلوبة">عدم مطابقة المواصفات المطلوبة</option>
                      <option value="استرجاع العميل خلال فترة السماح 14 يوماً">استرجاع العميل خلال فترة السماح 14 يوماً</option>
                      <option value="خطأ من الكاشير في اختيار الصنف">خطأ من الكاشير في اختيار الصنف</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      {isAr ? 'ملاحظات وتفاصيل إضافية' : 'Notes'}
                    </label>
                    <input
                      type="text"
                      placeholder={isAr ? 'اكتب أي تفاصيل إضافية عن الفحص...' : 'Additional notes...'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={isProcessingReturn || Object.values(returnQtys).every(q => !q || q === 0)}
                    onClick={handleExecuteReturn}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-lg shadow-amber-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد المرتجع وإصدار إشعار دائن' : 'Process Return & Issue Credit Note'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Last Issued Credit Note Display */}
          {lastCreditNote && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/70 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>{isAr ? 'تم إتمام المرتجع وإعادة المخزون بنجاح!' : 'Return completed successfully!'}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 font-mono text-slate-200 pt-1">
                <div>رقم إشعار الدائن: <strong className="text-white">{lastCreditNote.credit_note_number}</strong></div>
                <div>إجمالي المبلغ المسترد: <strong className="text-emerald-400">{lastCreditNote.total_refund_amount} ج.م</strong></div>
                <div>السبب: <strong className="text-white">{lastCreditNote.reason}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aging Inventory Tab */}
      {activeTab === 'aging' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                {t.pos.agingTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t.pos.agingDesc}
              </p>
            </div>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">{isAr ? 'الصنف' : 'Item'}</th>
                <th className="px-4 py-3">{isAr ? 'الكود' : 'SKU'}</th>
                <th className="px-4 py-3">{isAr ? 'الكمية' : 'Qty'}</th>
                <th className="px-4 py-3">{isAr ? 'سعر الشراء' : 'Cost Price'}</th>
                <th className="px-4 py-3">{isAr ? 'أيام الركود' : 'Days Idle'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {agingItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-sans font-semibold text-white">{item.name}</td>
                  <td className="px-4 py-3 text-slate-400">{item.sku}</td>
                  <td className="px-4 py-3 font-bold text-amber-400">{item.stock_quantity}</td>
                  <td className="px-4 py-3">{item.purchase_price} {t.common.currency}</td>
                  <td className="px-4 py-3 text-rose-400 font-bold">{(item as any).days_idle || 35} يوم</td>
                </tr>
              ))}
              {agingItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500 font-sans">
                    {isAr ? 'لا توجد أصناف راكدة' : 'No aging stock found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Missing Demand Tab */}
      {activeTab === 'missing' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-3">
              {t.pos.missingTitle}
            </h3>
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">{t.pos.requestedItem}</th>
                  <th className="px-4 py-3">{t.pos.requestCount}</th>
                  <th className="px-4 py-3">{t.pos.clientPhone}</th>
                  <th className="px-4 py-3">{isAr ? 'ملاحظات' : 'Notes'}</th>
                  <th className="px-4 py-3 text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {missingDemands.map(d => (
                  <tr key={d.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-white">{d.item_name_or_query}</td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-400">{d.request_count}</td>
                    <td className="px-4 py-3 font-mono text-slate-400">{d.customer_phone || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{d.notes || '-'}</td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => handleConvertPo(d.id)}
                        className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-xs font-semibold cursor-pointer"
                      >
                        {t.pos.generatePoBtn}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-3 mb-4">
              {t.pos.missingTitle}
            </h3>
            <form onSubmit={handleAddMissingDemand} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">{t.pos.requestedItem}</label>
                <input
                  type="text"
                  required
                  value={newDemandForm.query}
                  onChange={e => setNewDemandForm({ ...newDemandForm, query: e.target.value })}
                  placeholder="iPhone 15 Pro Max Screen..."
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{t.pos.clientPhone}</label>
                <input
                  type="text"
                  value={newDemandForm.phone}
                  onChange={e => setNewDemandForm({ ...newDemandForm, phone: e.target.value })}
                  placeholder="010xxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={3}
                  value={newDemandForm.notes}
                  onChange={e => setNewDemandForm({ ...newDemandForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-xs transition cursor-pointer"
              >
                {isAr ? 'تسجيل في النواقص' : 'Submit Demand'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Used Inspections Tab */}
      {activeTab === 'inspections' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-3 mb-4">
              فحص جهاز مستعمل جديد (12 نقطة)
            </h3>
            <form onSubmit={handleSaveInspection} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">موديل الجهاز</label>
                <input
                  type="text"
                  required
                  value={inspectionForm.device_model}
                  onChange={e => setInspectionForm({ ...inspectionForm, device_model: e.target.value })}
                  placeholder="iPhone 13 Pro 256GB"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">الرقم التسلسلي / IMEI</label>
                <input
                  type="text"
                  value={inspectionForm.imei}
                  onChange={e => setInspectionForm({ ...inspectionForm, imei: e.target.value })}
                  placeholder="35xxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">صحة البطارية (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={inspectionForm.battery_health}
                    onChange={e => setInspectionForm({ ...inspectionForm, battery_health: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">سعر الشراء المتفق (ج.م)</label>
                  <input
                    type="number"
                    value={inspectionForm.purchase_price}
                    onChange={e => setInspectionForm({ ...inspectionForm, purchase_price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">اسم البائع</label>
                  <input
                    type="text"
                    value={inspectionForm.customer_name}
                    onChange={e => setInspectionForm({ ...inspectionForm, customer_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">هاتف البائع</label>
                  <input
                    type="text"
                    value={inspectionForm.customer_phone}
                    onChange={e => setInspectionForm({ ...inspectionForm, customer_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold text-xs transition cursor-pointer"
              >
                حفظ نتيجة الفحص
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <h3 className="font-semibold text-white text-base border-b border-slate-800 pb-3">
              سجل الفحوصات السابقة للأجهزة المستعملة
            </h3>
            <div className="divide-y divide-slate-800">
              {inspections.map((insp: any) => (
                <div key={insp.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-bold text-white text-sm">{insp.device_model}</h4>
                    <p className="text-slate-400 font-mono text-[11px]">IMEI: {insp.imei || '-'} | بطارية: {insp.battery_health}%</p>
                    <p className="text-slate-500 text-[10px]">البائع: {insp.customer_name} ({insp.customer_phone})</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-400 text-sm block">
                      {insp.purchase_price} ج.م
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 font-mono">
                      {insp.created_at?.substring(0, 10)}
                    </span>
                  </div>
                </div>
              ))}
              {inspections.length === 0 && (
                <p className="text-center py-8 text-slate-500 text-xs">لا توجد فحوصات سابقة مسجلة</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Strict IMEI Selection Modal */}
      {imeiModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-400" />
              {t.pos.imeiModalTitle} {imeiModalItem.name}
            </h3>
            <p className="text-slate-300">
              {t.pos.imeiModalDesc}
            </p>

            <div className="space-y-2">
              <label className="block text-slate-300 font-medium">{t.pos.selectInStockImei}</label>
              <select
                value={selectedImei}
                onChange={e => setSelectedImei(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono text-sm"
              >
                {availableImeis.map(im => (
                  <option key={im.id} value={im.imei}>
                    {im.imei} ({im.color || ''} - {im.storage || ''} - بطارية: {im.battery_health}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImeiModalItem(null)}
                className="px-3 py-2 text-slate-400 hover:text-white cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleConfirmImei}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold cursor-pointer"
              >
                {t.pos.confirmImeiBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 7: Void Sale Reason Modal (R2.7) */}
      {voidModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-text">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">
                {isAr ? `إلغاء الفاتورة #${voidModalSale.invoice_number}` : `Void Sale #${voidModalSale.invoice_number}`}
              </h3>
            </div>

            <p className="text-slate-300">
              {isAr
                ? 'إلغاء الفاتورة سيعيد أصنافها فوراً للمخزن. إدخال سبب الإلغاء إلزامي للتوثيق والمساءلة الرقابية.'
                : 'Voiding will restore inventory items. A non-empty reason is strictly required for the audit log.'}
            </p>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'سبب الإلغاء (إلزامي)' : 'Void Reason (Required)'}
              </label>
              <textarea
                rows={3}
                required
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder={isAr ? 'اكتب سبب الإلغاء بالتفصيل...' : 'Enter void reason...'}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVoidModalSale(null)}
                className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
              >
                {isAr ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!voidReason.trim()}
                onClick={handleConfirmVoidSale}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg font-semibold shadow transition cursor-pointer"
              >
                {isAr ? 'تأكيد الإلغاء وتوثيق الرقابة' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 8: Insufficient Stock 409 Error Modal (R2.8) */}
      {stockErrorModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-text">
          <div className="bg-slate-900 border border-rose-800/80 rounded-xl p-6 max-w-md w-full space-y-4 text-xs shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-white text-base">
                {isAr ? 'عجز في المخزون (Insufficient Stock - 409)' : 'Insufficient Stock (409 Conflict)'}
              </h3>
            </div>

            <p className="text-slate-300">
              {isAr
                ? 'تم حظر إتمام البيع لمنع وصول المخزون لقيم سالبة. الأصناف التالية لا يتوفر منها رصيد كافٍ:'
                : 'Sale blocked to prevent negative inventory. The following items exceed available stock:'}
            </p>

            <div className="p-3 bg-rose-950/30 border border-rose-900/50 rounded-lg space-y-2">
              {stockErrorModal.items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">{it.name}</span>
                  <div className="text-right font-mono">
                    <span className="text-rose-400 font-bold">{isAr ? `مطلوب: ${it.requested}` : `Req: ${it.requested}`}</span>
                    <span className="text-slate-400 text-[10px] block">{isAr ? `متوفر: ${it.available}` : `Avail: ${it.available}`}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStockErrorModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                {isAr ? 'فهمت، تعديل الكميات' : 'Dismiss & Adjust'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Payment Modal (R2.1) */}
      {showSplitModal && (
        <SplitPaymentModal
          isOpen={showSplitModal}
          total={total}
          onClose={() => setShowSplitModal(false)}
          onConfirm={payments => {
            setSplitPayments(payments);
            setShowSplitModal(false);
            showToast(isAr ? `تم توزيع الفاتورة على ${payments.length} طرق دفع!` : `Split across ${payments.length} methods!`, 'success');
          }}
        />
      )}

      {/* Installment Sales Modal (R2.2) */}
      {showInstallmentModal && (
        <InstallmentSalesModal
          isOpen={showInstallmentModal}
          total={total}
          customerName={customerName}
          customerPhone={customerPhone}
          onClose={() => setShowInstallmentModal(false)}
          onConfirm={handleConfirmInstallmentSale}
        />
      )}

      {/* Trade-In Device Valuation Modal (R2.3) */}
      {showTradeInModal && (
        <TradeInModal
          isOpen={showTradeInModal}
          currentTotal={total}
          customerId={customerPhone}
          onClose={() => setShowTradeInModal(false)}
          onApplyCredit={assessment => {
            setTradeInCredit(assessment.assessed_value);
            setTradeInId(assessment.trade_in_id);
            setTradeInDetails(`${assessment.device_model} (IMEI: ${assessment.imei})`);
          }}
        />
      )}

      {/* ESC/POS Thermal Receipt Modal */}
      {receiptToPrint && (
        <ThermalReceiptModal
          receiptText={receiptToPrint.text}
          customerPhone={receiptToPrint.phone}
          title="فاتورة مبيعات ضريبية وإيصال استلام"
          onClose={() => setReceiptToPrint(null)}
        />
      )}

      {/* A4 Tax Invoice Modal */}
      {a4InvoiceData && (
        <A4InvoiceModal
          isOpen={!!a4InvoiceData}
          invoiceData={a4InvoiceData}
          onClose={() => setA4InvoiceData(null)}
        />
      )}

      {/* 70 Proposals Retail Modals */}
      {showCfdModal && (
        <CustomerFacingDisplayModal
          isOpen={showCfdModal}
          onClose={() => setShowCfdModal(false)}
          cart={cart}
          total={total}
          discount={totalDiscount}
        />
      )}

      {showLoanerModal && (
        <LoanerPhonesModal
          isOpen={showLoanerModal}
          onClose={() => setShowLoanerModal(false)}
        />
      )}

      {showOcrModal && (
        <OcrScannerModal
          isOpen={showOcrModal}
          onClose={() => setShowOcrModal(false)}
          onScanResult={result => {
            if (result.phone) {
              setCustomerPhone(result.phone);
              showToast(isAr ? `تم استخراج الهاتف: ${result.phone}` : `Phone extracted: ${result.phone}`, 'success');
            }
            if (result.nationalId) {
              showToast(isAr ? `تم التعرف على الرقم القومي (${result.governorate})` : `National ID detected (${result.governorate})`, 'info');
            }
            setShowOcrModal(false);
          }}
        />
      )}
    </div>
  );
};
