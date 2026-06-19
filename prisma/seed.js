/**
 * DUMMY DATA SEED SCRIPT
 * Dashboard E-Commerce Analytics - NovaMart
 *
 * Cara pakai:
 *   node seed.js
 *
 * Requires:
 *   npm install pg faker
 *   DATABASE_URL di .env atau environment variable
 *
 * FIXED:
 *  - lifetime_value dihitung dari actual orders, bukan di-hardcode
 *  - last_order_at hanya diset jika customer benar-benar punya order
 *  - total_orders sinkron dengan actual order count
 *  - UPDATE products dipindah ke luar loop bulan
 *  - Region ditambah jadi 8 (sesuai permintaan)
 *  - Setiap customer DIJAMIN minimal 1 order (kecuali At_risk yang memang bisa churn)
 */

require('dotenv').config();
const { Pool } = require('pg');
const { faker } = require('@faker-js/faker/locale/id_ID');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  categories:       8,
  productsPerCat:   10,      // total 80 produk
  customers:        7745,    // FIXED (tidak boleh diubah)
  months:           29,      // Jan 2024 – Mei 2026 (tidak boleh diubah)
  ordersPerMonth:   680,     // dinaikkan agar coverage customer lebih baik
  avgItemsPerOrder: 2.5,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const rand     = (min, max) => Math.random() * (max - min) + min;
const randInt  = (min, max) => Math.floor(rand(min, max + 1));
const pick     = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toFixed2 = (n) => parseFloat(n.toFixed(2));

function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// tanggal acak dalam bulan tertentu (month 0-indexed dari startDate)
function randomDateInMonth(startYear, startMonth, monthOffset) {
  const date = new Date(startYear, startMonth + monthOffset, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(randInt(1, lastDay));
  date.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59));
  return date;
}

// Batas akhir: Mei 2026
function getMaxDate() {
  return new Date(2026, 4, 31); // Mei 2026
}

const usedEmails = new Set();

function generateUniqueEmail() {
  let email;
  do {
    email = faker.internet.email().toLowerCase();
  } while (usedEmails.has(email));
  usedEmails.add(email);
  return email;
}

// Weighted pick berdasarkan segment (VIP lebih sering order)
function weightedCustomerPick(customers) {
  const weights = customers.map((c) => {
    switch (c.segment) {
      case 'VIP':        return 5;
      case 'Loyal':      return 3;
      case 'Occasional': return 2;
      case 'At_risk':    return 1;
      default:           return 1;
    }
  });
  return weightedPick(customers, weights);
}

// Multiplier harga berdasarkan segment
const segmentMultiplier = {
  VIP:        1.35,
  Loyal:      1.15,
  Occasional: 1.0,
  At_risk:    0.85,
};

function generateProductPrice() {
  const bucket = weightedPick([1, 2, 3], [65, 30, 5]);
  switch (bucket) {
    case 1: return toFixed2(rand(450000, 1000000));
    case 2: return toFixed2(rand(1000000, 3000000));
    case 3: return toFixed2(rand(3000000, 7000000));
    default: return toFixed2(rand(450000, 1000000));
  }
}

// faktor pertumbuhan revenue per bulan (bulan 0 = Jan 2024)
function revenueGrowthFactor(monthOffset) {
  const base     = 1.0;
  const trend    = monthOffset * 0.012;
  const seasonal = Math.sin((monthOffset / 12) * 2 * Math.PI) * 0.08;
  const noise    = (Math.random() - 0.5) * 0.06;
  return Math.max(0.7, base + trend + seasonal + noise);
}

// ─── MASTER DATA ─────────────────────────────────────────────────────────────
const CATEGORY_DATA = [
  { name: 'Electronics',    slug: 'electronics' },
  { name: 'Audio',          slug: 'audio' },
  { name: 'Wearables',      slug: 'wearables' },
  { name: 'Accessories',    slug: 'accessories' },
  { name: 'Computers',      slug: 'computers' },
  { name: 'Mobile Devices', slug: 'mobile-devices' },
  { name: 'Smart Home',     slug: 'smart-home' },
  { name: 'Gaming',         slug: 'gaming' },
];

const PRODUCT_TEMPLATES = {
  'Electronics':    ['Smart TV 42"', 'HDMI Cable 2m', 'Power Strip 6-Port', 'LED Desk Lamp', 'USB Hub 7-Port', 'Webcam HD 1080p', 'Digital Clock', 'Extension Cord 5m', 'Surge Protector', 'LED Strip Light'],
  'Audio':          ['Wireless Earbuds Pro', 'Bluetooth Speaker M2', 'Wired Headphone X1', 'Noise Cancelling Headset', 'Portable Speaker Mini', 'Bass Earphone V3', 'Studio Monitor Speaker', 'Microphone USB', 'Soundbar 2.1', 'Bone Conduction Headset'],
  'Wearables':      ['Smart Watch S3', 'Fitness Tracker Band', 'Smart Ring Health', 'GPS Running Watch', 'Heart Rate Monitor', 'Sleep Tracker Band', 'Smart Glasses V2', 'Pulse Oximeter', 'Blood Pressure Watch', 'Kids GPS Watch'],
  'Accessories':    ['Laptop Stand Flex', 'Phone Holder Car', 'Cable Organizer Set', 'Laptop Bag 15"', 'Mouse Pad XL', 'Keyboard Wrist Rest', 'Monitor Stand Dual', 'Phone Case Premium', 'Screen Protector Pack', 'Cable Clip Magnetic'],
  'Computers':      ['Mechanical Keyboard', 'Wireless Mouse M3', 'Gaming Mouse Pro', 'Portable SSD 512GB', 'RAM 16GB DDR5', 'NVMe SSD 1TB', 'CPU Cooler Pro', 'GPU Bracket Support', 'SATA Cable Pack', 'Thermal Paste Premium'],
  'Mobile Devices': ['Portable Charger X', 'Fast Charger 65W', 'Wireless Charger Pad', 'Car Charger Dual', 'MagSafe Charger', 'USB-C Cable Braided', 'Lightning Cable Pack', 'Phone Stand Foldable', 'Ring Light Selfie', 'Lens Kit Phone'],
  'Smart Home':     ['Smart Bulb RGB', 'WiFi Smart Plug', 'Smart Doorbell', 'Security Camera Indoor', 'Smart Switch 2-Gang', 'Air Quality Monitor', 'Smart Smoke Detector', 'Robot Vacuum Basic', 'Smart Door Lock', 'WiFi Repeater AC1200'],
  'Gaming':         ['Gaming Controller', 'Gaming Chair Cushion', 'RGB Mousepad XXL', 'Headset Stand RGB', 'Controller Charging Dock', 'Gaming Glasses', 'Thumb Grip Joystick', 'Console Wall Mount', 'Gaming Desk Mat', 'Stream Deck Mini'],
};

// 8 REGIONS (tidak boleh diubah jumlahnya)
const REGIONS = [
  { name: 'Jawa',                  slug: 'jawa' },
  { name: 'Sulawesi',              slug: 'sulawesi' },
  { name: 'Sumatra',               slug: 'sumatra' },
  { name: 'Kalimantan',            slug: 'kalimantan' },
  { name: 'Bali & Nusa Tenggara', slug: 'bali-nusa-tenggara' },
  { name: 'Maluku & Papua',        slug: 'maluku-papua' },
  { name: 'Aceh & Riau',           slug: 'aceh-riau' },       // [NEW]
  { name: 'NTT & NTB',             slug: 'ntt-ntb' },         // [NEW]
];
// Distribusi realistis Indonesia (total = 100)
const REGION_WEIGHTS = [38, 17, 18, 10, 6, 4, 4, 3];

const CHANNELS         = ['website', 'mobile_app', 'marketplace', 'other'];
const CHANNEL_WEIGHTS  = [45, 30, 20, 5];

const SEGMENTS         = ['VIP', 'Loyal', 'Occasional', 'At_risk'];
const SEGMENT_WEIGHTS  = [10, 35, 42, 13];

const USERS = [
  { name: 'Imam Rafif Adrian', email: 'imamrafif25@gmail.com', role: 'SUPER_ADMIN' },
];

// ─── MAIN SEED ───────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();

  try {
    console.log('🚀 Memulai seed data...\n');
    await client.query('BEGIN');

    // ── 1. Truncate ─────────────────────────────────────────────────────────
    console.log('🗑  Membersihkan data lama...');
    await client.query(`
      TRUNCATE TABLE daily_metrics, order_items, orders, customers, products,
                     categories, regions, users, audit_logs, oauth_accounts
      RESTART IDENTITY CASCADE
    `);

    // ── 2. Categories ───────────────────────────────────────────────────────
    console.log('📦 Insert categories...');
    const categoryIds = {};
    for (const cat of CATEGORY_DATA) {
      const res = await client.query(
        `INSERT INTO categories (id, name, slug) VALUES (gen_random_uuid(), $1, $2) RETURNING id, name`,
        [cat.name, cat.slug]
      );
      categoryIds[cat.name] = res.rows[0].id;
    }
    console.log(`   ✓ ${CATEGORY_DATA.length} categories`);

    // ── 3. Products ─────────────────────────────────────────────────────────
    console.log('🛍  Insert products...');
    const products = [];
    let skuCounter = 1000;

    for (const [catName, templates] of Object.entries(PRODUCT_TEMPLATES)) {
      const catId = categoryIds[catName];
      for (const productName of templates) {
        const price      = generateProductPrice();
        const costRatio  = rand(0.40, 0.65);
        const cost_price = toFixed2(price * costRatio);
        const stock      = randInt(0, 200);
        const rating     = toFixed2(rand(3.2, 5.0));
        const reviews    = randInt(10, 800);
        const is_active  = Math.random() > 0.08;

        const res = await client.query(
          `INSERT INTO products
             (id, category_id, name, sku, price, cost_price, stock_quantity, rating, total_reviews, is_active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [catId, productName, `SKU-${skuCounter++}`, price, cost_price, stock, rating, reviews, is_active]
        );

        products.push({
          id:             res.rows[0].id,
          price,
          cost_price,
          catId,
          name:           productName,
          firstOrderDate: null, // diisi saat generate orders
        });
      }
    }
    console.log(`   ✓ ${products.length} products`);

    // ── 4. Regions ──────────────────────────────────────────────────────────
    console.log('📍 Insert regions...');
    const regionIds = [];
    for (const region of REGIONS) {
      const res = await client.query(
        `INSERT INTO regions (id, name, slug) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
        [region.name, region.slug]
      );
      regionIds.push(res.rows[0].id);
    }
    console.log(`   ✓ ${REGIONS.length} regions`);

    // ── 5. Customers ─────────────────────────────────────────────────────────
    // PENTING: lifetime_value di-set ke 0 dulu, akan di-UPDATE setelah orders dibuat
    // created_at customer dibuat lebih awal dari first_order mereka (realistis)
    console.log('👤 Insert customers...');
    const customers = [];

    for (let i = 0; i < CONFIG.customers; i++) {
      const segment  = weightedPick(SEGMENTS, SEGMENT_WEIGHTS);
      const regionId = weightedPick(regionIds, REGION_WEIGHTS);

      // created_at tersebar di 29 bulan, tapi tidak di bulan terakhir
      // supaya ada ruang untuk order setelah signup
      const signupMonthOffset = randInt(0, 26); // max bulan ke-26 agar ada ruang 2-3 bulan ke depan
      const created_at = randomDateInMonth(2024, 0, signupMonthOffset);

      const res = await client.query(
        `INSERT INTO customers
           (id, name, email, phone, region_id, segment, lifetime_value, total_orders, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, 0, $6)
         RETURNING id`,
        [
          faker.person.fullName(),
          generateUniqueEmail(),
          faker.phone.number(),
          regionId,
          segment,
          created_at,
        ]
      );

      customers.push({
        id:              res.rows[0].id,
        segment,
        regionId,
        created_at,
        signupMonthOffset, // bulan ke berapa customer ini bergabung
      });
    }
    console.log(`   ✓ ${customers.length} customers`);

    // ── 6. Orders + OrderItems ───────────────────────────────────────────────
    // STRATEGI:
    //   A) Pastikan setiap customer punya minimal 1 order (sesuai segmentnya)
    //   B) Kemudian generate random orders per bulan seperti biasa
    //
    // Ini menjamin tidak ada customer dengan lifetime_value > 0 tapi last_order_at = NULL

    console.log('🧾 Insert orders + order_items...');

    let totalOrders = 0;
    let totalItems  = 0;

    // Tracker per customer (akan digunakan untuk UPDATE di akhir)
    const customerOrderCount    = {}; // { customer_id: count }
    const customerLastOrder     = {}; // { customer_id: Date }
    const customerTotalSpent    = {}; // { customer_id: total net revenue }

    // Helper: insert 1 order beserta items-nya
    async function insertOrder(customer, monthOffset) {
      const channel    = weightedPick(CHANNELS, CHANNEL_WEIGHTS);
      const regionId   = customer.regionId;

      // ordered_at harus >= created_at customer
      let ordered_at = randomDateInMonth(2024, 0, monthOffset);
      if (ordered_at < customer.created_at) {
        // geser ke bulan signup customer
        ordered_at = randomDateInMonth(2024, 0, customer.signupMonthOffset);
        // +1 sampai +3 hari setelah signup supaya logis
        ordered_at = new Date(customer.created_at.getTime() + randInt(1, 3) * 24 * 60 * 60 * 1000);
      }

      // Jangan melebihi batas Mei 2026
      const maxDate = getMaxDate();
      if (ordered_at > maxDate) ordered_at = new Date(maxDate.getTime() - randInt(1, 30) * 24 * 60 * 60 * 1000);

      // Status order berdasarkan umur
      const daysSince = (new Date() - ordered_at) / (1000 * 60 * 60 * 24);
      let status, delivered_at = null;
      if (daysSince < 3) {
        status = weightedPick(['processing', 'shipped'], [60, 40]);
      } else if (daysSince < 14) {
        status = weightedPick(['shipped', 'delivered', 'returned'], [15, 75, 10]);
      } else {
        status = weightedPick(['delivered', 'returned'], [92, 8]);
      }
      if (status === 'delivered' || status === 'returned') {
        delivered_at = new Date(ordered_at.getTime() + rand(1, 7) * 24 * 60 * 60 * 1000);
      }

      // Pilih produk
      const numItems        = weightedPick([1, 2, 3, 4], [30, 40, 20, 10]);
      const selectedProducts = [];
      const usedIdx         = new Set();
      while (selectedProducts.length < numItems) {
        const idx = randInt(0, products.length - 1);
        if (!usedIdx.has(idx)) {
          usedIdx.add(idx);
          selectedProducts.push(products[idx]);
          // Track firstOrderDate per produk
          if (!products[idx].firstOrderDate || ordered_at < products[idx].firstOrderDate) {
            products[idx].firstOrderDate = ordered_at;
          }
        }
      }

      // Hitung subtotal
      let subtotalAmount = 0;
      const itemsData = selectedProducts.map((p) => {
        const qty       = weightedPick([1, 2, 3], [70, 25, 5]);
        const unitPrice = toFixed2(p.price * segmentMultiplier[customer.segment] * rand(0.90, 1.05));
        const subtotal  = toFixed2(unitPrice * qty);
        subtotalAmount += subtotal;
        return { productId: p.id, qty, unitPrice, subtotal };
      });

      const discount      = Math.random() < 0.25 ? toFixed2(subtotalAmount * rand(0.05, 0.20)) : 0;
      const shipping      = toFixed2(rand(5000, 25000));
      const total_amount  = toFixed2(subtotalAmount + shipping); // gross (dengan shipping)
      const net_revenue   = toFixed2(subtotalAmount - discount); // net (tanpa shipping, sudah dikurang diskon)

      // Insert order
      const orderRes = await client.query(
        `INSERT INTO orders
           (id, customer_id, status, channel, total_amount, discount_amount, shipping_cost, region_id, ordered_at, delivered_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [customer.id, status, channel, total_amount, discount, shipping, regionId, ordered_at, delivered_at]
      );
      const orderId = orderRes.rows[0].id;

      // Insert order_items
      for (const item of itemsData) {
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [orderId, item.productId, item.qty, item.unitPrice, item.subtotal]
        );
        totalItems++;
      }

      // Update tracker customer
      customerOrderCount[customer.id] = (customerOrderCount[customer.id] || 0) + 1;
      customerTotalSpent[customer.id] = (customerTotalSpent[customer.id] || 0) + net_revenue;
      if (!customerLastOrder[customer.id] || ordered_at > customerLastOrder[customer.id]) {
        customerLastOrder[customer.id] = ordered_at;
      }

      totalOrders++;
      return ordered_at;
    }

    // ── FASE A: Guaranteed orders per customer ───────────────────────────────
    // Setiap customer PASTI punya minimal order sesuai segmentnya:
    //   VIP: 8-15 orders, Loyal: 4-8, Occasional: 1-3, At_risk: 0-2
    // At_risk: ada ~30% chance customer benar-benar tidak pernah order (churn sebelum beli)
    console.log('   Fase A: Guaranteed orders per customer...');
    let guaranteedOrders = 0;

    const minOrdersBySegment = {
      VIP:        [8,  15],
      Loyal:      [4,   8],
      Occasional: [1,   3],
      At_risk:    [0,   2],
    };

    for (const customer of customers) {
      const [minO, maxO] = minOrdersBySegment[customer.segment];

      // At_risk: 30% chance = tidak pernah order (benar-benar churn)
      if (customer.segment === 'At_risk' && Math.random() < 0.30) {
        continue; // skip, biarkan last_order_at = NULL dan lifetime_value = 0
      }

      const numOrders = randInt(Math.max(minO, 1), maxO);
      for (let i = 0; i < numOrders; i++) {
        // Spread orders dari bulan signup sampai bulan terakhir
        const latestMonth = CONFIG.months - 1;
        const orderMonth  = randInt(customer.signupMonthOffset, latestMonth);
        await insertOrder(customer, orderMonth);
        guaranteedOrders++;
      }
    }
    console.log(`   ✓ Fase A: ${guaranteedOrders} guaranteed orders`);

    // ── FASE B: Random orders per bulan (traffic realistis) ─────────────────
    console.log('   Fase B: Monthly random orders...');
    let monthlyOrders = 0;

    for (let mo = 0; mo < CONFIG.months; mo++) {
      const growthFactor   = revenueGrowthFactor(mo);
      const ordersThisMonth = Math.round(CONFIG.ordersPerMonth * growthFactor);

      for (let o = 0; o < ordersThisMonth; o++) {
        // Hanya pilih customer yang sudah signup di bulan ini atau sebelumnya
        const eligibleCustomers = customers.filter(c => c.signupMonthOffset <= mo);
        if (eligibleCustomers.length === 0) continue;

        const customer = weightedCustomerPick(eligibleCustomers);
        await insertOrder(customer, mo);
        monthlyOrders++;
      }

      process.stdout.write(`\r   Bulan ${mo + 1}/${CONFIG.months} (total orders: ${totalOrders})`);
    }
    console.log(`\n   ✓ Fase B: ${monthlyOrders} monthly orders`);
    console.log(`   ✓ TOTAL: ${totalOrders} orders, ${totalItems} order_items`);

    // ── 7. Update products: created_at dan last_stock_date ──────────────────
    // Dipindah ke LUAR loop bulan agar nilai firstOrderDate sudah final
    console.log('🔄 Update product timestamps...');
    let updatedProducts = 0;
    const maxDate = getMaxDate();

    for (const product of products) {
      let createdAt, lastStockDate;

      if (product.firstOrderDate) {
        // created_at produk = 60-90 hari sebelum first order (logis: produk ada sebelum dijual)
        createdAt = new Date(
          product.firstOrderDate.getTime() - randInt(60, 90) * 24 * 60 * 60 * 1000
        );
        // last_stock_date = antara first_order dan Mei 2026
        lastStockDate = new Date(
          product.firstOrderDate.getTime() +
          Math.random() * (maxDate.getTime() - product.firstOrderDate.getTime())
        );
      } else {
        // Produk tidak pernah terjual: tetap ada tapi tanpa last_stock_date
        createdAt     = randomDateInMonth(2024, 0, randInt(0, 20));
        lastStockDate = null;
      }

      await client.query(
        `UPDATE products SET created_at = $1, last_stock_date = $2 WHERE id = $3`,
        [createdAt, lastStockDate, product.id]
      );
      updatedProducts++;
    }
    console.log(`   ✓ ${updatedProducts} products updated`);

    // ── 8. Update customer stats dari actual orders ──────────────────────────
    // INI adalah perbaikan utama: lifetime_value, total_orders, last_order_at
    // semua dihitung dari data aktual, bukan di-hardcode saat insert.
    console.log('🔄 Update customer stats dari actual orders...');

    let updatedCustomers = 0;
    for (const customer of customers) {
      const count      = customerOrderCount[customer.id] || 0;
      const lastOrder  = customerLastOrder[customer.id]  || null;
      const totalSpent = customerTotalSpent[customer.id] || 0;

      await client.query(
        `UPDATE customers
         SET
           total_orders   = $1,
           last_order_at  = $2,
           lifetime_value = $3
         WHERE id = $4`,
        [count, lastOrder, toFixed2(totalSpent), customer.id]
      );
      updatedCustomers++;
    }
    console.log(`   ✓ ${updatedCustomers} customers updated`);

    // Validasi: tidak boleh ada customer dengan lifetime_value > 0 tapi no orders
    const badCustomers = await client.query(`
      SELECT COUNT(*) as cnt FROM customers
      WHERE lifetime_value > 0 AND total_orders = 0
    `);
    if (parseInt(badCustomers.rows[0].cnt) > 0) {
      throw new Error(`VALIDATION FAILED: ${badCustomers.rows[0].cnt} customers dengan lifetime_value > 0 tapi total_orders = 0`);
    }

    // Validasi: tidak boleh ada customer dengan last_order_at tapi total_orders = 0
    const badCustomers2 = await client.query(`
      SELECT COUNT(*) as cnt FROM customers
      WHERE last_order_at IS NOT NULL AND total_orders = 0
    `);
    if (parseInt(badCustomers2.rows[0].cnt) > 0) {
      throw new Error(`VALIDATION FAILED: ${badCustomers2.rows[0].cnt} customers dengan last_order_at tapi total_orders = 0`);
    }

    console.log('   ✓ Validasi data sinkron: PASSED');

    // ── 9. Daily Metrics ────────────────────────────────────────────────────
    console.log('📊 Generate daily_metrics...');
    let metricCount = 0;

    const datesRes = await client.query(`
      SELECT DISTINCT DATE(ordered_at) as d FROM orders ORDER BY d
    `);

    for (const row of datesRes.rows) {
      const date = row.d;

      // Total semua channel & region
      const totalRes = await client.query(`
        SELECT
          COALESCE(SUM(total_amount - discount_amount), 0) AS net_revenue,
          COUNT(*)                                          AS orders,
          COALESCE(AVG(total_amount - discount_amount), 0) AS avg_net_order_value,
          COALESCE(
            SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END)::decimal
              / NULLIF(COUNT(*), 0),
            0
          )                                                 AS return_rate
        FROM orders
        WHERE DATE(ordered_at) = $1
      `, [date]);

      const t = totalRes.rows[0];

      const newCustRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM customers WHERE DATE(created_at) = $1`, [date]
      );

      const targetFactor = rand(0.88, 1.15);

      await client.query(`
        INSERT INTO daily_metrics
          (id, metric_date, channel, region_id, total_revenue, target_revenue,
           total_orders, new_customers, avg_order_value, return_rate)
        VALUES (gen_random_uuid(), $1, NULL, NULL, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (metric_date, channel, region_id) DO NOTHING
      `, [
        date,
        toFixed2(parseFloat(t.net_revenue)),
        toFixed2(parseFloat(t.net_revenue) * targetFactor),
        parseInt(t.orders),
        parseInt(newCustRes.rows[0].cnt),
        toFixed2(parseFloat(t.avg_net_order_value)),
        toFixed2(parseFloat(t.return_rate)),
      ]);
      metricCount++;

      // Per channel + region
      const channelRes = await client.query(`
        SELECT
          channel,
          region_id,
          SUM(total_amount - discount_amount) AS net_revenue,
          COUNT(*)                             AS orders,
          AVG(total_amount - discount_amount)  AS avg_net_order_value,
          SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END)::decimal
            / NULLIF(COUNT(*), 0)              AS return_rate
        FROM orders
        WHERE DATE(ordered_at) = $1
        GROUP BY channel, region_id
      `, [date]);

      for (const ch of channelRes.rows) {
        await client.query(`
          INSERT INTO daily_metrics
            (id, metric_date, channel, region_id, total_revenue, target_revenue,
             total_orders, new_customers, avg_order_value, return_rate)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (metric_date, channel, region_id) DO NOTHING
        `, [
          date,
          ch.channel,
          ch.region_id,
          toFixed2(parseFloat(ch.net_revenue)),
          toFixed2(parseFloat(ch.net_revenue) * rand(0.88, 1.15)),
          parseInt(ch.orders),
          0,
          toFixed2(parseFloat(ch.avg_net_order_value)),
          toFixed2(parseFloat(ch.return_rate || 0)),
        ]);
        metricCount++;
      }
    }
    console.log(`   ✓ ${metricCount} daily_metrics rows`);

    // ── 10. Users ────────────────────────────────────────────────────────────
    console.log('👤 Insert default users...');
    for (const user of USERS) {
      await client.query(`
        INSERT INTO users (id, name, email, role, is_active, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
        ON CONFLICT (email) DO NOTHING
      `, [user.name, user.email, user.role, true]);
    }
    console.log(`   ✓ ${USERS.length} default users`);

    await client.query('COMMIT');

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n✅ Seed selesai!\n');
    console.log('📋 Ringkasan data:');
    const tables = ['categories', 'products', 'regions', 'customers', 'orders', 'order_items', 'daily_metrics'];
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`   ${t.padEnd(20)} ${res.rows[0].count} rows`);
    }

    // Statistik sinkronisasi
    console.log('\n📊 Statistik Sinkronisasi Customer:');
    const syncStats = await client.query(`
      SELECT
        segment,
        COUNT(*)                                    AS total,
        SUM(CASE WHEN total_orders = 0 THEN 1 ELSE 0 END) AS no_orders,
        AVG(total_orders)::numeric(10,1)            AS avg_orders,
        AVG(lifetime_value)::numeric(14,0)          AS avg_ltv
      FROM customers
      GROUP BY segment
      ORDER BY segment
    `);
    for (const row of syncStats.rows) {
      console.log(
        `   ${row.segment.padEnd(12)} total=${row.total}  no_orders=${row.no_orders}  avg_orders=${row.avg_orders}  avg_ltv=Rp${parseInt(row.avg_ltv).toLocaleString()}`
      );
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error! Rollback dilakukan.');
    console.error(err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();