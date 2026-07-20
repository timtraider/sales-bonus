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
  // Жёсткие проверки: если чего‑то нет — сразу ошибка, как хотят тесты
  if (!data || typeof data !== 'object') {
    throw new Error('Ожидается объект с данными');
  }
  if (!Array.isArray(data.purchase_records)) {
    throw new Error('В данных отсутствует purchase_records');
  }
  if (!Array.isArray(data.sellers)) {
    throw new Error('В данных отсутствует sellers');
  }
  if (!Array.isArray(data.products)) {
    throw new Error('В данных отсутствует products');
  }

  const { calculateRevenue, calculateBonus } = options;
  if (typeof calculateRevenue !== 'function') {
    throw new Error('Требуется функция calculateRevenue');
  }
  if (typeof calculateBonus !== 'function') {
    throw new Error('Требуется функция calculateBonus');
  }

  // Строим быстрые справочники
  const productIndex = buildProductIndex(data.products);
  const sellerIndex = buildSellerIndex(data.sellers);

  const sellersMap = {};

  data.purchase_records.forEach(record => {
    const sellerId = record.seller_id;
    if (!sellerId) return;

    const sellerInfo = sellerIndex[sellerId];
    if (!sellersMap[sellerId]) {
      sellersMap[sellerId] = {
        seller_id: sellerId,
        name: sellerInfo
          ? `${sellerInfo.first_name} ${sellerInfo.last_name}`
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
      const sku = item.sku;
      const product = productIndex[sku];
      if (!product) return;

      // Считаем выручку по строке чека
      const revenue = calculateRevenue(item, product);
      // Себестоимость: закупочная цена × количество
      const cost = (product.purchase_price ?? 0) * (item.quantity ?? 0);
      const profitLine = revenue - cost;

      // ВАЖНО: не округляем здесь. Копим точные числа, чтобы копейки сошлись с тестами
      stats.revenue += revenue;
      stats.profit += profitLine;

      if (!stats.products_sold[sku]) {
        stats.products_sold[sku] = 0;
      }
      stats.products_sold[sku] += (item.quantity ?? 0);
    });
  });

  const resultList = Object.values(sellersMap);

  // Сортируем по прибыли (убывание)
  resultList.sort((a, b) => b.profit - a.profit);

  const totalSellers = resultList.length;
  resultList.forEach((seller, index) => {
    seller.bonus = calculateBonus(index, totalSellers, seller);

    // Топ‑10 товаров
    const productsArray = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({ sku, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    seller.top_products = productsArray.slice(0, 10);
  });

  // Округляем только в самом конце, чтобы совпадали копейки с эталоном
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

/**
 * Вспомогательная функция для аккуратного округления денег до 2 знаков.
 * toFixed(2) делает строку, плюс спереди превращает её обратно в число.
 */
function roundMoney(value) {
  return +value.toFixed(2);
}
