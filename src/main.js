/**
 * Создаёт быстрый справочник товаров: ключ — sku, значение — карточка товара.
 * Это нужно, чтобы внутри циклов не искать товар по всему массиву.
 */
function buildProductIndex(products) {
  if (!Array.isArray(products)) return {};

  return Object.fromEntries(
    products
      .filter(p => p && p.sku)
      .map(product => [product.sku, product])
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
function calculateSimpleRevenue(item, _product) {
  const qty = item.quantity ?? 0;
  const price = item.sale_price ?? 0;
  const discountPercent = item.discount ?? 0;

  if (qty === 0 || price === 0) return 0;

  const discountFactor = 1 - discountPercent / 100;
  return price * qty * discountFactor;
}

/**
 * Считает бонус по месту в рейтинге.
 * Правила:
 * - 1-е место (index 0): 15%
 * - 2–3 места (index 1, 2): 10%
 * - Последний продавец: 0%
 * - Остальные: 5%
 */
function calculateBonusByProfit(index, total, seller) {
  if (total <= 1) return 0; // если продавец один — бонусов нет

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
 * Главная функция: собирает статистику по продажам, считает прибыль, бонусы и топ‑товары.
 * Возвращает итоговый отчёт в понятном формате.
 */
function analyzeSalesData(data, options) {
  // --- Защита от неверных входных данных ---
  if (!data || typeof data !== 'object') {
    throw new Error('Ожидается объект с данными');
  }
  if (!Array.isArray(data.purchase_records)) {
    throw new Error('В данных отсутствует purchase_records');
  }

  const { calculateRevenue, calculateBonus } = options;
  if (typeof calculateRevenue !== 'function') {
    throw new Error('Требуется функция calculateRevenue');
  }
  if (typeof calculateBonus !== 'function') {
    throw new Error('Требуется функция calculateBonus');
  }

  // --- Шаг 1: строим быстрые справочники (индексы) ---
  const productIndex = buildProductIndex(data.products || []);
  const sellerIndex = buildSellerIndex(data.sellers || []);

  // Хранилище статистики: ключ — seller_id, значение — объект со счётчиками
  const sellersMap = {};

  // --- Шаг 2: двойной цикл — проходим по всем чекам и всем товарам в них ---
  data.purchase_records.forEach(record => {
    const sellerId = record.seller_id;
    if (!sellerId) return; // пропускаем чеки без продавца

    const sellerInfo = sellerIndex[sellerId];

    // Если продавца ещё нет в статистике — создаём запись
    if (!sellersMap[sellerId]) {
      sellersMap[sellerId] = {
        seller_id: sellerId,
        name: sellerInfo
          ? `${sellerInfo.first_name} ${sellerInfo.last_name}`
          : `Продавец ${sellerId}`,
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {} // { sku: количество проданных штук }
      };
    }

    const stats = sellersMap[sellerId];
    stats.sales_count += 1; // один чек = одна продажа

    record.items.forEach(item => {
      const sku = item.sku;
      const product = productIndex[sku];

      if (!product) return; // если товара нет в каталоге — пропускаем

      // Выручка по строке чека (с учётом скидки)
      const revenue = calculateRevenue(item, product);

      // Себестоимость: закупочная цена × количество
      const cost = (product.purchase_price ?? 0) * (item.quantity ?? 0);

      // Прибыль по строке: выручка минус себестоимость
      const profitLine = revenue - cost;

      stats.revenue += revenue;
      stats.profit += profitLine;

      // Учёт количества проданных товаров по каждому артикулу
      if (!stats.products_sold[sku]) {
        stats.products_sold[sku] = 0;
      }
      stats.products_sold[sku] += (item.quantity ?? 0);
    });
  });

  // Превращаем словарь статистики в массив для удобной сортировки и маппинга
  const resultList = Object.values(sellersMap);

  // --- Шаг 3: сортируем продавцов по прибыли (убывание) ---
  resultList.sort((a, b) => b.profit - a.profit);

  // --- Шаг 4: считаем бонусы и формируем топ‑10 товаров для каждого продавца ---
  const totalSellers = resultList.length;

  resultList.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, totalSellers, seller);

    // Превращаем объект { sku: qty } в массив объектов [{ sku, quantity }]
    const productsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => b.quantity - a.quantity); // сортируем по убыванию количества

    seller.top_products = productsArray.slice(0, 10); // берём топ‑10
  });

  // --- Шаг 5: формируем итоговый отчёт с аккуратными числами ---
  return resultList.map(seller => ({
    seller_id: seller.seller_id,
    name: seller.name,
    revenue: roundMoney(seller.revenue),
    profit: roundMoney(seller.profit),
    sales_count: seller.sales_count, // оставляем целым
    top_products: seller.top_products,
    bonus: roundMoney(seller.bonus)
  }));
}

/**
 * Вспомогательная функция для аккуратного округления денег до 2 знаков.
 * toFixed(2) делает строку, плюс спереди превращает её обратно в число.
 */
function roundMoney(value) {
  return +value.toFixed(2);
}
