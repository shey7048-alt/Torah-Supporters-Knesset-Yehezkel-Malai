/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SizesMap {
  [sizeName: string]: number;
}

export interface ClothesItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  color: string;
  costPrice: number;
  sellPrice: number;
  minStock: number;
  imageUrl: string;
  sizes: SizesMap;
  dateAdded: string;
}

export interface SaleLog {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  qty: number;
  costPrice: number;
  sellPrice: number;
  profit: number;
  timestamp: string;
}

export interface SystemSettings {
  customLogoUrl: string;
  managerEmail: string;
  lowStockAlertActive: boolean;
  alertEmailSentFor: string[]; // itemIds that already notified to prevent spamming
  managerPassword?: string;
  hasSeededItems?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface DashboardStats {
  totalModels: number;
  totalQty: number;
  totalValue: number;
  lowStockCount: number;
  totalProfit: number;
}
