/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import { ClothesItem, SaleLog, SystemSettings } from './src/types';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Directories setup
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Helper to read/write JSON files
function readJSONFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJSONFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err);
  }
}

// Default items list based on user's schema
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

const defaultSettings: SystemSettings = {
  customLogoUrl: "https://torah-supporters-logo-q6t8y35io-aliko-s-projects.vercel.app/",
  managerEmail: "shey7048@gmail.com",
  lowStockAlertActive: true,
  alertEmailSentFor: []
};

// Lazy initialize Nodemailer Transporter
function getMailTransporter() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '587');

  if (!user || !pass) {
    // Return a console logging dummy implementation when keys are absent
    return {
      sendMail: async (options: { to: string; subject: string; html: string; text?: string }) => {
        console.log('\n--- 📧 [NODEMAILER DUMMY EMAIL DISPATCH] ---');
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Content Preview:`);
        console.log(options.text || "HTML Email template outputted on server terminal.");
        console.log('-------------------------------------------\n');
        return { messageId: `dummy-id-${Date.now()}` };
      }
    };
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

// Function to send modern email alert when stock reaches min limit
async function sendStockAlertEmail(item: ClothesItem, sizeName: string, currentQty: number, totalStock: number, managerEmail: string) {
  if (!managerEmail) {
    return;
  }

  const transporter = getMailTransporter();
  const subject = `⚠️ התראת חוסר מלאי: ${item.name} (מידה ${sizeName})`;

  const emailHtml = `
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; color: #1e293b; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #0284c7, #0369a1); color: white; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
        .content { padding: 24px; }
        .alert-bar { background-color: #fef3c7; border-right: 4px solid #d97706; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; color: #92400e; font-weight: bold; }
        .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .table th, .table td { text-align: right; padding: 10px 12px; border-bottom: 1px solid #edf2f7; }
        .table th { background-color: #f1f5f9; font-weight: bold; font-size: 13px; color: #475569; }
        .badge-red { background: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 9999px; }
        .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>חדר מכירות ת"ת כנסת יחזקאל</h1>
        </div>
        <div class="content">
          <div class="alert-bar">
            שים לב: המלאי של הפריט הבא כמעט אזל מחדר המכירות!
          </div>
          
          <table class="table">
            <tr>
              <th>שם הדגם</th>
              <td><strong>${item.name}</strong></td>
            </tr>
            <tr>
              <th>מק"ט (SKU)</th>
              <td><code>${item.sku}</code></td>
            </tr>
            <tr>
              <th>צבע</th>
              <td>${item.color}</td>
            </tr>
            <tr>
              <th>קטגוריה</th>
              <td>${item.category}</td>
            </tr>
            <tr>
              <th>מידה שהדלדלה</th>
              <td><span class="badge-red">${sizeName}</span></td>
            </tr>
            <tr>
              <th>כמות נוכחית במידה</th>
              <td><strong style="color: #b91c1c; font-size: 16px;">${currentQty}</strong> יחידות</td>
            </tr>
            <tr>
              <th>סה"כ מלאי בדגם</th>
              <td>${totalStock} יחידות left</td>
            </tr>
            <tr>
              <th>סף התראת מינימום</th>
              <td>${item.minStock} יחידות</td>
            </tr>
          </table>

          <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
            מומלץ להיכנס לממשק הניהול ולהזמין דגמים חדשים מן הספק לטובת לקוחות ותלמידי הת"ת.
          </p>
        </div>
        <div class="footer">
          נשלח באופן אוטומטי ממערכת ניהול המלאי של ת"ת כנסת יחזקאל - הגנת חדר מכירות
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"ניהול מלאי כנסת יחזקאל" <${process.env.EMAIL_USER || 'no-reply@knesset-yechezkel.org'}>`,
      to: managerEmail,
      subject,
      html: emailHtml,
      text: `אזהרת מלאי: הדגם ${item.name} במידה ${sizeName} הגיע ל- ${currentQty} יחידות.`
    });
  } catch (err) {
    console.error("Failed to dispatcher SMTP stock alert email:", err);
  }
}

// ---------------- SERVER API ROUTES ----------------

// Stateless SMTP alarm proxy to hide keys
app.post('/api/send-alert', async (req, res) => {
  const { item, sizeName, currentQty, totalStock, managerEmail } = req.body;
  try {
    await sendStockAlertEmail(item, sizeName, currentQty, totalStock, managerEmail);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to dispatcher alert SMTP mail:", err);
    res.status(500).json({ error: "Failed to dispatch alert email" });
  }
});


// ---------------- DYNAMIC VITE FRONTEND MIDDLEWARE ----------------

async function setupAndStartServer() {
  if (process.env.NODE_ENV !== "production") {
    // Mount Vite middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static file serving in production build
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Warehouse Management System Server initialized successfully.`);
    console.log(`🌐 Server listening at http://0.0.0.0:${PORT}`);
    console.log(`📅 Current Timestamp: ${new Date().toISOString()}`);
    console.log(`🛠️ Local Persistence Engine: active at ${DATA_DIR}`);
    console.log(`======================================================\n`);
  });
}

setupAndStartServer();
