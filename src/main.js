/**
 * Функция для расчёта выручки
 */
function calculateSimpleRevenue(purchase, _product) {
  const { discount = 0, quantity = 0, sale_price = 0 } = purchase;
  if (quantity === 0 || sale_price === 0) return 0;
  const discountFactor = 1 - discount / 100;
  return sale_price * quantity * discountFactor;
}

/**
 * Функция для расчёта бонусов
 */
function calculateBonusByProfit(index, total, seller) {
  const { profit } = seller;
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

  return profit * (percent / 100);
}

/**
 * Надёжное округление денег до 2 знаков
 */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Главная функция анализа продаж
 */
function analyzeSalesData(data, options) {
  const { calculateRevenue, calculateBonus } = options;

  // Проверка входных данных
  if (!data || !Array.isArray(data.sellers) || !Array.isArray(data.products) || !Array.isArray(data.purchase_records)) {
    throw new Error('Некорректные входные данные!');
  }
  if (data.sellers.length === 0 || data.products.length === 0 || data.purchase_records.length === 0) {
    throw new Error('Переданные коллекции пустые!');
  }
  if (!options || typeof calculateRevenue !== 'function' || typeof calculateBonus !== 'function') {
    throw new Error('Требуется передать функции calculateRevenue и calculateBonus!');
  }

  // Подготовка статистики по продавцам
  const sellerStats = data.sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name} ${seller.last_name}`,
    revenue: 0,
    profit: 0,
    sales_count: 0,
    products_sold: {},
  }));

  // Индекс продавцов
  const sellerIndex = Object.fromEntries(
    sellerStats.map((s) => [s.seller_id, s])
  );

  // Индекс товаров: ключ — нормализованный SKU (нижний регистр), значение — карточка товара
  const productIndex = Object.fromEntries(
    data.products.map((product) => {
      const key = String(product.sku).trim().toLowerCase();
      return [key, product];
    })
  );

  // Обработка чеков
  data.purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id];
    if (!seller) return;

    seller.sales_count += 1;

    record.items.forEach((item) => {
      // Нормализуем SKU из чека для поиска в индексе
      const rawSku = String(item.sku).trim();
      const key = rawSku.toLowerCase();
      const product = productIndex[key];
      if (!product) return;

      const revenueRaw = calculateRevenue(item, product);
      if (typeof revenueRaw !== 'number' || Number.isNaN(revenueRaw)) return;

      // Выручка по позиции: округляем на уровне позиции, как принято в таких задачах
      const revenue = roundMoney(revenueRaw);
      seller.revenue += revenue;

      // Прибыль считаем без промежуточного округления, чтобы не накапливать ошибку
      const cost = (Number(product.purchase_price) || 0) * (item.quantity ?? 0);
      const profitLine = revenueRaw - cost;
      seller.profit += profitLine;

      // В статистику кладём оригинальный SKU из карточки товара (чтобы в ответе был правильный регистр)
      const displaySku = product.sku;
      if (!seller.products_sold[displaySku]) {
        seller.products_sold[displaySku] = 0;
      }
      seller.products_sold[displaySku] += (item.quantity ?? 0);
    });
  });

  // Сортировка продавцов по прибыли (убывание)
  sellerStats.sort((a, b) => b.profit - a.profit);

  const totalSellers = sellerStats.length;

  // Назначение бонусов и формирование top_products
  sellerStats.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, totalSellers, seller);

    seller.top_products = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => {
        // Сначала по количеству (убывание)
        if (b.quantity !== a.quantity) {
          return b.quantity - a.quantity;
        }
        // Потом по SKU строго по кодам символов (чтобы порядок был детерминированным)
        if (a.sku < b.sku) return -1;
        if (a.sku > b.sku) return 1;
        return 0;
      })
      .slice(0, 10);
  });

  // Финальный результат: все деньги округляем аккуратно
  return sellerStats.map((seller) => ({
    seller_id: seller.seller_id,
    name: seller.name,
    revenue: roundMoney(seller.revenue),
    profit: roundMoney(seller.profit),
    sales_count: seller.sales_count,
    top_products: seller.top_products,
    bonus: roundMoney(seller.bonus),
  }));
}
