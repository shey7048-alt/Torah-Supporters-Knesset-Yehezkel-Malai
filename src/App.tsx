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

// Helper to sum stock sizes cleanly and prevent aggregate type warnings
function sumStock(sizes: SizesMap): number {
  if (!sizes) return 0;
  return (Object.values(sizes) as number[]).reduce((sum, v) => sum + (v || 0), 0);
}

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

  // Trigger Toast notifications helper
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Sync Categories from Inventory
  useEffect(() => {
    const list = new Set<string>();
    // Inject Hebrew default categories
    ["חולצות", "מכנסיים", "שמלות", "חליפות", "חצאיות", "מעילים וג'קטים", "אקססוריז", "אחר"].forEach(c => list.add(c));
    inventory.forEach(item => {
      if (item.category) list.add(item.category);
    });
    setCategories(Array.from(list));
  }, [inventory]);

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

    // settings live onSnapshot with safe one-time seeding trigger
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SystemSettings;
        setSettings(data);

        // Seeding database only once
        if (data.hasSeededItems === undefined || data.hasSeededItems === false) {
          const initialSampleClothes: ClothesItem[] = [
            {
              id: "item-1",
              name: "חולצת פולו קלאסית כותנה",
              sku: "PO-CLASS-01",
              category: "חולצות",
              color: "כחול כהה",
              costPrice: 40,
              sellPrice: 99,
              minStock: 8,
              imageUrl: "",
              sizes: { S: 12, M: 20, L: 15, XL: 7, XXL: 2 },
              dateAdded: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              id: "item-2",
              name: "ג'ינס סטרץ' סלים פיט",
              sku: "JN-SLIM-04",
              category: "מכנסיים",
              color: "שחור",
              costPrice: 65,
              sellPrice: 159,
              minStock: 6,
              imageUrl: "",
              sizes: { S: 4, M: 12, L: 8, XL: 4, XXL: 1 },
              dateAdded: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              id: "item-3",
              name: "גרבי כותנה אלסטיים (מארז)",
              sku: "SOX-CTN-10",
              category: "אקססוריז",
              color: "לבן",
              costPrice: 12,
              sellPrice: 30,
              minStock: 10,
              imageUrl: "",
              sizes: { "מידה אחידה": 35 },
              dateAdded: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            }
          ];

          initialSampleClothes.forEach(item => {
            setDoc(doc(db, 'items', item.id), item).catch(err => {
              console.error(`Error seed items:`, err);
            });
          });

          // Mark seeded
          setDoc(doc(db, 'settings', 'config'), { ...data, hasSeededItems: true }).catch(err => {
            console.error(err);
          });
        }
      } else {
        const defaultSet: SystemSettings = {
          customLogoUrl: "https://torah-supporters-logo-q6t8y35io-aliko-s-projects.vercel.app/",
          managerEmail: "shey7048@gmail.com",
          lowStockAlertActive: true,
          alertEmailSentFor: [],
          hasSeededItems: false,
          managerPassword: '1234'
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
      const emailToUse = (settings.managerEmail || 'shey7048@gmail.com').toLowerCase().trim();
      if (!loginCode) {
        triggerToast('נא להזין קוד אימות', 'error');
        return;
      }
      try {
        const res = await fetch('/api/verify-auth-code', {
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
    const emailToUse = (settings.managerEmail || 'shey7048@gmail.com').toLowerCase().trim();
    setOtpLoading(true);
    try {
      const res = await fetch('/api/send-auth-code', {
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
  const handleQuickStockChange = async (item: ClothesItem, sizeName: string, delta: number) => {
    const currentQty = item.sizes[sizeName] || 0;
    const newQty = currentQty + delta;

    if (newQty < 0) {
      triggerToast('המלאי אינו יכול לרדת מתחת ל-0', 'error');
      return;
    }

    // Prepare updated size map
    const updatedSizes = { ...item.sizes, [sizeName]: newQty };
    const updatedItem = { ...item, sizes: updatedSizes };

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
        costPrice: item.costPrice,
        sellPrice: item.sellPrice,
        profit: item.sellPrice - item.costPrice,
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
          fetch('/api/send-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              item: updatedItem, 
              sizeName, 
              currentQty: newQty, 
              totalStock,
              managerEmail: settings.managerEmail
            })
          }).catch((err) => {
            console.error("Failed to notify backend SMTP low stock watcher:", err);
          });

          // Mark email as sent to prevent duplicates
          const updatedAlertKeys = [...settings.alertEmailSentFor, alertKey];
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys });
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
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys });
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
          await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: updatedAlertKeys });
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
      await setDoc(doc(db, 'settings', 'config'), settings);
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
      const res = await fetch('/api/send-alert', {
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
    const emailToUse = (settings.managerEmail || 'shey7048@gmail.com').toLowerCase().trim();
    setIsPwdOtpLoading(true);
    try {
      const res = await fetch('/api/send-auth-code', {
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
    const emailToUse = (settings.managerEmail || 'shey7048@gmail.com').toLowerCase().trim();
    if (!pwdOtpCode.trim()) {
      triggerToast('אנא הזן קוד אימות', 'warning');
      return;
    }
    setIsPwdVerifyLoading(true);
    try {
      const res = await fetch('/api/verify-auth-code', {
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
      const updatedSettings = { ...settings, managerPassword: newPassword };
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
  const handleAddCategory = () => {
    const clean = newCategoryName.trim();
    if (!clean) return;
    if (categories.includes(clean)) {
      triggerToast('קטגוריה זו כבר קיימת במערכת', 'warning');
      return;
    }
    setCategories([...categories, clean]);
    setNewCategoryName('');
    triggerToast(`הקטגוריה "${clean}" נוספה בהצלחה!`, 'success');
  };

  // Reset entire metrics database backup or local profit
  const handleResetProfit = async () => {
    if (confirm('האם לאפס את חישוב הרווח המצטבר ממכירות ל-0 ₪? שינוי זה ינקה גם את יומן התנועות.')) {
      try {
        await setDoc(doc(db, 'settings', 'config'), { ...settings, alertEmailSentFor: [] });
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
            await setDoc(doc(db, 'settings', 'config'), importedSettings);
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
  const activeLogoUrl = settings.customLogoUrl || "https://torah-supporters-logo-q6t8y35io-aliko-s-projects.vercel.app/";

  // RENDER INTERFACE
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative" dir="rtl">
        {/* Toast notifications */}
        {toast && (
          <div className="fixed top-5 left-5 z-50 max-w-sm w-full transition-all duration-300">
            <div className={`p-4 rounded-xl shadow-sm border flex items-center justify-between gap-3 text-white ${
              toast.type === 'error' ? 'bg-red-600 border-red-500' :
              toast.type === 'warning' ? 'bg-amber-600 border-amber-500' :
              toast.type === 'info' ? 'bg-blue-600 border-blue-500' : 'bg-emerald-600 border-emerald-500'
            }`}>
              <span className="text-sm font-semibold">{toast.message}</span>
              <button onClick={() => setToast(null)} className="text-white hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full border border-slate-200">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              {!logoError ? (
                <img 
                  src={activeLogoUrl} 
                  alt="Torah Supporters Logo" 
                  className="h-28 w-auto object-contain mx-auto"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center text-3xl">
                  <Shirt className="h-8 w-8 text-blue-600" />
                </div>
              )}
            </div>
            
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">חדר מכירות ת"ת כנסת יחזקאל</h1>
            <p className="text-slate-400 text-xs mt-1">ממשק ניהול ובקרת כניסה מאובטחת</p>
          </div>

          {/* Login tab switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button
              onClick={() => { setLoginMethod('password'); setAuthError(false); }}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${loginMethod === 'password' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              התחברות עם סיסמה
            </button>
            <button
              onClick={() => { setLoginMethod('email'); setAuthError(false); }}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${loginMethod === 'email' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              אימות במייל (OTP)
            </button>
          </div>

          {loginMethod === 'password' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">סיסמת מנהל כניסה</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="הזן סיסמה..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-center tracking-widest text-lg font-bold transition-all text-slate-800"
                    required
                  />
                </div>
                {authError && (
                  <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                    סיסמה שגויה, נסה שוב.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>התחבר למערכת</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-center mb-4">
                  <span className="block text-xs text-slate-400 mb-1">קוד האימות יישלח לכתובת המייל הרשומה של מנהל הת"ת:</span>
                  <strong className="block text-sm text-slate-800 font-bold tracking-wide break-all">
                    {settings.managerEmail || 'shey7048@gmail.com'}
                  </strong>
                </div>

                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mb-2"
                  >
                    {otpLoading ? 'שולח קוד אימות...' : 'שלח קוד אימות חד-פעמי למייל'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <span className="text-xs text-emerald-600 font-semibold text-center block bg-emerald-50 py-2 px-3 rounded-lg border border-emerald-100">
                      ✓ קוד אימות חד-פעמי נשלח למייל המנהל!
                    </span>
                    
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-500">הזן קוד אימות בן 6 ספרות</label>
                        <button
                          type="button"
                          onClick={() => { setOtpSent(false); setLoginCode(''); }}
                          className="text-xs text-blue-600 hover:underline font-semibold"
                        >
                          שלח שוב
                        </button>
                      </div>
                      <input 
                        type="text"
                        maxLength={6}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        placeholder="------"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-center tracking-[8px] text-lg font-bold text-slate-800"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!otpSent}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>אמת והתחבר למערכת</span>
              </button>
            </form>
          )}

          <div className="text-center mt-6 text-xs text-slate-400">
            מערכת ניהול מבוזרת &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 flex flex-col bg-slate-50" dir="rtl">
      
      {/* Toast systems */}
      {toast && (
        <div className="fixed top-5 left-5 z-50 max-w-sm w-full transition-all duration-300">
          <div className={`p-4 rounded-xl shadow-sm border flex items-center justify-between gap-3 text-white ${
            toast.type === 'error' ? 'bg-red-600 border-red-500' :
            toast.type === 'warning' ? 'bg-amber-600 border-amber-500' :
            toast.type === 'info' ? 'bg-blue-605 bg-blue-600 border-blue-500' : 'bg-emerald-600 border-emerald-500'
          }`}>
            <span className="text-sm font-semibold">{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-white hover:text-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main header block */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-4">
              <div className="flex items-center min-w-[50px] justify-center">
                {!logoError ? (
                  <img 
                    src={activeLogoUrl} 
                    alt="Torah Supporters" 
                    className="h-16 w-auto object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 text-blue-600">
                    <Shirt className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div>
                <span className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight block">חדר מכירות ת"ת כנסת יחזקאל</span>
                <span className="text-xs text-blue-600 font-semibold block -mt-1">ממשק ניהול ובקרת מלאי</span>
              </div>
            </div>

            {/* Header Action bar */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'inventory' ? 'bg-white text-blue-600 border border-slate-200/50 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  מלאי פריטים
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'sales' ? 'bg-white text-blue-600 border border-slate-200/50 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  יומן מכירות
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'settings' ? 'bg-white text-blue-600 border border-slate-200/50 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  הגדרות והתראות
                </button>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-500 hover:text-red-600 hover:bg-slate-100 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer border border-transparent hover:border-slate-200"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">התנתק</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Responsive mobile sub-bar */}
      <div className="md:hidden bg-white border-b border-slate-200 flex p-2 sticky top-[81px] z-30 justify-around">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'inventory' ? 'bg-slate-100 text-blue-600' : 'text-slate-550 text-slate-600'}`}
        >
          <Shirt className="h-4 w-4" />
          <span>מלאי פריטים</span>
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'sales' ? 'bg-slate-100 text-blue-600' : 'text-slate-550 text-slate-600'}`}
        >
          <History className="h-4 w-4" />
          <span>יומן מכירות</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-slate-100 text-blue-600' : 'text-slate-550 text-slate-600'}`}
        >
          <Settings className="h-4 w-4" />
          <span>הגדרות והתראות</span>
        </button>
      </div>

      {/* Main app boundaries */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Dashboard quick stats row summaries */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">דגמים בקטלוג</p>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{totalModelsCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5 text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">מלאי במחסן</p>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{totalGarmentsCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Shirt className="h-5 w-5 text-blue-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2 lg:col-span-1">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">שווי מלאי (עלות)</p>
              <h3 className="text-2xl font-bold tracking-tight text-emerald-600">₪{totalWholesaleValue.toLocaleString()}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </div>

          <div 
            onClick={() => setIsLowStockModalOpen(true)}
            className={`p-6 rounded-2xl border flex items-center justify-between cursor-pointer transition-all duration-200 relative group select-none ${
              lowStockModelsCount > 0 ? 'bg-red-50/50 border-red-200/60 shadow-sm' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">דגמים בחוסר</p>
              <h3 className={`text-2xl font-bold tracking-tight ${lowStockModelsCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{lowStockModelsCount}</h3>
              <p className="text-[10px] text-blue-600 group-hover:underline mt-1 font-bold">לחץ לפירוט</p>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              lowStockModelsCount > 0 ? 'bg-red-100 text-red-600 border border-red-200 animate-pulse' : 'bg-slate-50 text-slate-550 border border-slate-100'
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2 lg:col-span-1">
            <div className="flex-grow">
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">רווח ממכירות</p>
              <h3 className="text-2xl font-bold tracking-tight text-violet-650 text-violet-600">₪{totalAccumulatedProfit.toLocaleString()}</h3>
              <button 
                onClick={handleResetProfit}
                className="text-[10px] text-slate-400 hover:text-red-500 font-bold mt-1 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>אפס נתונים</span>
              </button>
            </div>
            <div className="w-10 h-10 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-violet-600" />
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
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-sm font-semibold"
                  />
                </div>

                {/* Sub configuration groups */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  
                  {/* Plus vs Minus action configurations */}
                  <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 shrink-0">
                    <span className="text-xs font-bold text-slate-500 px-2 hidden xl:inline">פעולת מינוס (-):</span>
                    <button
                      onClick={() => {
                        setMinusAction('sale');
                        triggerToast('פעולת מינוס הוגדרה כמכירה: מחייב רישום רווח ביומן', 'info');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${minusAction === 'sale' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-50'}`}
                      title="הפחתת מלאי תירשם כמכירה ותחשב רווחים"
                    >
                      <span>מכירה ורווח</span>
                    </button>
                    <button
                      onClick={() => {
                        setMinusAction('correct');
                        triggerToast('פעולת מינוס הוגדרה כתיקון/הגרה בלבד, ללא עדכון רווחים', 'warning');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${minusAction === 'correct' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-600 hover:bg-slate-50'}`}
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
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
                    >
                      <option value="">כל הקטגוריות</option>
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    <select
                      value={selectedStockFilter}
                      onChange={(e) => setSelectedStockFilter(e.target.value as any)}
                      className="bg-slate-550 bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
                    >
                      <option value="all">כל המלאי</option>
                      <option value="low">במלאי נמוך בלבד</option>
                      <option value="out">אזל לחלוטין</option>
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
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
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openItemModal(null)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl transition-all duration-200 shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>הוספת דגם חדש</span>
                  </button>
                  <button
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center gap-2 text-xs border border-slate-200/50"
                  >
                    <Layers className="h-4 w-4 text-slate-550" />
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

                const defaultPlaceholder = `https://placehold.co/400x400/0284c7/ffffff?text=${encodeURIComponent(item.name.split(' ')[0] || 'בגד')}`;
                const previewImgSource = item.imageUrl || defaultPlaceholder;

                return (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg group">
                    
                    {/* Upper image and metadata badge */}
                    <div className="h-48 bg-slate-50 relative overflow-hidden flex items-center justify-center border-b border-slate-100">
                      <img 
                        src={previewImgSource} 
                        alt={item.name} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = defaultPlaceholder;
                        }}
                      />
                      
                      <span className="absolute top-3 right-3 bg-slate-900/75 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-black tracking-wide">
                        {item.category}
                      </span>

                      <div className="absolute top-3 left-3">
                        {isOutOfStock ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                            מלאי אזל
                          </span>
                        ) : isLowStock ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                            מלאי נמוך
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                            תקין במלאי
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description detail specs */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400 font-mono">מק"ט: {item.sku}</span>
                          <span className="text-xs font-semibold text-slate-400">צבע: {item.color}</span>
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 mt-1 line-clamp-1">{item.name}</h4>

                        {/* Financial and pricing rows */}
                        <div className="flex items-center gap-3 mt-2 text-sm bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <div className="text-slate-550">
                            <span className="text-[10px] block text-slate-400 leading-none">עלות ספק:</span>
                            <span className="font-extrabold text-slate-800">₪{item.costPrice}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="text-slate-550">
                            <span className="text-[10px] block text-slate-400 leading-none">רווח צרכן:</span>
                            <span className="font-extrabold text-blue-600">₪{item.sellPrice}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="text-slate-550">
                            <span className="text-[10px] block text-slate-400 leading-none">רווח נקי:</span>
                            <span className="font-bold text-emerald-600">₪{item.sellPrice - item.costPrice}</span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive size matrix */}
                      <div className="border-t border-b border-slate-100 py-3">
                        <span className="text-[11px] font-bold text-slate-400 block mb-2">ניהול מהיר של יחידות מלאי:</span>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-0.5">
                          {(Object.entries(item.sizes) as [string, number][]).map(([szName, qty]) => (
                            <div key={szName} className="border border-slate-100 rounded-lg p-1.5 flex flex-col items-center justify-between bg-slate-50 hover:bg-white transiton-colors">
                              <span className="text-[10px] font-extrabold text-slate-400 block text-center truncate w-full">{szName}</span>
                              <span className={`text-sm font-black my-0.5 ${qty === 0 ? 'text-red-500' : qty <= 2 ? 'text-amber-500' : 'text-slate-800'}`}>{qty}</span>
                              <div className="flex gap-1 mt-1">
                                <button 
                                  onClick={() => handleQuickStockChange(item, szName, -1)}
                                  className="w-5 h-5 bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-500 rounded flex items-center justify-center text-xs font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <button 
                                  onClick={() => handleQuickStockChange(item, szName, 1)}
                                  className="w-5 h-5 bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-500 rounded flex items-center justify-center text-xs font-bold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card lower interactions */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-xs font-semibold text-slate-400 block leading-tight">סה"כ במחסן:</span>
                          <span className="text-lg font-black text-slate-800 leading-none">
                            {totalStock} <span className="text-xs font-bold text-slate-500">יח'</span>
                          </span>
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openItemModal(item)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-all cursor-pointer border border-slate-100"
                            title="ערוך דגם"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 hover:text-red-650 hover:bg-red-50 flex items-center justify-center transition-all cursor-pointer border border-slate-100"
                            title="מחק דגם"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
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
                      <td className="p-3.5 text-slate-500">₪{log.costPrice}</td>
                      <td className="p-3.5 text-blue-600 font-bold">₪{log.sellPrice}</td>
                      <td className="p-3.5 text-emerald-600 font-black">₪{log.profit}</td>
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
                <Settings className="h-5 w-5 text-blue-600" />
                <span>הגדרות קונפיגורציה, מיתוג והתראות מייל</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">נהל את יעדי הדוח, כמות האזהרות המינימליות, נתוני המייל של מנהל הת"ת וכתובות הלוגו.</p>
            </div>

            <form onSubmit={handleSettingsSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Manager notification email targets */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span>אימייל לקבלת התראות מלאי של הת"ת</span>
                  </label>
                  <input
                    type="email"
                    value={settings.managerEmail}
                    onChange={(e) => setSettings({ ...settings, managerEmail: e.target.value })}
                    placeholder="למשל: manager@tt.org"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-semibold text-slate-800"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block leading-normal">
                    המערכת תשלח אימייל Hebrew מעוצב ומפורט עם SKU ישיר בכל פעם שהמלאי של מידה כלשהי יירד מתחת לסף ההתרעה שלך.
                  </span>
                </div>

                {/* Custom Branding logo configuration */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-blue-500" />
                    <span>קישור אינטרנט של סמל הלוגו (URL)</span>
                  </label>
                  <input
                    type="url"
                    value={settings.customLogoUrl}
                    onChange={(e) => setSettings({ ...settings, customLogoUrl: e.target.value })}
                    placeholder="הדבק קישור (למשל: https://host.com/images/logo.png)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-semibold text-left text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block leading-normal">
                    הדבק כאן קישור ישיר ללוגו והוא יתעדכן מיידית במסך הכניסה ובחלק העליון של ממשק הניהול.
                  </span>
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
                  checked={settings.lowStockAlertActive}
                  onChange={(e) => setSettings({ ...settings, lowStockAlertActive: e.target.checked })}
                  className="h-4.5 w-4.5 rounded text-blue-600 focus:ring-blue-550 border-slate-300 mt-0.5 cursor-pointer"
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
                  <span className="block text-sm font-bold text-slate-705 text-slate-800">בדיקת תקינות התראות וסנכרון מיילים</span>
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
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-xs leading-relaxed">
                <p className="font-bold flex items-center gap-1.5 mb-1 text-blue-900">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>אינטגרציה חסינה מפני נפילות!</span>
                </p>
                אם פרטי שרת המייל (EMAIL_USER & EMAIL_PASS) שלכם טרם הוכנסו בלוח הסודות (Secrets Panel) באיי Studio, המערכת תבצע פלט (Output Log) דמה מלא של המיילים לטרמינל הפנימי של השרת במקום לקרוס. מלאו את הכתובת שלכם ותוכלו לחבר את פרטי ה-SMTP בהמשך בשיא הבטיחות!
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl shadow transition-all cursor-pointer"
                >
                  שמור הגדרות מנהל
                </button>
              </div>
            </form>

            {/* SECURE PASSWORD CHANGING SYSTEM - REQUIRES OTP CONFIRMATION */}
            <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-4.5 w-4.5 text-blue-600" />
                  <span>שינוי סיסמת מנהל בטוח (מאומת מייל)</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">למען אבטחה מרבית, שינוי סיסמת הכניסה למנהל מחייב אימות אימייל אקטיבי של מנהל הת"ת.</p>
              </div>

              {!isPwdEmailVerified ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-4">
                  <div className="text-xs text-slate-500 leading-relaxed">
                    כדי להציג את <strong className="text-slate-700">הסיסמה הישנה</strong> ולפתוח את האפשרות לעדכן לסיסמה חדשה, לחץ על הכפתור כדי לשלוח קוד אימות חד-פעמי (OTP) לכתובת המוגדרת <strong className="font-mono text-slate-700">{settings.managerEmail || 'shey7048@gmail.com'}</strong>:
                  </div>

                  {!isPwdOtpSent ? (
                    <button
                      type="button"
                      onClick={handleSendPwdOtp}
                      disabled={isPwdOtpLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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
                          className="px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-slate-800 tracking-wider text-center"
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
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-slate-800"
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
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-slate-800"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-705"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
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
                    value={formCost}
                    onChange={(e) => setFormCost(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">מחיר מכירה לצרכן (₪) *</label>
                  <input
                    type="number"
                    min="0"
                    value={formSell}
                    onChange={(e) => setFormSell(Number(e.target.value))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold text-slate-850"
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
                <button type="submit" className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-6 rounded-xl transition-all cursor-pointer shadow">
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
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shrink-0 h-[34px] cursor-pointer"
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
                          onClick={() => {
                            setCategories(categories.filter(cat => cat !== c));
                            triggerToast('קטגוריה נמחקה מקומית', 'info');
                          }}
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
              <button onClick={() => setIsCategoryModalOpen(false)} className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer">
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
              <button onClick={() => setIsLowStockModalOpen(false)} className="bg-sky-600 text-white font-bold py-2 px-6 rounded-xl text-xs cursor-pointer shadow">
                סגור דוח
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
