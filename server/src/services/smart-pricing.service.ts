import db from '../db/database';

export interface SmartPriceEstimate {
  deviceBrand: string;
  deviceModel: string;
  faultCategory: string;
  partCost: number;
  laborFee: number;
  difficultyMultiplier: number;
  recommendedRetailPrice: number;
  minimumAcceptablePrice: number;
  estimatedMarginEgp: number;
  marginPercentage: number;
}

export const smartPricingService = {
  /**
   * Dynamically estimates repair quotation based on fault complexity, part cost, and brand tiers
   */
  calculateRepairQuote(deviceBrand: string, deviceModel: string, faultCategory: string, partCost: number = 0.0): SmartPriceEstimate {
    // Base labor fees by fault category
    const baseLaborFees: Record<string, number> = {
      'SCREEN': 250.0,
      'BATTERY': 150.0,
      'CHARGING_PORT': 200.0,
      'CAMERA': 220.0,
      'BACK_GLASS': 300.0,
      'MOTHERBOARD_MICROSOLDERING': 650.0,
      'WATER_DAMAGE_CLEAN': 400.0
    };

    // Difficulty multipliers by brand tier
    const brandMultipliers: Record<string, number> = {
      'Apple': 1.35,
      'Samsung': 1.25,
      'Google': 1.20,
      'Xiaomi': 1.0,
      'Oppo': 1.0,
      'Realme': 0.95
    };

    const baseLabor = baseLaborFees[faultCategory.toUpperCase()] || 200.0;
    const diffMultiplier = brandMultipliers[deviceBrand] || 1.0;
    const adjustedLabor = Number((baseLabor * diffMultiplier).toFixed(2));

    // Parts markup calculation (35% default on spare part)
    const partMarkup = partCost > 0 ? Number((partCost * 0.35).toFixed(2)) : 0;
    const recommendedRetail = Number((partCost + partMarkup + adjustedLabor).toFixed(2));
    const minimumAcceptable = Number((partCost + (adjustedLabor * 0.75)).toFixed(2));
    const estimatedMargin = Number((recommendedRetail - partCost).toFixed(2));
    const marginPct = recommendedRetail > 0 ? Number(((estimatedMargin / recommendedRetail) * 100).toFixed(1)) : 0;

    return {
      deviceBrand,
      deviceModel,
      faultCategory,
      partCost,
      laborFee: adjustedLabor,
      difficultyMultiplier: diffMultiplier,
      recommendedRetailPrice: recommendedRetail,
      minimumAcceptablePrice: minimumAcceptable,
      estimatedMarginEgp: estimatedMargin,
      marginPercentage: marginPct
    };
  },

  calculateSmartEstimate(params: { device_brand: string; device_model: string; fault_category: string; parts_cost?: number }): SmartPriceEstimate {
    return this.calculateRepairQuote(params.device_brand, params.device_model, params.fault_category, params.parts_cost);
  }
};

export const SmartPricingEngine = smartPricingService;
