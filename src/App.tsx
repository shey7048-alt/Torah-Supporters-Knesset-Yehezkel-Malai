/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shirt, 
  Tag, 
  Layers, 
  Settings, 
  LogOut, 
  Plus, 
  Trash2, 
  Edit, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  X, 
  Search, 
  History, 
  SlidersHorizontal,
  Mail, 
  Bell, 
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { ClothesItem, SaleLog, SystemSettings, SizesMap } from './types';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

const logoUrl = "https://raw.githubusercontent.com/shey7048-alt/Torah-Supporters-Logo/refs/heads/main/%D7%9C%D7%95%D7%92%D7%95%20%D7%AA%D7%AA%20%D7%97%D7%93%D7%A9image%20(13).png";

// Helper to sum stock sizes cleanly and prevent aggregate type warnings
function sumStock(sizes: SizesMap): number {
  if (!sizes) return 0;
  return (Object.values(sizes) as number[]).reduce((sum, v) => sum + (v || 0), 0);
}

// Helper to resolve absolute API URLs for packaged Electron / desktop apps
const getApiUrl = (endpoint: string): string => {
  const isElectronOrLocalFile = window.location.protocol === 'file:' || window.navigator.userAgent.toLowerCase().includes('electron');
  if (isElectronOrLocalFile) {
    const fallbackProdUrl = 'https://ais-pre-yrb6u7pglhgu5zwfsfabqw-327994117025.europe-west2.run.app';
    return `${fallbackProdUrl}${endpoint}`;
  }
  return endpoint;
};

export default function App() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<boolean>(false);
  
  // Custom Email OTP login states
  const [loginMethod, setLoginMethod] = useState<'password' | 'email'>('password');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginCode, setLoginCode] = useState<string>('');
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpLoading, setOtpLoading] = useState<boolean>(false);

  // Application Data States
  const [inventory, setInventory] = useState<ClothesItem[]>([]);
  const [salesLogs, setSalesLogs] = useState<SaleLog[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    customLogoUrl: '',
    managerEmail: '',
    lowStockAlertActive: true,
    alertEmailSentFor: []
  });

  // UI Flow States
  const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'settings'>('inventory');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStockFilter, setSelectedStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'qty-desc' | 'qty-asc'>('newest');
  const [minusAction, setMinusAction] = useState<'sale' | 'correct'>('sale');
  const [logoError, setLogoError] = useState<boolean>(false);
  const [failedItemImageIds, setFailedItemImageIds] = useState<Record<string, boolean>>({});
  const [customLogoPreviewError, setCustomLogoPreviewError] = useState<boolean>(false);
  const [editingSizeQty, setEditingSizeQty] = useState<{ itemId: string; sizeName: string } | null>(null);
  const [editQtyValue, setEditQtyValue] = useState<string>('');

  // Modals management
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState<boolean>(false);
  const [currentlyEditingItem, setCurrentlyEditingItem] = useState<ClothesItem | null>(null);

  // Form Fields representation
  const [formName, setFormName] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formColor, setFormColor] = useState<string>('');
  const [formCost, setFormCost] = useState<number>(0);
  const [formSell, setFormSell] = useState<number>(0);
  const [formMinStock, setFormMinStock] = useState<number>(5);
  const [formImage, setFormImage] = useState<string>('');
  const [formSizes, setFormSizes] = useState<{ name: string; qty: number }[]>([]);

  // Category addition helper
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  // Toast System
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  // Change password verification states
  const [isPwdOtpSent, setIsPwdOtpSent] = useState<boolean>(false);
  const [isPwdOtpLoading, setIsPwdOtpLoading] = useState<boolean>(false);
  const [pwdOtpCode, setPwdOtpCode] = useState<string>('');
  const [isPwdEmailVerified, setIsPwdEmailVerified] = useState<boolean>(false);
  const [isPwdVerifyLoading, setIsPwdVerifyLoading] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');

  // Local settings editing states to prevent input lag/stutters on keypress
  const [localManagerEmail, setLocalManagerEmail] = useState<string>('');
  const [localLowStockAlertActive, setLocalLowStockAlertActive] = useState<boolean>(true);

  // Date picker states for Sales Log export
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');

  // Offline status handler
  const [isOnline, setIsOnline] = useState<boolean>(navigator ? navigator.onLine : true);

  // Trigger Toast notifications helper
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Track internet connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerToast('חיבור האינטרנט חזר! הנתונים מסונכרנים כעת.', 'success');
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Sync settings database values to local manager settings state for performance
  useEffect(() => {
    if (settings) {
      setLocalManagerEmail(settings.managerEmail || '');
      setLocalLowStockAlertActive(settings.lowStockAlertActive ?? true);
    }
  }, [settings]);

  // Initialization and Fetching from Firestore (Real-time Sync)
  useEffect(() => {
    const isLogged = sessionStorage.getItem('warehouse_is_logged') === 'true';
    if (isLogged) {
      setIsAuthenticated(true);
    }
    
    // items live onSnapshot (Clean subscription - no re-seeding recursion on empty items)
    const unsubscribeItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      const itemsList: ClothesItem[] = [];
      snapshot.forEach((docSnap) => {
        itemsList.push({ id: docSnap.id, ...docSnap.data() } as ClothesItem);
      });
      itemsList.sort((a, b) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime());
      setInventory(itemsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'items');
    });

    // sales live onSnapshot
    const unsubscribeSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: SaleLog[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push({ id: docSnap.id, ...docSnap.data() } as SaleLog);
      });
      salesList.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      setSalesLogs(salesList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    // settings live onSnapshot with safe server-side blank database management
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SystemSettings & { categories?: string[] };
        setSettings(data);
        if (data.categories) {
          // Automatic A-Z alphabetic sorting for all categories in Hebrew locale
          setCategories([...data.categories].sort((a, b) => a.localeCompare(b, 'he')));
        } else {
          setCategories([]);
        }
      } else {
        // Initial setup schema for central server database config
        const defaultSet: SystemSettings & { categories?: string[] } = {
          customLogoUrl: logoUrl,
          managerEmail: "sp9328008@gmail.com",
          lowStockAlertActive: true,
          alertEmailSentFor: [],
          hasSeededItems: true, // Bypass seeding completely
          managerPassword: '1234',
          categories: [] // Clean empty slate managed server-side
        };
        setDoc(doc(db, 'settings', 'config'), defaultSet).catch(err => {
          handleFirestoreError(err, OperationType.CREATE, 'settings/config');
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/config');
    });

    return () => {
      unsubscribeItems();
      unsubscribeSales();
      unsubscribeSettings();
    };
  }, []);

  // Auth processing
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginMethod === 'password') {
      const dbPassword = settings.managerPassword || '1234';
      if (password === dbPassword) {
        sessionStorage.setItem('warehouse_is_logged', 'true');
        setIsAuthenticated(true);
        setAuthError(false);
        triggerToast('התחברת לחשבון בהצלחה!', 'success');
      } else {
        setAuthError(true);
        triggerToast('סיסמת כניסה שגויה, נסה שוב', 'error');
      }
    } else {
      // Email OTP code authentication - uses the system's fixed email
      const emailToUse = (settings.managerEmail || 'sp9328008@gmail.com').toLowerCase().trim();
      if (!loginCode) {
        triggerToast('נא להזין קוד אימות', 'error');
        return;
      }
      try {
        const res = await fetch(getApiUrl('/api/verify-auth-code'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailToUse, code: loginCode })
        });
        if (res.ok) {
          sessionStorage.setItem('warehouse_is_logged', 'true');
          setIsAuthenticated(true);
          setAuthError(false);
          triggerToast('התחברת בהצלחה באמצעות קוד אימות!', 'success');
        } else {
          const errData = await res.json().catch(() => ({}));
          triggerToast(errData.error || 'קוד אימות שגוי או פג תוקפו', 'error');
        }
      } catch (err) {
        console.error(err);
        triggerToast('שגיאה בתקשורת עם השרת לצורך אימות', 'error');
      }
    }
  };

  const handleSendOtp = async () => {
    const emailToUse = (settings.managerEmail || 'sp9328008@gmail.com').toLowerCase().trim();
    setOtpLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/send-auth-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse })
      });
      if (res.ok) {
        setOtpSent(true);
        triggerToast('קוד אימות נשלח לתיבת המייל של המנהל הרשום!', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'שגיאה בשליחת קוד אימות', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה בחיבור לשרת לצורך שליחת קוד', 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('warehouse_is_logged');
    setIsAuthenticated(false);
    setPassword('');
    setLoginCode('');
    setOtpSent(false);
    triggerToast('התנתקת מחשבון הניהול', 'info');
  };

  // Quick addition and subtraction in inventory Matrix
  const handleQuickStockChange = async (itemArg: ClothesItem, sizeName: string, delta: number) => {
    // Look up freshest state to dodge asynchronous multi-click race conditions and stales
    const item = inventory.find(i => i.id === itemArg.id) || itemArg;
    const currentQty = item.sizes[sizeName] || 0;
    const newQty = currentQty + delta;

    if (newQty < 0) {
      triggerToast('המלאי אינו יכול לרדת מתחת ל-0', 'error');
      return;
    }

    // Prepare updated size map and cast all numeric fields properly to keep Firestore validation rules green
    const updatedSizes = { ...item.sizes, [sizeName]: newQty };
    const updatedItem: ClothesItem = {
      ...item,
      costPrice: Number(item.costPrice),
      sellPrice: Number(item.sellPrice),
      minStock: Number(item.minStock),
      sizes: updatedSizes
    };

    if (delta === -1 && minusAction === 'sale') {
      // Process registered Sale
      const saleId = `sale-${Date.now()}`;
      const sale: SaleLog = {
        id: saleId,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        size: sizeName,
        qty: 1,
        costPrice: Number(item.costPrice),
        sellPrice: Number(item.sellPrice),
        profit: Number(item.sellPrice) - Number(item.costPrice),
        timestamp: new Date().toISOString()
      };

      try {
        // Atomic-like sequential writes via Firestore Client
        await setDoc(doc(db, 'sales', saleId), sale);
        await setDoc(doc(db, 'items', item.id), updatedItem);

        triggerToast(`נרשמה מכירה! 🛒 ${item.name} (${sizeName}). רווח: ₪${sale.profit}`, 'success');

        // Low stock alerter trigger to Node.js backend proxy
        const totalStock = sumStock(updatedItem.sizes);
        const alertKey = `${item.id}-${sizeName}`;
        if (newQty <= item.minStock && settings.lowStockAlertActive && !settings.alertEmailSentFor.includes(alertKey)) {
          fetch(getApiUrl('/api/send-alert'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              item: updatedItem, 
              sizeName, 
              currentQty: newQty, 
              totalStock,
              managerEmail: settings.managerEmail
            })
          })
          .then(async (res) => {
            if (res.ok) {
              // Mark email as sent to prevent duplicates ONLY if it sent successfully!
              const updatedAlertKeys = [...settings.alertEmailSentFor, alertKey];
              await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys, hasSeededItems: settings.hasSeededItems ?? true });
              triggerToast(`נשלחה התראת חוסר במלאי למייל המנהל!`, 'info');
              console.log("Low stock alert email sent successfully.");
            } else {
              const errData = await res.json().catch(() => ({}));
              console.error("SMTP stock alert failed on server:", errData.error);
              triggerToast(`נכשל שליחת אימייל התראת מלאי: ${errData.error || 'בדוק הגדרות במערכת'}`, 'warning');
            }
          })
          .catch((err) => {
            console.error("Failed to notify backend SMTP low stock watcher due to network error:", err);
            triggerToast(`שגיאת תקשורת בשליחת דוא״ל: ${err.message || err}`, 'error');
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `sales/${saleId} or items/${item.id}`);
        triggerToast('שגיאה ברישום המכירה במאגר', 'error');
      }
    } else {
      // Normal adjustment/correction update
      try {
        await setDoc(doc(db, 'items', item.id), updatedItem);
        if (delta === -1) {
          triggerToast(`בוצעה הגרת עודפים לתל"ח 🔧 ${item.name} (${sizeName})`, 'info');
        } else {
          triggerToast(`נוסף פריט 1 למלאי של ${item.name} (${sizeName})`, 'success');
        }

        // Check if stock is restocked above minStock to clear duplicate alert lock
        const alertKey = `${item.id}-${sizeName}`;
        if (newQty > item.minStock && settings.alertEmailSentFor.includes(alertKey)) {
          const updatedAlertKeys = settings.alertEmailSentFor.filter(k => k !== alertKey);
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys, hasSeededItems: settings.hasSeededItems ?? true });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `items/${item.id}`);
        triggerToast('שגיאה בעדכון כמות המלאי', 'error');
      }
    }
  };

  const formatPrice = (val: number) => {
    return Number(val).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const handleDirectQtyChange = async (itemArg: ClothesItem, sizeName: string, newQty: number) => {
    // Look up freshest state to dodge asynchronous multi-click race conditions and stales
    const item = inventory.find(i => i.id === itemArg.id) || itemArg;
    const currentQty = item.sizes[sizeName] || 0;
    if (newQty === currentQty) return;
    if (newQty < 0) {
      triggerToast('המלאי אינו יכול לרדת מתחת ל-0', 'error');
      return;
    }

    const updatedSizes = { ...item.sizes, [sizeName]: newQty };
    const updatedItem: ClothesItem = { 
      ...item, 
      costPrice: Number(item.costPrice),
      sellPrice: Number(item.sellPrice),
      minStock: Number(item.minStock),
      sizes: updatedSizes 
    };

    const diff = currentQty - newQty;

    if (diff > 0 && minusAction === 'sale') {
      const saleId = `sale-${Date.now()}`;
      const sale: SaleLog = {
        id: saleId,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        size: sizeName,
        qty: diff,
        costPrice: Number(item.costPrice),
        sellPrice: Number(item.sellPrice),
        profit: diff * (Number(item.sellPrice) - Number(item.costPrice)),
        timestamp: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'sales', saleId), sale);
        await setDoc(doc(db, 'items', item.id), updatedItem);

        triggerToast(`נרשמה מכירה! 🛒 ${item.name} (${sizeName}) × ${diff} יח׳. רווח: ₪${(sale.profit).toFixed(2)}`, 'success');

        const totalStock = sumStock(updatedItem.sizes);
        const alertKey = `${item.id}-${sizeName}`;
        if (newQty <= item.minStock && settings.lowStockAlertActive && !settings.alertEmailSentFor.includes(alertKey)) {
          fetch(getApiUrl('/api/send-alert'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              item: updatedItem, 
              sizeName, 
              currentQty: newQty, 
              totalStock,
              managerEmail: settings.managerEmail
            })
          })
          .then(async (res) => {
            if (res.ok) {
              const updatedAlertKeys = [...settings.alertEmailSentFor, alertKey];
              await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys, hasSeededItems: settings.hasSeededItems ?? true });
              triggerToast(`נשלחה התראת חוסר במלאי למייל המנהל!`, 'info');
              console.log("Low stock alert email sent successfully.");
            } else {
              const errData = await res.json().catch(() => ({}));
              console.error("SMTP alert failure:", errData.error);
            }
          })
          .catch((err) => {
            console.error("Network error sending low stock notification:", err);
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `sales/${saleId} or items/${item.id}`);
        triggerToast('שגיאה ברישום המכירה במאגר', 'error');
      }
    } else {
      try {
        await setDoc(doc(db, 'items', item.id), updatedItem);
        triggerToast(`המלאי של ${item.name} (${sizeName}) עודכן ל-${newQty} יח׳`, 'success');

        const alertKey = `${item.id}-${sizeName}`;
        if (newQty > item.minStock && settings.alertEmailSentFor.includes(alertKey)) {
          const updatedAlertKeys = settings.alertEmailSentFor.filter(k => k !== alertKey);
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys, hasSeededItems: settings.hasSeededItems ?? true });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `items/${item.id}`);
        triggerToast('שגיאה בעדכון כמות המלאי', 'error');
      }
    }
  };

  // Image upload base64 encoding with canvas compression to ensure it stays well below Firestore's 1MB limit
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setFormImage(dataUrl);
          triggerToast('התמונה הועלתה והותאמה בהצלחה לתצוגה מקדימה!', 'success');
        } else {
          // Fallback if canvas ctx fails
          setFormImage(img.src);
          triggerToast('התמונה הועלתה בהצלחה לתצוגה מקדימה!', 'success');
        }
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  // Adaptive uploader for the logo image with automatic canvas compression
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    triggerToast('מעבד את קובץ הלוגו...', 'info');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 450;
        const MAX_HEIGHT = 150; // Logos are wider than taller
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png'); // Keeps transparency intact
          setSettings({ ...settings, customLogoUrl: dataUrl });
          triggerToast('סמל הלוגו הועלה ועובד בהצלחה! שמור את הטבלה לעדכון לצמיתות במאגר.', 'success');
        } else {
          const result = event.target?.result as string;
          setSettings({ ...settings, customLogoUrl: result });
          triggerToast('סמל הלוגו הועלה בהצלחה!', 'success');
        }
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  // Sizes management inside Form
  const addFormSizeRow = (size = '', qty = 0) => {
    setFormSizes([...formSizes, { name: size, qty }]);
  };

  const removeFormSizeRow = (index: number) => {
    setFormSizes(formSizes.filter((_, i) => i !== index));
  };

  const updateFormSizeName = (index: number, name: string) => {
    const next = [...formSizes];
    next[index].name = name;
    setFormSizes(next);
  };

  const updateFormSizeQty = (index: number, qty: number) => {
    const next = [...formSizes];
    next[index].qty = qty;
    setFormSizes(next);
  };

  // Opening the Modal for Adding/Editing Clothes models
  const openItemModal = (item: ClothesItem | null = null) => {
    if (item) {
      setCurrentlyEditingItem(item);
      setFormName(item.name);
      setFormSku(item.sku);
      setFormCategory(item.category);
      setFormColor(item.color);
      setFormCost(item.costPrice);
      setFormSell(item.sellPrice);
      setFormMinStock(item.minStock);
      setFormImage(item.imageUrl);
      
      const sizesArray = Object.entries(item.sizes).map(([name, qty]) => ({ name, qty }));
      setFormSizes(sizesArray.length > 0 ? sizesArray : [{ name: 'כללי', qty: 0 }]);
    } else {
      setCurrentlyEditingItem(null);
      setFormName('');
      setFormSku('');
      setFormCategory(categories[0] || 'חולצות');
      setFormColor('');
      setFormCost(0);
      setFormSell(0);
      setFormMinStock(5);
      setFormImage('');
      setFormSizes([
        { name: 'S', qty: 0 },
        { name: 'M', qty: 0 },
        { name: 'L', qty: 0 }
      ]);
    }
    setIsItemModalOpen(true);
  };

  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setCurrentlyEditingItem(null);
  };

  // Form Submission handles Add/Edit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formCategory) {
      triggerToast('אנא בחר קטגוריה חוקית', 'error');
      return;
    }

    // Reconstruct sizes map
    const sizesMap: SizesMap = {};
    formSizes.forEach(row => {
      const cleanName = row.name.trim();
      if (cleanName) {
        sizesMap[cleanName] = Number(row.qty);
      }
    });

    if (Object.keys(sizesMap).length === 0) {
      sizesMap['כללי'] = 0;
    }

    try {
      if (currentlyEditingItem) {
        // Edit flow
        const payload: ClothesItem = {
          ...currentlyEditingItem,
          name: formName.trim(),
          sku: formSku.trim().toUpperCase(),
          category: formCategory,
          color: formColor.trim(),
          costPrice: Number(formCost),
          sellPrice: Number(formSell),
          minStock: Number(formMinStock),
          imageUrl: formImage,
          sizes: sizesMap
        };

        await setDoc(doc(db, 'items', currentlyEditingItem.id), payload);

        // Check and clear alert keys if editing restocked sizes above minStock
        let updatedAlertKeys = [...settings.alertEmailSentFor];
        Object.keys(payload.sizes).forEach(size => {
          const q = payload.sizes[size] || 0;
          const key = `${currentlyEditingItem.id}-${size}`;
          if (q > payload.minStock && updatedAlertKeys.includes(key)) {
            updatedAlertKeys = updatedAlertKeys.filter(k => k !== key);
          }
        });
        if (updatedAlertKeys.length !== settings.alertEmailSentFor.length) {
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys, hasSeededItems: settings.hasSeededItems ?? true });
        }

        triggerToast('הדגם עודכן ברחבי מסד הנתונים בהצלחה!', 'success');
        closeItemModal();
      } else {
        // Add flow
        const itemId = `item-${Date.now()}`;
        const payload: ClothesItem = {
          id: itemId,
          name: formName.trim(),
          sku: formSku.trim().toUpperCase(),
          category: formCategory,
          color: formColor.trim(),
          costPrice: Number(formCost),
          sellPrice: Number(formSell),
          minStock: Number(formMinStock),
          imageUrl: formImage,
          sizes: sizesMap,
          dateAdded: new Date().toISOString()
        };

        await setDoc(doc(db, 'items', itemId), payload);
        triggerToast('הדגם החדש נרשם ונוסף בהצלחה!', 'success');
        closeItemModal();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'items');
      triggerToast('שגיאה בשמירת הפריט במערכת', 'error');
    }
  };

  // Item Delete Confirmation
  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (confirm(`האם אתה בטוח שברצונך למחוק לצמיתות את דגם הבגד "${itemName}"?`)) {
      try {
        await deleteDoc(doc(db, 'items', itemId));
        triggerToast(`הדגם "${itemName}" נמחק לצמיתות`, 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `items/${itemId}`);
        triggerToast('שגיאה במחיקת הבגד מהמערכת', 'error');
      }
    }
  };

  // Settings Save updates
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedSettings = {
        ...settings,
        managerEmail: localManagerEmail.trim(),
        lowStockAlertActive: localLowStockAlertActive,
        hasSeededItems: settings.hasSeededItems ?? true
      };
      await setDoc(doc(db, 'settings', 'config'), updatedSettings);
      setLogoError(false);
      triggerToast('הגדרות המיתוג והתראות המייל עודכנו!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/config');
      triggerToast('שגיאה בשמירת ההגדרות', 'error');
    }
  };

  const handleSendTestEmail = async () => {
    if (!settings.managerEmail) {
      triggerToast('נא להגדיר כתובת אימייל תחילה', 'warning');
      return;
    }
    triggerToast('שולח דוא"ל בדיקה...', 'info');
    try {
      const res = await fetch(getApiUrl('/api/send-alert'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          item: {
            name: "בדיקת מערכת - התראת מלאי תקינה",
            sku: "TEST-SKU-99",
            color: "לבן",
            minStock: 5,
            sizes: { "M": 3 }
          }, 
          sizeName: "M", 
          currentQty: 3, 
          totalStock: 3,
          managerEmail: settings.managerEmail
        })
      });
      if (res.ok) {
        triggerToast('מייל בדיקה נשלח בהצלחה לכתובת המייל!', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'שגיאה בשליחת מייל הבדיקה', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה בשליחת מייל הבדיקה', 'error');
    }
  };

  // Change password verification flows
  const handleSendPwdOtp = async () => {
    const emailToUse = (settings.managerEmail || 'sp9328008@gmail.com').toLowerCase().trim();
    setIsPwdOtpLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/send-auth-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse })
      });
      if (res.ok) {
        setIsPwdOtpSent(true);
        triggerToast('קוד אימות לשינוי סיסמה נשלח למייל בהצלחה!', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'שגיאה בשליחת קוד אימות', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה בשליחת קוד אימות', 'error');
    } finally {
      setIsPwdOtpLoading(false);
    }
  };

  const handleVerifyPwdOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToUse = (settings.managerEmail || 'sp9328008@gmail.com').toLowerCase().trim();
    if (!pwdOtpCode.trim()) {
      triggerToast('אנא הזן קוד אימות', 'warning');
      return;
    }
    setIsPwdVerifyLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/verify-auth-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse, code: pwdOtpCode })
      });
      if (res.ok) {
        setIsPwdEmailVerified(true);
        triggerToast('האימייל אומת בהצלחה! כעת מוצגת הסיסמה הישנה ותוכל להחליפה.', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'קוד אימות שגוי או פג תוקפו', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה במהלך האימות', 'error');
    } finally {
      setIsPwdVerifyLoading(false);
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmNewPassword) {
      triggerToast('אנא מלא את כל השדות', 'warning');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      triggerToast('הסיסמאות החדשות אינן תואמות!', 'error');
      return;
    }
    if (newPassword.length < 4) {
      triggerToast('הסיסמה החדשה חייבת להכיל לפחות 4 תווים', 'warning');
      return;
    }

    try {
      const updatedSettings = { ...settings, managerPassword: newPassword, hasSeededItems: settings.hasSeededItems ?? true };
      await setDoc(doc(db, 'settings', 'config'), updatedSettings);
      setSettings(updatedSettings);
      triggerToast('סיסמת המנהל עודכנה בהצלחה בתוך Firebase!', 'success');
      // Reset password change UI state
      setIsPwdEmailVerified(false);
      setIsPwdOtpSent(false);
      setPwdOtpCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה בשמירת הסיסמה ב-Firebase', 'error');
    }
  };

  // Add category handler
  const handleAddCategory = async () => {
    const clean = newCategoryName.trim();
    if (!clean) return;
    if (categories.includes(clean)) {
      triggerToast('קטגוריה זו כבר קיימת במערכת', 'warning');
      return;
    }
    const updatedCategories = [...categories, clean].sort((a, b) => a.localeCompare(b, 'he'));
    try {
      await setDoc(doc(db, 'settings', 'config'), {
        ...settings,
        categories: updatedCategories,
        hasSeededItems: settings.hasSeededItems ?? true
      });
      setNewCategoryName('');
      triggerToast(`הקטגוריה "${clean}" נוספה בהצלחה!`, 'success');
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה בשמירת הקטגוריה בשרת', 'error');
    }
  };

  // Delete category handler
  const handleDeleteCategory = async (catToDelete: string) => {
    if (catToDelete === 'אחר') return;
    const updatedCategories = categories.filter(c => c !== catToDelete).sort((a, b) => a.localeCompare(b, 'he'));
    try {
      await setDoc(doc(db, 'settings', 'config'), {
        ...settings,
        categories: updatedCategories,
        hasSeededItems: settings.hasSeededItems ?? true
      });
      triggerToast(`הקטגוריה "${catToDelete}" נמחקה בהצלחה מהשרת!`, 'success');
    } catch (err) {
      console.error(err);
      triggerToast('שגיאה במחיקת הקטגוריה מהשרת', 'error');
    }
  };

  // Reset entire metrics database backup or local profit
  const handleResetProfit = async () => {
    if (confirm('האם לאפס את חישוב הרווח המצטבר ממכירות ל-0 ₪? שינוי זה ינקה גם את יומן התנועות.')) {
      try {
        await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: [], hasSeededItems: settings.hasSeededItems ?? true });
        // Clean out sales documents
        for (const log of salesLogs) {
          await deleteDoc(doc(db, 'sales', log.id));
        }
        triggerToast('הרווח המצטבר ויומן המכירות שוחזרו לערך ברירת המחדל', 'info');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/config');
      }
    }
  };

  // CSV Spreadsheet Export Engine
  const handleExportCSV = () => {
    if (inventory.length === 0) {
      triggerToast('אין מוצרים זמינים לייצוא', 'error');
      return;
    }

    let csvContent = "\uFEFF"; // Hebrew UTF-8 Byte Order Mark
    // Retrieve all sizes keys historically used
    const allSizes = new Set<string>();
    inventory.forEach(item => {
      Object.keys(item.sizes).forEach(s => allSizes.add(s));
    });
    const sizesArray = Array.from(allSizes);

    // Header values
    csvContent += "מק\"ט,דגם בגד,קטגוריה,צבע,עלות ספק (₪),מחיר מכירה (₪),";
    sizesArray.forEach(s => {
      csvContent += `${s},`;
    });
    csvContent += "סה\"כ מלאי,שווי מלאי\n";

    // Item rows
    inventory.forEach(item => {
      const totalAmount = sumStock(item.sizes);
      const totalVal = totalAmount * item.costPrice;
      const cleanName = item.name.replace(/"/g, '""');
      const cleanCat = item.category.replace(/"/g, '""');
      const cleanColor = item.color.replace(/"/g, '""');

      csvContent += `"${item.sku}","${cleanName}","${cleanCat}","${cleanColor}",${item.costPrice},${item.sellPrice},`;
      
      sizesArray.forEach(s => {
        const q = item.sizes[s] !== undefined ? item.sizes[s] : 0;
        csvContent += `${q},`;
      });

      csvContent += `${totalAmount},${totalVal}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `דוח_מלאי_כנסת_יחזקאל_${new Date().toLocaleDateString('he-IL').replace(/\//g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('קובץ Excel (.CSV) הופק בהצלחה!', 'success');
  };

  // Sales Log Spreadsheet Export Engine with full date range filtering capabilities
  const handleExportSalesCSV = (useDateRange: boolean) => {
    let filteredLogs = [...salesLogs];

    if (useDateRange) {
      if (!exportStartDate && !exportEndDate) {
        triggerToast('נא לבחור תאריכים לסינון הייצוא', 'warning');
        return;
      }
      if (exportStartDate) {
        const start = new Date(exportStartDate);
        start.setHours(0, 0, 0, 0);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= start);
      }
      if (exportEndDate) {
        const end = new Date(exportEndDate);
        end.setHours(23, 59, 59, 999);
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= end);
      }
    }

    if (filteredLogs.length === 0) {
      triggerToast('אין תנועות מכירה לייצוא תחת ההגדרות שנבחרו', 'warning');
      return;
    }

    let csvContent = "\uFEFF"; // Hebrew UTF-8 Byte Order Mark
    // Header Row
    csvContent += "תאריך ושעה,דגם מוצר,מק\"ט (SKU),מידה,כמות,עלות יחידה (₪),מכירה יחידה (₪),סה\"כ עלות (₪),סה\"כ פדיון (₪),רווח נקי (₪)\n";

    // Data Rows
    filteredLogs.forEach(log => {
      const formattedDate = new Date(log.timestamp).toLocaleString('he-IL');
      const cleanName = log.itemName.replace(/"/g, '""');
      const qty = log.qty || 1;
      const totalCost = qty * log.costPrice;
      const totalRevenue = qty * log.sellPrice;
      const totalProfit = log.profit;

      csvContent += `"${formattedDate}","${cleanName}","${log.sku}","${log.size}",${qty},${log.costPrice},${log.sellPrice},${totalCost},${totalRevenue},${totalProfit}\n`;
    });

    const filename = useDateRange 
      ? `דוח_מכירות_תאריכים_${exportStartDate || 'התחלה'}_עד_${exportEndDate || 'סוף'}.csv` 
      : 'דוח_מכירות_מלא.csv';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast(`יומן המכירות יוצא בהצלחה! (${filteredLogs.length} שורות)`, 'success');
  };

  // JSON Full Database Backup & Restore operations
  const handleBackupExport = () => {
    const backupObj = {
      inventory,
      salesLogs,
      settings
    };

    const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj));
    const link = document.createElement("a");
    link.href = str;
    link.setAttribute("download", `מחסן_בגדים_גיבוי_מערכת_${new Date().toLocaleDateString('he-IL').replace(/\//g, '_')}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('קובץ גיבוי מערכת (JSON) המורד בהצלחה!', 'success');
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string);
        if (raw && (Array.isArray(raw.inventory) || raw.inventory)) {
          const importedItems = raw.inventory || [];
          const importedSales = raw.salesLogs || [];
          const importedSettings = raw.settings || null;

          // Push data arrays directly to Firestore
          if (importedItems.length > 0) {
            for (const item of importedItems) {
              await setDoc(doc(db, 'items', item.id), item);
            }
          }

          if (importedSales.length > 0) {
            for (const sale of importedSales) {
              await setDoc(doc(db, 'sales', sale.id), sale);
            }
          }

          if (importedSettings) {
            await setDoc(doc(db, 'settings', 'config'), { ...importedSettings, hasSeededItems: true });
          }

          triggerToast('שחזור מגיבוי הושלם בהצלחה!', 'success');
        } else {
          triggerToast('קובץ גיבוי לא תקין', 'error');
        }
      } catch (err) {
        console.error(err);
        triggerToast('קובץ JSON אינו תקני', 'error');
      }
    };
    reader.readAsText(file);
  };

  // UI Filtering analytics calculation
  const filteredAndSortedItems = inventory.filter(item => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      item.name.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      item.color.toLowerCase().includes(term);

    const matchesCategory = !selectedCategory || item.category === selectedCategory;

    const totalQty = sumStock(item.sizes);
    let matchesStock = true;
    if (selectedStockFilter === 'low') {
      matchesStock = totalQty <= item.minStock;
    } else if (selectedStockFilter === 'out') {
      matchesStock = totalQty === 0;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  filteredAndSortedItems.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'he');
    }
    const totalA = sumStock(a.sizes);
    const totalB = sumStock(b.sizes);

    if (sortBy === 'qty-desc') return totalB - totalA;
    if (sortBy === 'qty-asc') return totalA - totalB;
    
    // Default newest
    return new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime();
  });

  // KPI Calculations
  const totalModelsCount = inventory.length;
  const totalGarmentsCount = inventory.reduce((sum, item) => {
    return sum + sumStock(item.sizes);
  }, 0);
  const totalWholesaleValue = inventory.reduce((sum, item) => {
    const qty = sumStock(item.sizes);
    return sum + (qty * item.costPrice);
  }, 0);
  const lowStockModelsCount = inventory.filter(item => {
    const qty = sumStock(item.sizes);
    return qty <= item.minStock;
  }).length;
  const totalAccumulatedProfit = salesLogs.reduce((sum, log) => sum + log.profit, 0);

  // Logo fallback handler
  const activeLogoUrl = logoUrl;

  // Reset errors on logo configuration change
  useEffect(() => {
    setLogoError(false);
  }, [activeLogoUrl]);

  useEffect(() => {
    setCustomLogoPreviewError(false);
  }, [settings.customLogoUrl]);

  // Unified premium logo renderer with safe fallback
  const renderLogo = (sizeCls: string = "h-24") => {
    if (logoError) {
      return (
        <div className="flex flex-col items-center justify-center -space-y-0.5 border border-amber-300 bg-amber-50/50 rounded-2xl p-3 shadow-inner text-center font-bold select-none min-w-[130px] max-w-[160px] mx-auto">
          <span className="text-base font-black text-slate-900 tracking-widest">ת"ת</span>
          <span className="text-[10px] text-amber-600 font-extrabold whitespace-nowrap">כנסת יחזקאל</span>
        </div>
      );
    }
    return (
      <img 
        src={activeLogoUrl} 
        alt="לוגו תת כנסת יחזקאל" 
        referrerPolicy="no-referrer"
        className={`${sizeCls} w-auto object-contain mx-auto transition-all duration-300`}
        onError={() => setLogoError(true)}
      />
    );
  };

  // RENDER INTERFACE
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
        {/* Subtle decorative background lights in light theme */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-400/5 rounded-full filter blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

        {/* Toast notifications */}
        {toast && (
          <div className="fixed top-5 left-5 z-50 max-w-sm w-full transition-all duration-300">
            <div className={`p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-white ${
              toast.type === 'error' ? 'bg-rose-600 border-rose-500' :
              toast.type === 'warning' ? 'bg-amber-600 border-amber-500' :
              toast.type === 'info' ? 'bg-slate-900 border-slate-800' : 'bg-emerald-600 border-emerald-500'
            }`}>
              <span className="text-sm font-semibold">{toast.message}</span>
              <button onClick={() => setToast(null)} className="text-white hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-[0_32px_80px_-16px_rgba(148,163,184,0.3)] p-8 max-w-md w-full border border-slate-100 relative overflow-hidden transition-all duration-300">
          {/* Top aesthetic gold gradient trim */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600"></div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-5 p-2.5 bg-slate-50/50 rounded-2xl border border-slate-100 shadow-inner w-44 h-24 overflow-hidden">
              {renderLogo("h-16")}
            </div>
            
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5">חדר מכירות ת"ת כנסת יחזקאל</h1>
            <p className="text-slate-500 text-xs font-bold">מערכת בקרת מלאי וכניסה מאובטחת</p>
          </div>

          {/* Login tab switcher */}
          <div className="flex bg-slate-100/80 p-1 rounded-2xl mb-6 border border-slate-250/20">
            <button
              onClick={() => { setLoginMethod('password'); setAuthError(false); }}
              className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold transition-all duration-150 cursor-pointer ${loginMethod === 'password' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              התחברות עם סיסמה
            </button>
            <button
              onClick={() => { setLoginMethod('email'); setAuthError(false); }}
              className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold transition-all duration-150 cursor-pointer ${loginMethod === 'email' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
            >
              אימות במייל (OTP)
            </button>
          </div>

          {loginMethod === 'password' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">סיסמת מנהל כניסה</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="הזן סיסמת מפתח..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 focus:bg-white text-center tracking-widest text-lg font-black transition-all text-slate-850"
                    required
                  />
                </div>
                {authError && (
                  <p className="text-rose-600 text-xs mt-2.5 flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span>סיסמה שגויה, אנא נסו שוב.</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-extrabold py-3 px-4 rounded-2xl shadow-lg border border-amber-500/20 hover:border-amber-400/50 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <span>כניסה למערכת המלאי</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <div className="bg-amber-50/50 border border-amber-200/40 p-4 rounded-2xl text-center mb-4">
                  <span className="block text-xs text-slate-500 mb-1.5">קוד האימות החד-פעמי יישלח לכתובת המייל המוגדרת:</span>
                  <strong className="block text-sm text-slate-800 font-extrabold tracking-wide break-all">
                    {settings.managerEmail || 'sp9328008@gmail.com'}
                  </strong>
                </div>

                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-extrabold py-3 px-4 rounded-2xl shadow-lg border border-amber-500/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm mb-2"
                  >
                    {otpLoading ? 'מחולל קוד ושולח...' : 'שלח קוד אימות חד-פעמי למייל'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <span className="text-xs text-emerald-700 font-bold text-center block bg-emerald-50 py-2.5 px-3 rounded-xl border border-emerald-100">
                      ✓ קוד אימות נשלח בהצלחה לתיבת הדואר שלכם!
                    </span>
                    
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-500">הזן קוד אימות (6 ספרות)</label>
                        <button
                          type="button"
                          onClick={() => { setOtpSent(false); setLoginCode(''); }}
                          className="text-xs text-amber-600 hover:text-amber-700 font-bold transition-colors"
                        >
                          שליחה מחדש
                        </button>
                      </div>
                      <input 
                        type="text"
                        maxLength={6}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        placeholder="------"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 focus:bg-white text-center tracking-[8px] text-lg font-black text-slate-800"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!otpSent}
                className="w-full bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold py-3 px-4 rounded-2xl shadow-lg border border-amber-500/20 hover:border-amber-400/55 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <span>אמת קוד והתחבר לממשק</span>
              </button>
            </form>
          )}

          <div className="text-center mt-8 text-[11px] text-slate-400 font-semibold border-t border-slate-100 pt-4">
            כל הזכויות שמורות לת"ת כנסת יחזקאל &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 flex flex-col bg-slate-50/50" dir="rtl">
      
      {/* Non-dismissible network blackout blocker overlay */}
      {!isOnline && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center select-none" dir="rtl">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-amber-500/20">
            <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-10 w-10 text-rose-600 animate-bounce" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">נותק חיבור האינטרנט</h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              המערכת איבדה את החיבור לרשת האינטרנט.
              כדי למנוע שגיאות סנכרון של המלאי והמכירות, השימוש בממשק נעול באופן זמני עד לחידוש החיבור מול שרת הענן.
            </p>
            <div className="flex items-center justify-center gap-2 bg-slate-50 py-2.5 px-4 rounded-xl border border-slate-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-600">מנסה להתחבר מחדש למסד הנתונים...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast systems */}
      {toast && (
        <div className="fixed top-5 left-5 z-50 max-w-sm w-full transition-all duration-300">
          <div className={`p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-white ${
            toast.type === 'error' ? 'bg-rose-600 border-rose-500' :
            toast.type === 'warning' ? 'bg-amber-600 border-amber-500' :
            toast.type === 'info' ? 'bg-slate-900 border-slate-800' : 'bg-emerald-600 border-emerald-500'
          }`}>
            <span className="text-sm font-semibold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-white hover:text-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main header block in Royal Prestige Light Theme */}
      <header className="bg-white text-slate-950 border-b border-amber-200/60 sticky top-0 z-40 shadow-[0_4px_24px_rgba(148,163,184,0.06)]">
        {/* Subtle decorative gold streak */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 w-full"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-22">
            <div className="flex items-center gap-4 py-2">
              <div className="flex items-center min-w-[65px] h-14 justify-center p-1.5 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner overflow-hidden">
                {renderLogo("h-10")}
              </div>
              <div>
                <span className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight block">חדר מכירות ת"ת כנסת יחזקאל</span>
                <span className="text-xs text-amber-600 font-extrabold block mt-0.5 tracking-wider">ממשק משולב • ניהול מלאי ויומן רווחים</span>
              </div>
            </div>

            {/* Header Action bar */}
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center bg-slate-100/90 border border-slate-200/60 p-1 rounded-2xl">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer ${activeTab === 'inventory' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  מלאי פריטים
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer ${activeTab === 'sales' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  יומן מכירות
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer ${activeTab === 'settings' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  הגדרות והתראות
                </button>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-500 hover:text-rose-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border border-transparent hover:border-slate-100"
              >
                <LogOut className="h-4 w-4 text-amber-600" />
                <span className="hidden sm:inline">התנתק</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Responsive mobile sub-bar in Royal light */}
      <div className="md:hidden bg-white text-slate-900 border-b border-amber-200/50 flex p-1.5 sticky top-[89px] z-30 justify-around shadow-sm">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 ${activeTab === 'inventory' ? 'bg-slate-50 text-amber-600 font-black border border-slate-200/60 shadow-inner' : 'text-slate-500'}`}
        >
          <Shirt className="h-4 w-4" />
          <span>מלאי</span>
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 ${activeTab === 'sales' ? 'bg-slate-50 text-amber-600 font-black border border-slate-200/60 shadow-inner' : 'text-slate-500'}`}
        >
          <History className="h-4 w-4" />
          <span>יומן מכירות</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-slate-50 text-amber-600 font-black border border-slate-200/60 shadow-inner' : 'text-slate-500'}`}
        >
          <Settings className="h-4 w-4" />
          <span>הגדרות</span>
        </button>
      </div>

      {/* Main app boundaries */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Dashboard quick stats row summaries (Luxury gold/navy accent designs) */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(148,163,184,0.05)] hover:shadow-md transition-all duration-200 border-t-4 border-t-slate-900 group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold mb-1">דגמים בקטלוג</p>
                <h3 className="text-2xl font-black text-slate-900 group-hover:text-amber-500 transition-colors">{totalModelsCount} <span className="text-xs font-normal text-slate-400">דגמים ייחודיים</span></h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center justify-center shrink-0">
                <Tag className="h-5 w-5 text-slate-700" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(148,163,184,0.05)] hover:shadow-md transition-all duration-200 border-t-4 border-t-amber-500 group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold mb-1">סה"כ פריטים במלאי</p>
                <h3 className="text-2xl font-black text-slate-900">{totalGarmentsCount} <span className="text-xs font-normal text-slate-400">יחידות</span></h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Shirt className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(148,163,184,0.05)] hover:shadow-md transition-all duration-200 border-t-4 border-t-emerald-600 group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold mb-1">שווי מלאי במחיר עלות</p>
                <h3 className="text-2xl font-black text-emerald-600">₪{formatPrice(totalWholesaleValue)}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>

          <div 
            onClick={() => setIsLowStockModalOpen(true)}
            className={`p-6 rounded-2xl border transition-all duration-200 relative group select-none ${
              lowStockModelsCount > 0 
                ? 'bg-rose-50/20 border-rose-100 shadow-[0_4px_20px_rgba(244,63,94,0.08)] border-t-4 border-t-rose-500 hover:bg-rose-50/40 cursor-pointer' 
                : 'bg-white border-slate-100 shadow-[0_4px_16px_rgba(148,163,184,0.05)] border-t-4 border-t-slate-400 hover:shadow-md'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-bold mb-1">דגמים מתחת לסף מינימום</p>
                <h3 className={`text-2xl font-black ${lowStockModelsCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{lowStockModelsCount}</h3>
                {lowStockModelsCount > 0 && <span className="text-[10px] text-rose-500 font-bold underline animate-pulse block mt-1">לחצו להצגת דוח פריטים בחוסר</span>}
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                lowStockModelsCount > 0 ? 'bg-rose-100 text-rose-600 border border-rose-200 animate-pulse' : 'bg-slate-50 text-slate-500 border border-slate-200/50'
              }`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(148,163,184,0.05)] hover:shadow-md transition-all duration-200 border-t-4 border-t-indigo-600 group">
            <div className="flex items-start justify-between">
              <div className="flex-grow">
                <p className="text-slate-400 text-xs font-bold mb-1">רווח מצטבר ממכירות קופסא</p>
                <h3 className="text-2xl font-black text-indigo-700">₪{formatPrice(totalAccumulatedProfit)}</h3>
                <button 
                  onClick={handleResetProfit}
                  className="text-[10px] text-slate-400 hover:text-rose-600 font-bold mt-1.5 transition-colors flex items-center gap-1 cursor-pointer"
                  title="אפס מד רווחים מצטבר"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>איפוס רווחים</span>
                </button>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </div>
        </section>

        {/* TAB 1: INVENTORY MANAGEMENT */}
        {activeTab === 'inventory' && (
          <>
            {/* Filter and control panel */}
            <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                
                {/* Search bar input with icon */}
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חיפוש לפי שם דגם, מק״ט ברקוד או צבע פריט..."
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-slate-900 focus:bg-white transition-all text-sm font-semibold"
                  />
                </div>

                {/* Sub configuration groups */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  
                  {/* Plus vs Minus action configurations */}
                  <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 shrink-0 border border-slate-200/50">
                    <span className="text-xs font-bold text-slate-500 px-2 hidden xl:inline">פעולת מינוס (-):</span>
                    <button
                      onClick={() => {
                        setMinusAction('sale');
                        triggerToast('פעולת מינוס הוגדרה כמכירה: מחייב רישום רווח ביומן', 'info');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${minusAction === 'sale' ? 'bg-slate-900 text-amber-400 shadow-sm border border-slate-850' : 'text-slate-600 hover:bg-slate-50'}`}
                      title="הפחתת מלאי תירשם כמכירה ותחשב רווחים"
                    >
                      <span>מכירה ורווח</span>
                    </button>
                    <button
                      onClick={() => {
                        setMinusAction('correct');
                        triggerToast('פעולת מינוס הוגדרה כתיקון/הגרה בלבד, ללא עדכון רווחים', 'warning');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${minusAction === 'correct' ? 'bg-slate-900 text-amber-400 shadow-sm border border-slate-850' : 'text-slate-600 hover:bg-slate-50'}`}
                      title="הפחתת מלאי לתיקון טעויות ללא רישום רווח"
                    >
                      <span>עודפים / עודכני</span>
                    </button>
                  </div>

                  {/* Selecting Category dropdown */}
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-700 cursor-pointer"
                    >
                      <option value="">כל הקטגוריות</option>
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    <select
                      value={selectedStockFilter}
                      onChange={(e) => setSelectedStockFilter(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-700 cursor-pointer"
                    >
                      <option value="all">כל המלאי</option>
                      <option value="low">במלאי נמוך בלבד</option>
                      <option value="out">אזל לחלוטין</option>
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-700 cursor-pointer"
                    >
                      <option value="newest">חדש ביותר</option>
                      <option value="name">לפי אלפבית</option>
                      <option value="qty-desc">מלאי: גבוה לנמוך</option>
                      <option value="qty-asc">מלאי: נמוך לגבוה</option>
                    </select>
                  </div>

                </div>

              </div>

              {/* Utility management row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openItemModal(null)}
                    className="bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-extrabold py-2.5 px-5 rounded-xl transition-all duration-200 shadow-md border border-amber-500/10 flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 text-amber-400" />
                    <span>הוספת דגם חדש</span>
                  </button>
                  <button
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="bg-slate-100 hover:bg-slate-250 hover:bg-slate-200/80 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center gap-2 text-xs border border-slate-200/50 cursor-pointer"
                  >
                    <Layers className="h-4 w-4 text-slate-600" />
                    <span>ניהול קטגוריות</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleExportCSV}
                    className="bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold py-2 px-4 rounded-xl transition-all duration-200 text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>ייצוא לאקסל (CSV)</span>
                  </button>
                  <button
                    onClick={handleBackupExport}
                    className="bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold py-2 px-4 rounded-xl transition-all duration-200 text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>גיבוי מערכת תדפיס</span>
                  </button>
                  <label
                    className="bg-white hover:bg-slate-100 text-slate-605 border border-slate-200 font-bold py-2 px-4 rounded-xl transition-all duration-200 text-xs flex items-center gap-2 cursor-pointer text-slate-600"
                  >
                    <Upload className="h-4 w-4" />
                    <span>שחזור גיבוי</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleBackupImport} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* Catalog inventory rendering grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedItems.map(item => {
                const totalStock = sumStock(item.sizes);
                const isOutOfStock = totalStock === 0;
                const isLowStock = totalStock <= item.minStock;

                const hasImageFailed = failedItemImageIds[item.id];
                const shouldShowImage = item.imageUrl && !hasImageFailed;

                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_-4px_rgba(148,163,184,0.12)] hover:shadow-[0_12px_30px_-4px_rgba(148,163,184,0.2)] transition-all duration-300 hover:-translate-y-1 flex flex-col overflow-hidden relative group">
                    
                    {/* Upper image and metadata badge */}
                    <div className="h-52 bg-slate-50 relative overflow-hidden flex items-center justify-center border-b border-slate-100">
                      {shouldShowImage ? (
                        <img 
                          src={item.imageUrl} 
                          alt={item.name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={() => {
                            setFailedItemImageIds(prev => ({ ...prev, [item.id]: true }));
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-50/80 flex flex-col items-center justify-center p-8 text-center select-none">
                          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/50 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            <Shirt className="h-8 w-8 text-amber-500" />
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold mt-2">אין תמונה להצגה</span>
                        </div>
                      )}
                      
                      <span className="absolute top-3 right-3 bg-white/95 backdrop-blur-md text-slate-700 px-3 py-1 rounded-xl text-xs font-bold shadow-sm border border-slate-200/40">
                        {item.category}
                      </span>

                      <div className="absolute top-3 left-3">
                        {isOutOfStock ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50/95 text-rose-700 border border-rose-100 shadow-sm flex items-center gap-1">
                            מלאי אזל
                          </span>
                        ) : isLowStock ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50/95 text-amber-700 border border-amber-200 shadow-sm flex items-center gap-1">
                            מלאי נמוך
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50/95 text-emerald-700 border border-emerald-100 shadow-sm flex items-center gap-1">
                            תקין במלאי
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description detail specs */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      
                      <div>
                        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                          <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md text-[10px] text-slate-500">מק"ט: {item.sku}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md text-[10px] text-slate-500">צבע: {item.color}</span>
                        </div>
                        <h4 className="text-base font-extrabold text-slate-900 line-clamp-2 mt-2 group-hover:text-amber-550 group-hover:text-amber-600 transition-colors" title={item.name}>{item.name}</h4>

                        {/* Financial and pricing rows (Ultra professional micro-dashboard styling) */}
                        <div className="grid grid-cols-3 gap-1 bg-slate-50/70 p-3 rounded-xl border border-slate-100/80 text-center mt-3">
                          <div className="flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-semibold leading-none mb-1">עלות רכש</span>
                            <span className="text-xs font-black text-slate-705 text-slate-700">₪{formatPrice(item.costPrice)}</span>
                          </div>
                          <div className="border-r border-slate-200/60 flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-semibold leading-none mb-1">מחיר מכירה</span>
                            <span className="text-xs font-black text-slate-900">₪{formatPrice(item.sellPrice)}</span>
                          </div>
                          <div className="border-r border-slate-200/60 flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-semibold leading-none mb-1">רווח נקי</span>
                            <span className="text-xs font-black text-emerald-600">₪{formatPrice(item.sellPrice - item.costPrice)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive size matrix with gold touches */}
                      <div className="border-t border-b border-dashed border-slate-200/80 py-3.5">
                        <span className="text-[11px] font-extrabold text-slate-500 block mb-2 text-right">יתרת מלאי ועדכון מהיר לפי מידה:</span>
                        <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-0.5 lg:grid-cols-4">
                          {(Object.entries(item.sizes) as [string, number][]).map(([szName, qty]) => {
                            const isEditing = editingSizeQty?.itemId === item.id && editingSizeQty?.sizeName === szName;
                            return (
                              <div key={szName} className="border border-slate-100 rounded-xl p-2 flex flex-col items-center justify-between bg-white shadow-sm hover:border-amber-400/50 transition-all duration-150 group/size relative">
                                <span className="text-[10px] font-bold text-slate-500 block text-center truncate w-full" title={szName}>{szName}</span>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-14 text-center text-xs font-black my-1 border border-amber-400 rounded bg-amber-50 text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 py-0.5"
                                    value={editQtyValue}
                                    onChange={(e) => setEditQtyValue(e.target.value)}
                                    autoFocus
                                    onBlur={() => {
                                      if (editQtyValue !== 'DISCARD') {
                                        const val = parseInt(editQtyValue, 10);
                                        if (!isNaN(val) && val >= 0) {
                                          handleDirectQtyChange(item, szName, val);
                                        }
                                      }
                                      setEditingSizeQty(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      } else if (e.key === 'Escape') {
                                        setEditQtyValue('DISCARD');
                                        e.currentTarget.blur();
                                      }
                                    }}
                                  />
                                ) : (
                                  <span 
                                    onClick={() => {
                                      setEditingSizeQty({ itemId: item.id, sizeName: szName });
                                      setEditQtyValue(qty.toString());
                                    }}
                                    className={`text-xs font-black my-1 cursor-pointer hover:bg-amber-50 hover:text-amber-800 rounded px-1 transition-all ${qty === 0 ? 'text-rose-500' : qty <= 2 ? 'text-amber-600 font-black' : 'text-slate-850'}`}
                                    title="לחץ להזנה ידנית"
                                  >
                                    {qty} יח'
                                  </span>
                                )}
                                <div className="flex gap-1 w-full justify-center">
                                  <button 
                                    onClick={() => handleQuickStockChange(item, szName, -1)}
                                    className="w-5 h-5 bg-slate-50 hover:bg-rose-50 border border-slate-200/60 text-slate-500 hover:text-rose-600 rounded-md flex items-center justify-center text-xs font-black cursor-pointer transition-all duration-100 active:scale-90"
                                    title="הפחת 1 יח'"
                                  >
                                    -
                                  </button>
                                  <button 
                                    onClick={() => handleQuickStockChange(item, szName, 1)}
                                    className="w-5 h-5 bg-slate-50 hover:bg-emerald-50 border border-slate-200/60 text-slate-500 hover:text-emerald-700 rounded-md flex items-center justify-center text-xs font-black cursor-pointer transition-all duration-100 active:scale-90"
                                    title="הוסף 1 יח'"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card lower interactions */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block leading-tight">סה"כ במלאי:</span>
                          <span className="text-base font-black text-slate-900 leading-none">
                            {totalStock} <span className="text-xs font-bold text-slate-500">יחידות</span>
                          </span>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openItemModal(item)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-amber-400 hover:bg-slate-900 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60 hover:border-slate-800 shadow-sm"
                            title="עריכת דגם"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60 hover:border-red-200 shadow-sm"
                            title="מחיקת דגם"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                    </div>

                  </div>
                );
              })}
            </section>

            {filteredAndSortedItems.length === 0 && (
              <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center max-w-lg mx-auto shadow-sm">
                <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                  <Shirt className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700">לא נמצאו פריטים</h3>
                <p className="text-slate-400 text-sm mt-1">נסה לשנות את מסנני החיפוש או להוסיף דגם חדש למחסן המערכת.</p>
              </div>
            )}
          </>
        )}

        {/* TAB 2: AUDITED SALES SPREADSHEET */}
        {activeTab === 'sales' && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                  <History className="h-5 w-5 text-blue-600" />
                  <span>יומן מכירות ורווחים מצטבר מלא</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">כל הפחתת מלאי במיזם שנרשמה כמכירה מתועדת ומגובה להלן אוטומטית.</p>
              </div>
              
              <button
                onClick={async () => {
                  if(confirm('האם ברצונך למחוק לצמיתות את כל היסטוריית המכירות מתוך Firebase? פעולה זו סופית ולא ניתנת לביטול.')) {
                    try {
                      triggerToast('מוחק יומן מכירות מ-Firebase...', 'info');
                      const promises = salesLogs.map(log => deleteDoc(doc(db, 'sales', log.id)));
                      await Promise.all(promises);
                      triggerToast('כל יומן המכירות נמחק בהצלחה לצמיתות!', 'success');
                    } catch (err) {
                      console.error(err);
                      triggerToast('שגיאה במחיקת יומן המכירות', 'error');
                    }
                  }
                }}
                className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>נקה יומן מכירות</span>
              </button>
            </div>

            {/* Audited Sales Export Controller with Date Filtering */}
            <div className="bg-slate-50/70 p-4.5 rounded-2xl border border-slate-200/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 flex-1">
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-extrabold text-slate-400 pr-1">מתאריך:</span>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 focus:outline-none h-[34px]"
                  />
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-extrabold text-slate-400 pr-1">עד תאריך:</span>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 focus:outline-none h-[34px]"
                  />
                </div>
                {(exportStartDate || exportEndDate) && (
                  <button 
                    onClick={() => {
                      setExportStartDate('');
                      setExportEndDate('');
                    }}
                    className="text-slate-400 hover:text-rose-500 text-[11px] font-bold self-end mb-1 transition-colors cursor-pointer"
                  >
                    נקה סינון תאריכים
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportSalesCSV(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-amber-500/10 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>ייצוא יומן מלא</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSalesCSV(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>ייצא לפי סינון</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="p-3.5">תזמון</th>
                    <th className="p-3.5">דגם בגד</th>
                    <th className="p-3.5">מק"ט (SKU)</th>
                    <th className="p-3.5">מידה</th>
                    <th className="p-3.5 text-center">כמות</th>
                    <th className="p-3.5">עלות פריט</th>
                    <th className="p-3.5">מחיר מכירה</th>
                    <th className="p-3.5 text-emerald-600">רווח נקי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3.5 font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleString('he-IL')}
                      </td>
                      <td className="p-3.5 font-bold text-slate-700">{log.itemName}</td>
                      <td className="p-3.5 font-mono text-slate-500">{log.sku}</td>
                      <td className="p-3.5">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black">{log.size}</span>
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-800">{log.qty}</td>
                      <td className="p-3.5 text-slate-500">₪{formatPrice(log.costPrice)}</td>
                      <td className="p-3.5 text-blue-600 font-bold">₪{formatPrice(log.sellPrice)}</td>
                      <td className="p-3.5 text-emerald-600 font-black">₪{formatPrice(log.profit)}</td>
                    </tr>
                  ))}
                  {salesLogs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center p-12 text-slate-400">
                        אין כרגע עסקאות רשומות ביומן.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: SETTINGS AND EMAIL ALERTS PARAMETERS */}
        {activeTab === 'settings' && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-3xl mx-auto space-y-6">
            <div>
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-600" />
                <span>הגדרות קונפיגורציה, מיתוג והתראות מייל</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">נהל את יעדי הדוח, כמות האזהרות המינימליות, נתוני המייל של מנהל הת"ת וכתובות הלוגו.</p>
            </div>

            <form onSubmit={handleSettingsSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Manager notification email targets */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-amber-600" />
                    <span>אימייל לקבלת התראות מלאי של הת"ת</span>
                  </label>
                  <input
                    type="email"
                    value={localManagerEmail}
                    onChange={(e) => setLocalManagerEmail(e.target.value)}
                    placeholder="למשל: manager@tt.org"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-800"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block leading-normal">
                    המערכת תשלח אימייל Hebrew מעוצב ומפורט עם SKU ישיר בכל פעם שהמלאי של מידה כלשהי יירד מתחת לסף ההתרעה שלך.
                  </span>
                </div>

                {/* Custom Branding logo configuration - PERMANENT SHOWCASE */}
                <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 col-span-1 md:col-span-2">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center">
                      <img 
                        src={logoUrl} 
                        alt="לוגו תת כנסת יחזקאל" 
                        referrerPolicy="no-referrer"
                        className="h-12 object-contain" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <ImageIcon className="h-4 w-4 text-amber-600" />
                        <span>סמל הלוגו של הת"ת - קבוע</span>
                      </label>
                      <p className="text-xs text-slate-500 leading-normal mt-0.5">
                        לוגו ת"ת כנסת יחזקאל מוגדר כעת כקבוע במערכת ללא אפשרות שינוי, בהתאם לדרישתכם.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Placeholder empty div to preserve clean layout since password is now in a distinct safe block below */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-center text-center opacity-60">
                  <span className="text-xs text-slate-400">הגדרות אבטחה מתקדמות וסודיות מנוהלות בצורה בטוחה בתיבה נפרדת מטה.</span>
                </div>

              </div>

              {/* Email alerts checkbox */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="alertToggle"
                  checked={localLowStockAlertActive}
                  onChange={(e) => setLocalLowStockAlertActive(e.target.checked)}
                  className="h-4.5 w-4.5 rounded text-amber-600 focus:ring-amber-500/30 border-slate-300 mt-0.5 cursor-pointer"
                />
                <div>
                  <label htmlFor="alertToggle" className="block text-sm font-bold text-slate-700 cursor-pointer">
                    אפשר התראות אימייל אקטיביות
                  </label>
                  <span className="text-xs block text-slate-400">
                    כאשר תיבה זו מסומנת, המערכת תיגש לשרת שליחת המיילים בעת רכישות.
                  </span>
                </div>
              </div>

              {/* Verification dispatch tester */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="block text-sm font-bold text-slate-700">בדיקת תקינות התראות וסנכרון מיילים</span>
                  <span className="text-xs block text-slate-400">שלח דוא"ל נסיוני מעוצב לכתובת המוגדרת לעיל כדי לוודא קבלה.</span>
                </div>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-4 rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-1.5 shrink-0 self-stretch sm:self-auto justify-center"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>שלח מייל בדיקה</span>
                </button>
              </div>

              {/* Info text */}
              <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50 text-amber-800 text-xs leading-relaxed">
                <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                  <span>אינטגרציה חסינה מפני נפילות!</span>
                </p>
                אם פרטי שרת המייל (EMAIL_USER & EMAIL_PASS) שלכם טרם הוכנסו בלוח הסודות (Secrets Panel) באיי Studio, המערכת תבצע פלט (Output Log) דמה מלא של המיילים לטרמינל הפנימי של השרת במקום לקרוס. מלאו את הכתובת שלכם ותוכלו לחבר את פרטי ה-SMTP בהמשך בשיא הבטיחות!
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-extrabold py-2.5 px-6 rounded-xl shadow transition-all cursor-pointer border border-amber-500/10 text-xs"
                >
                  שמור הגדרות מנהל
                </button>
              </div>
            </form>

            {/* SECURE PASSWORD CHANGING SYSTEM - REQUIRES OTP CONFIRMATION */}
            <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4.5 w-4.5 text-amber-600" />
                  <span>שינוי סיסמת מנהל בטוח (מאומת מייל)</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">למען אבטחה מרבית, שינוי סיסמת הכניסה למנהל מחייב אימות אימייל אקטיבי של מנהל הת"ת.</p>
              </div>

              {!isPwdEmailVerified ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-4">
                  <div className="text-xs text-slate-500 leading-relaxed">
                    כדי להציג את <strong className="text-slate-700">הסיסמה הישנה</strong> ולפתוח את האפשרות לעדכן לסיסמה חדשה, לחץ על הכפתור כדי לשלוח קוד אימות חד-פעמי (OTP) לכתובת המוגדרת <strong className="font-mono text-slate-700">{settings.managerEmail || 'sp9328008@gmail.com'}</strong>:
                  </div>

                  {!isPwdOtpSent ? (
                    <button
                      type="button"
                      onClick={handleSendPwdOtp}
                      disabled={isPwdOtpLoading}
                      className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs py-2 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isPwdOtpLoading ? 'שולח קוד אימות...' : 'שלח קוד אימות למייל'}
                    </button>
                  ) : (
                    <form onSubmit={handleVerifyPwdOtp} className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs p-3 rounded-lg font-bold">
                        ✓ קוד אימות נשלח בהצלחה! אנא בדוק את תיבת הדואר והזן אותו מטה.
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={pwdOtpCode}
                          onChange={(e) => setPwdOtpCode(e.target.value)}
                          placeholder="קוד בן 6 ספרות"
                          className="px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-sm font-bold text-slate-800 tracking-wider text-center"
                          required
                        />
                        <button
                          type="submit"
                          disabled={isPwdVerifyLoading}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isPwdVerifyLoading ? 'מאמת...' : 'אמת קוד והצג סיסמה'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="bg-emerald-50/40 p-5 rounded-xl border border-emerald-100 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-xs font-black">האימות עבר בהצלחה! הסיסמה הישנה גלויה כעת.</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-white p-4 rounded-xl border border-emerald-100">
                    <div>
                      <span className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">סיסמה ישנה/נוכחית במערכת</span>
                      <code className="text-sm font-mono font-black text-rose-600 bg-rose-50 px-2 py-1 rounded">
                        {settings.managerPassword || '1234'}
                      </code>
                    </div>
                    <div className="sm:col-span-2 text-xs text-slate-400 leading-normal">
                      סיסמה זו משמשת כעת לכניסה למערכת. היא תתעדכן ברגע שתשמור את הסיסמה החדשה מטה.
                    </div>
                  </div>

                  <form onSubmit={handleSaveNewPassword} className="space-y-4 my-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">הזן סיסמה חדשה</label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="מינימום 4 תווים"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-bold text-slate-800"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">אמת/אשר את הסיסמה החדשה</label>
                        <input
                          type="text"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="הקלד סיסמה שנית"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-bold text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-emerald-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPwdEmailVerified(false);
                          setIsPwdOtpSent(false);
                          setPwdOtpCode('');
                          setNewPassword('');
                          setConfirmNewPassword('');
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ביטול
                      </button>
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-xl shadow transition-all cursor-pointer text-xs"
                      >
                        שמור סיסמה חדשה
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

          </section>
        )}

      </main>

      {/* FOOTER METRICS SYSTEM */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 sm:px-8 text-center text-xs text-slate-400">
          מחסן בגדים ומלאי ת"ת כנסת יחזקאל &copy; {new Date().getFullYear()} • ממשק פותח ומגובה בצורה מלאה
        </div>
      </footer>

      {/* MODAL 1: ADD / EDIT CLOTHING ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-100 flex flex-col transition-all">
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800">
                {currentlyEditingItem ? `עריכת דגם: ${currentlyEditingItem.name}` : 'הוספת דגם בגד חדש'}
              </h2>
              <button onClick={closeItemModal} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-6 flex-1 text-right">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">שם הדגם בגד *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="למשל: חולצת פולו אלגנט"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">מק״ט / קוד ברקוד *</label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="למשל: PL-1029"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">קטגוריית קטלוג *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-705"
                    required
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">צבע בגד *</label>
                  <input
                    type="text"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="למשל: כחול כהה"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">מחיר עלות ספק (₪) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formCost}
                    onChange={(e) => setFormCost(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">מחיר מכירה לצרכן (₪) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formSell}
                    onChange={(e) => setFormSell(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">סף התראת מלאי נמוך (יחידות) *</label>
                  <input
                    type="number"
                    min="1"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(Number(e.target.value))}
                    placeholder="5"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
              </div>

              {/* Matrix Size fields dynamic designer */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">פירוט יחידות מלאי לפי מידה / סוג:</span>
                  <button
                    type="button"
                    onClick={() => addFormSizeRow('', 0)}
                    className="bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black py-1 px-3 rounded-md cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>הוסף שורת מידה</span>
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {formSizes.map((szRow, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-150">
                      <input
                        type="text"
                        value={szRow.name}
                        onChange={(e) => updateFormSizeName(idx, e.target.value)}
                        placeholder="מידה (S, M, L, XL, 42)"
                        className="flex-1 px-2.5 py-1 text-xs border border-slate-250 rounded bg-slate-50 font-bold"
                        required
                      />
                      <input
                        type="number"
                        min="0"
                        value={szRow.qty}
                        onChange={(e) => updateFormSizeQty(idx, Number(e.target.value))}
                        placeholder="כמות"
                        className="w-16 px-2.5 py-1 text-xs text-center border border-slate-250 rounded font-bold"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeFormSizeRow(idx)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Item image selector */}
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-400">תמונת פריט מזהה</span>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-50 border border-dashed rounded-xl flex items-center justify-center text-slate-400 overflow-hidden shrink-0">
                    {formImage ? (
                      <img src={formImage} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 border border-slate-250">
                      <Upload className="h-3.5 w-3.5" />
                      <span>העלה קובץ חדש</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {formImage && (
                      <button 
                        type="button" 
                        onClick={() => setFormImage('')} 
                        className="text-red-500 hover:underline text-xs font-bold mr-3"
                      >
                        הסר תמונה
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeItemModal} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 rounded-xl transition-all cursor-pointer">
                  ביטול
                </button>
                <button type="submit" className="bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 font-extrabold py-2 px-6 rounded-xl border border-amber-500/10 transition-all cursor-pointer shadow text-xs">
                  שמור פריט
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CATEGORIES MANAGER */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-slate-100 flex flex-col scale-100 transition-all">
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-850">ניהול קטגוריות בגדים</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-end gap-2 bg-slate-50 p-3 rounded-xl border border-slate-150">
                <div className="flex-1 text-right">
                  <label className="block text-xs font-bold text-slate-500 mb-1">הוסף קטגוריה חדשה</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="למשל: גרביים, כובעים..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                </div>
                <button
                  onClick={handleAddCategory}
                  className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold py-2 px-4 rounded-lg text-xs transition-all shrink-0 h-[34px] cursor-pointer border border-amber-500/10"
                >
                  הוסף
                </button>
              </div>

              <div className="text-right">
                <span className="block text-xs font-bold text-slate-400 mb-2">קטגוריות קיימות</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {categories.map(c => (
                    <div key={c} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{c}</span>
                      {c !== 'אחר' && (
                        <button
                          onClick={() => handleDeleteCategory(c)}
                          className="text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setIsCategoryModalOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold py-1.5 px-4 rounded-lg text-xs cursor-pointer border border-amber-500/10">
                סגור
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: LOW STOCK DETAILS DETAIL REPORT SHEET */}
      {isLowStockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto border border-slate-100 flex flex-col transition-all text-right">
            
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>פירוט פריטים ומידות בחסר מלאי</span>
              </h2>
              <button onClick={() => setIsLowStockModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">הפריטים הבאים חצו את סף המינימום המוגדר להם. מומלץ להזמין סחורה בהקדם:</p>
              
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-0.5">
                {inventory.filter(item => {
                  const qty = sumStock(item.sizes);
                  return qty <= item.minStock;
                }).map(item => {
                  const totalAmount = sumStock(item.sizes);

                  return (
                    <div key={item.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-800">{item.name}</h4>
                          <span className="text-[10px] text-slate-400 font-semibold font-mono">מק"ט: {item.sku} | צבע: {item.color}</span>
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-black text-red-600 block">סה"כ: {totalAmount} יח'</span>
                          <span className="text-[9px] text-slate-400 font-bold block">סף מינימום: {item.minStock}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 mt-2.5 bg-white p-2 rounded-lg border border-slate-100">
                        {(Object.entries(item.sizes) as [string, number][]).map(([sz, q]) => (
                          <div key={sz} className={`border rounded p-1 text-center ${q === 0 ? 'bg-red-50 border-red-205 text-red-700 font-black animate-pulse' : q <= 2 ? 'bg-amber-50 border-amber-205 text-amber-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                            <span className="text-[8px] font-bold block text-slate-400">{sz}</span>
                            <span className="text-xs">{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {inventory.filter(item => {
                  const qty = sumStock(item.sizes);
                  return qty <= item.minStock;
                }).length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    מצב המלאי מצוין! אין דגמים מתחת לסף ההתראה.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setIsLowStockModalOpen(false)} className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold py-2 px-6 rounded-xl text-xs cursor-pointer shadow border border-amber-500/10">
                סגור דוח
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
