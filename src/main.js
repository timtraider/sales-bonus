/**
 * Создаёт быстрый справочник товаров: ключ — sku (нормализованный), значение — карточка товара.
 */
function buildProductIndex(products) {
  if (!Array.isArray(products)) return {};

  return Object.fromEntries(
    products
      .filter(p => p && p.sku)
      .map(product => {
        const key = String(product.sku).trim().toLowerCase();
        return [key, product];
      })
  );
}

/**
 * Создаёт быстрый справочник продавцов: ключ — id, значение — карточка продавца.
 */
function buildSellerIndex(sellers) {
  if (!Array.isArray(sellers)) return {};

  return sellers.reduce((result, seller) => {
    if (!seller || !seller.id) return result;
    result[seller.id] = seller;
    return result;
  }, {});
}

/**
 * Считает выручку по одной позиции чека с учётом скидки.
 * Формула: sale_price × quantity × (1 − discount/100)
 */
function calculateSimpleRevenue(purchase, _product) {
  const { discount = 0, sale_price = 0, quantity = 0 } = purchase;

  if (quantity === 0 || sale_price === 0) return 0;

  const discountFactor = 1 - discount / 100;
  return sale_price * quantity * discountFactor;
}

/**
 * Считает бонус по месту в рейтинге.
 */
function calculateBonusByProfit(index, total, seller) {
  if (total <= 1) return 0;

  let percent = 0;

  if (index === 0) {
    percent = 15;
  } else if (index === 1 || index === 2) {
    percent = 10;
  } else if (index === total - 1) {
    percent = 0;
  } else {
    percent = 5;
  }

  return seller.profit * (percent / 100);
}

/**
 * Вспомогательная функция для аккуратного округления денег до 2 знаков.
 */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Главная функция: собирает статистику по продажам, считает прибыль, бонусы и топ‑товары.
 */
function analyzeSalesData(data, options) {
  if (!data || typeof data !== 'object') {
    throw new Error('Ожидается объект с данными');
  }

  if (!data.purchase_records || !Array.isArray(data.purchase_records) || data.purchase_records.length === 0) {
    throw new Error('В данных отсутствует или пуст purchase_records');
  }
  if (!data.sellers || !Array.isArray(data.sellers) || data.sellers.length === 0) {
    throw new Error('В данных отсутствуют или пусты sellers');
  }
  if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
    throw new Error('В данных отсутствуют или пусты products');
  }

  const { calculateRevenue, calculateBonus } = options;
  if (typeof calculateRevenue !== 'function') {
    throw new Error('Требуется функция calculateRevenue');
  }
  if (typeof calculateBonus !== 'function') {
    throw new Error('Требуется функция calculateBonus');
  }

  const productIndex = buildProductIndex(data.products);
  const sellerIndex = buildSellerIndex(data.sellers);

  const sellersMap = {};

  data.purchase_records.forEach(record => {
    const sellerId = record.seller_id;

    if (!sellerId) {
      return;
    }

    const sellerInfo = sellerIndex[sellerId];

    if (!sellersMap[sellerId]) {
      sellersMap[sellerId] = {
        seller_id: sellerId,
        name: sellerInfo
          ? `${sellerInfo.first_name.trim()} ${sellerInfo.last_name.trim()}`
          : `Продавец ${sellerId}`,
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {}
      };
    }

    const stats = sellersMap[sellerId];
    stats.sales_count += 1;

    record.items.forEach(item => {
      const sku = String(item.sku).trim().toLowerCase();
      const product = productIndex[sku];

      if (!product) {
        return;
      }

      const revenueRaw = calculateRevenue(item, product);

      if (typeof revenueRaw !== 'number' || Number.isNaN(revenueRaw)) {
        return;
      }

      const revenue = roundMoney(revenueRaw);
      const cost = (Number(product.purchase_price) || 0) * (item.quantity ?? 0);
      const profitLine = roundMoney(revenue - cost);

      stats.revenue += revenue;
      stats.profit += profitLine;

      if (!stats.products_sold[sku]) {
        stats.products_sold[sku] = 0;
      }
      stats.products_sold[sku] += (item.quantity ?? 0);
    });
  });

  const resultList = Object.values(sellersMap);

  // ТОЛЬКО по прибыли, без вторичной сортировки
  resultList.sort((a, b) => b.profit - a.profit);

  const totalSellers = resultList.length;
  resultList.forEach((seller, index) => {
    const roundedProfit = roundMoney(seller.profit);
    seller.bonus = calculateBonus(index, totalSellers, { ...seller, profit: roundedProfit });

    const productsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => {
        if (b.quantity !== a.quantity) {
          return b.quantity - a.quantity;
        }
        return a.sku.localeCompare(b.sku);
      });

    seller.top_products = productsArray.slice(0, 10);
  });

  return resultList.map(seller => ({
    seller_id: seller.seller_id,
    name: seller.name,
    revenue: roundMoney(seller.revenue),
    profit: roundMoney(seller.profit),
    sales_count: seller.sales_count,
    top_products: seller.top_products,
    bonus: roundMoney(seller.bonus)
  }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzeSalesData,
    calculateSimpleRevenue,
    calculateBonusByProfit,
    roundMoney,
    buildProductIndex,
    buildSellerIndex
  };
}
