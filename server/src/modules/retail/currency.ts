/**
 * Currency & Precision Arithmetic Module for Retail POS
 * Replaces floating-point arithmetic with integer-piastre (cent) precision
 * 1 EGP = 100 Piastres (قروش)
 */

export class CurrencyUtils {
  /**
   * Convert an EGP float amount to integer piastres
   */
  static toPiastres(amount: number | string | null | undefined): number {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }

  /**
   * Convert integer piastres back to standard 2-decimal EGP number
   */
  static fromPiastres(piastres: number): number {
    if (isNaN(piastres)) return 0;
    return Math.round(piastres) / 100;
  }

  /**
   * Compute line total in piastres
   */
  static lineTotalPiastres(unitPriceEgp: number, quantity: number): number {
    const pricePiastres = this.toPiastres(unitPriceEgp);
    const qty = Math.max(0, Math.floor(quantity || 0));
    return pricePiastres * qty;
  }

  /**
   * Calculate discount in piastres based on type
   */
  static calculateDiscountPiastres(
    subtotalPiastres: number,
    discountType: 'FIXED' | 'PERCENTAGE' = 'FIXED',
    discountValue: number = 0
  ): number {
    if (discountValue <= 0 || subtotalPiastres <= 0) return 0;

    if (discountType === 'PERCENTAGE') {
      const pct = Math.min(100, Math.max(0, discountValue));
      return Math.round((subtotalPiastres * pct) / 100);
    } else {
      const fixedPiastres = this.toPiastres(discountValue);
      return Math.min(subtotalPiastres, fixedPiastres);
    }
  }

  /**
   * Calculate tax in piastres based on tax rate (e.g. 0.14 for 14% VAT)
   * or fixed tax amount
   */
  static calculateTaxPiastres(
    taxableAmountPiastres: number,
    taxInput: number = 0,
    isRate: boolean = false
  ): number {
    if (taxInput <= 0 || taxableAmountPiastres <= 0) return 0;
    if (isRate) {
      return Math.round(taxableAmountPiastres * taxInput);
    }
    return this.toPiastres(taxInput);
  }

  /**
   * Validate split payment amounts against invoice total in integer piastres
   */
  static validateSplitPaymentPiastres(
    totalPiastres: number,
    payments: Array<{ amount: number }>
  ): { valid: boolean; totalAllocatedPiastres: number; differencePiastres: number } {
    const totalAllocatedPiastres = payments.reduce(
      (acc, p) => acc + this.toPiastres(p.amount),
      0
    );
    const differencePiastres = totalPiastres - totalAllocatedPiastres;
    return {
      valid: differencePiastres === 0,
      totalAllocatedPiastres,
      differencePiastres
    };
  }
}
