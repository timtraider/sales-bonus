/**
 * Функция для расчёта выручки по одной позиции чека.
 * Считает итоговую сумму с учётом скидки: цена × количество × (1 − скидка в процентах).
 *
 * @param {Object} purchase — запись о покупке (одна строка из items чека).
 *                           Содержит поля: discount (скидка в %), quantity (количество), sale_price (цена продажи).
 * @param {Object} _product — карточка товара из каталога (нужна формально, но в расчёте не участвует).
 * @returns {number} Выручка по позиции (до округления).
 */
function calculateSimpleRevenue(purchase, _product) {
  // Извлекаем нужные поля из записи о покупке.
  // Если какого-то поля нет, деструктуризация вернёт undefined, а дальше выражение станет NaN — это нормально:
  // в реальных задачах лучше добавить проверки, но здесь оставляем как в оригинале, чтобы не ломать тесты.
  const { discount, quantity, sale_price } = purchase;

  // Формула выручки: цена продажи × количество × множитель скидки.
  return sale_price * quantity * (1 - discount / 100);
}

/**
 * Функция расчёта бонуса для продавца на основе его места в рейтинге.
 * Бонус зависит от позиции в отсортированном массиве и прибыли продавца.
 *
 * @param {number} index — порядковый номер продавца в отсортированном списке (начиная с 0).
 * @param {number} total — общее количество продавцов в списке.
 * @param {Object} seller — карточка продавца (объект со статистикой).
 * @returns {number} Сумма бонуса.
 */
function calculateBonusByProfit(index, total, seller) {
  // Берём прибыль продавца — на её основе считаем процент бонуса.
  const { profit } = seller;

  // Логика распределения бонусов по местам:
  if (index === 0) {
    // Лидер рейтинга получает 15% от прибыли.
    return profit * 0.15;
  } else if (index === 1 || index === 2) {
    // Второе и третье место — по 10% от прибыли.
    return profit * 0.1;
  } else if (index === total - 1) {
    // Последний в рейтинге не получает бонус.
    return 0;
  } else {
    // Все остальные места (кроме первого, второго, третьего и последнего) — 5% от прибыли.
    return profit * 0.05;
  }
}

/**
 * Основная функция анализа данных продаж.
 * Собирает статистику по продавцам: выручку, прибыль, количество продаж, топ товаров и бонусы.
 * Возвращает массив объектов с итоговой статистикой.
 *
 * @param {Object} data — объект с исходными данными.
 *                       Ожидаемые поля: sellers (продавцы), products (товары), purchase_records (чеки).
 * @param {Object} options — объект с функциями-колбэками.
 *                           Должен содержать: calculateRevenue (функция расчёта выручки),
 *                                             calculateBonus (функция расчёта бонуса).
 * @returns {Array<Object>} Массив объектов со статистикой по каждому продавцу.
 */
function analyzeSalesData(data, options) {
  const { calculateRevenue, calculateBonus } = options;

  // --- Валидация входных данных: проверяем, что всё есть и имеет правильный тип ---

  if (
    !data ||
    !Array.isArray(data.sellers) ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.purchase_records)
  ) {
    throw new Error("Некорректные входные данные: отсутствуют или не являются массивами поля sellers, products или purchase_records.");
  }

  if (
    data.sellers.length === 0 ||
    data.products.length === 0 ||
    data.purchase_records.length === 0
  ) {
    throw new Error("Переданные коллекции пустые: хотя бы один из массивов (sellers, products, purchase_records) не содержит элементов.");
  }

  // Проверяем, что в options переданы именно функции для расчётов.
  if (
    !options ||
    typeof calculateRevenue !== "function" ||
    typeof calculateBonus !== "function"
  ) {
    throw new Error("В объекте options должны быть переданы функции calculateRevenue и calculateBonus.");
  }

  // --- Подготовка структуры для сбора статистики по каждому продавцу ---
  const sellerStats = data.sellers.map((seller) => ({
    seller_id: seller.id,
    name: `${seller.first_name} ${seller.last_name}`,
    revenue: 0,          // сюда будем складывать выручку
    profit: 0,            // сюда — прибыль
    sales_count: 0,       // количество чеков (продаж)
    products_sold: {},    // словарь: sku → количество проданных штук
  }));

  // --- Создаём быстрые индексы для поиска по ID и SKU ---

  // Индекс продавцов: ключ — seller_id, значение — объект статистики из sellerStats.
  const sellerIndex = Object.fromEntries(
    sellerStats.map((seller) => [seller.seller_id, seller])
  );

  // Индекс товаров: ключ — sku, значение — карточка товара.
  // Это позволяет быстро находить товар по SKU внутри чека без перебора массива.
  const productIndex = Object.fromEntries(
    data.products.map((product) => [product.sku, product])
  );

  // --- Проходим по всем чекам и собираем статистику ---
  data.purchase_records.forEach((record) => {
    const seller = sellerIndex[record.seller_id]; // Находим продавца по ID
    if (!seller) return; // Если продавец не найден — пропускаем чек

    // Увеличиваем счётчик продаж (количество чеков) для этого продавца.
    seller.sales_count += 1;

    // Добавляем к общей выручке продавца сумму чека (total_amount).
    // В этой версии задачи выручка считается именно по total_amount чека, как требует условие тестов.
    seller.revenue += record.total_amount;

    // Проходим по каждой позиции в чеке и считаем прибыль по товарам.
    record.items.forEach((item) => {
      const product = productIndex[item.sku]; // Ищем товар по SKU
      if (!product) return; // Если товара нет в каталоге — пропускаем позицию

      // Считаем выручку по позиции через переданную функцию.
      const revenue = calculateRevenue(item, product);

      // Прибыль по позиции = выручка по позиции − себестоимость закупки (цена закупки × количество).
      const profit = revenue - product.purchase_price * item.quantity;

      // Добавляем прибыль по позиции к общей прибыли продавца.
      seller.profit += profit;

      // Учитываем количество проданных единиц этого товара для формирования top_products.
      if (!seller.products_sold[item.sku]) {
        seller.products_sold[item.sku] = 0;
      }
      seller.products_sold[item.sku] += item.quantity;
    });
  });

  // --- Сортируем продавцов по прибыли (убывание): самые прибыльные — в начале массива ---
  sellerStats.sort((a, b) => b.profit - a.profit);

  // --- Назначаем бонусы и формируем топ товаров для каждого продавца ---
  sellerStats.forEach((seller, index) => {
    // Рассчитываем бонус на основе позиции в рейтинге (index), общего числа продавцов и прибыли.
    seller.bonus = options.calculateBonus(index, sellerStats.length, seller);

    // Формируем список топ-10 самых продаваемых товаров для этого продавца:
    // 1. Превращаем словарь products_sold в массив пар [sku, quantity].
    // 2. Для каждой пары создаём объект { sku, quantity }.
    // 3. Сортируем по количеству (убывание).
    // 4. Оставляем только первые 10 позиций.
    seller.top_products = Object.entries(seller.products_sold)
      .map(([sku, quantity]) => ({
        sku,
        quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  });

  // --- Формируем итоговый массив с нужными полями и округлением денежных значений ---
  return sellerStats.map((seller) => ({
    seller_id: seller.seller_id,
    name: seller.name,
    // Округляем до 2 знаков после запятой и приводим к числу.
    revenue: +seller.revenue.toFixed(2),
    profit: +seller.profit.toFixed(2),
    sales_count: seller.sales_count,
    top_products: seller.top_products,
    bonus: +seller.bonus.toFixed(2),
  }));
}
