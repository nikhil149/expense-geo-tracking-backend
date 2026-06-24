const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// GET spending grouped by category (for pie charts & bar graphs)
router.get('/spending-by-category', async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    let query = db('transactions')
      .where('transactions.user_id', req.user.id)
      .andWhere('transactions.type', 'expense') // standard spending only
      .select('categories.id as category_id', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon')
      .sum('transactions.amount as total_amount')
      .join('categories', 'transactions.category_id', 'categories.id');

    if (startDate) {
      query = query.where('transactions.date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('transactions.date', '<=', endDate);
    }

    query = query
      .groupBy('categories.id')
      .orderBy('total_amount', 'desc');

    const spending = await query;
    res.json(spending);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET geolocated transaction points (pins/heatmaps) with category & date filters
router.get('/spending-locations', async (req, res) => {
  const { category_id, startDate, endDate } = req.query;

  try {
    let query = db('transactions')
      .where('transactions.user_id', req.user.id)
      .select('transactions.id', 'transactions.title', 'transactions.amount', 'transactions.type', 'transactions.date', 'transactions.latitude', 'transactions.longitude', 'transactions.location_name', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .whereNotNull('transactions.latitude')
      .whereNotNull('transactions.longitude');

    if (category_id) {
      query = query.where('transactions.category_id', category_id);
    }
    if (startDate) {
      query = query.where('transactions.date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('transactions.date', '<=', endDate);
    }

    query = query.orderBy('transactions.date', 'desc');

    const locations = await query;
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET dashboard brief (overall metrics: incomes, expenses, investments, cash balances)
router.get('/summary', async (req, res) => {
  try {
    const aggregates = await db('transactions')
      .where('transactions.user_id', req.user.id)
      .select('type')
      .sum('amount as total')
      .groupBy('type');

    let totalIncome = 0;
    let totalExpense = 0;
    let totalInvestment = 0;

    aggregates.forEach((row) => {
      const val = parseFloat(row.total) || 0;
      if (row.type === 'income') totalIncome = val;
      if (row.type === 'expense') totalExpense = val;
      if (row.type === 'investment') totalInvestment = val;
    });

    const netSavings = totalIncome - totalExpense - totalInvestment;

    res.json({
      totalIncome,
      totalExpense,
      totalInvestment,
      netSavings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET regional spending aggregation within a geographic bounding box
router.get('/spending-by-region', async (req, res) => {
  const { minLat, maxLat, minLng, maxLng } = req.query;

  if (!minLat || !maxLat || !minLng || !maxLng) {
    return res.status(400).json({
      error: 'Bounding box required: minLat, maxLat, minLng, maxLng',
    });
  }

  try {
    // Base query builder — all non-transfer transactions within the bounding box
    const baseQuery = () =>
      db('transactions')
        .where('transactions.user_id', req.user.id)
        .whereNot('transactions.type', 'transfer')
        .whereNotNull('transactions.latitude')
        .whereNotNull('transactions.longitude')
        .whereBetween('transactions.latitude', [parseFloat(minLat), parseFloat(maxLat)])
        .whereBetween('transactions.longitude', [parseFloat(minLng), parseFloat(maxLng)]);

    const now = new Date();

    // 7 days ago
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Start of current calendar month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all three aggregations in parallel
    const [totalResult, last7Result, monthResult] = await Promise.all([
      // All-time
      baseQuery()
        .sum('amount as total')
        .count('id as count')
        .first(),
      // Last 7 days
      baseQuery()
        .where('transactions.date', '>=', sevenDaysAgo)
        .sum('amount as total')
        .count('id as count')
        .first(),
      // Current calendar month
      baseQuery()
        .where('transactions.date', '>=', monthStart)
        .sum('amount as total')
        .count('id as count')
        .first(),
    ]);

    res.json({
      totalSpending: parseFloat(totalResult.total) || 0,
      transactionCount: parseInt(totalResult.count) || 0,
      last7DaysSpending: parseFloat(last7Result.total) || 0,
      last7DaysCount: parseInt(last7Result.count) || 0,
      currentMonthSpending: parseFloat(monthResult.total) || 0,
      currentMonthCount: parseInt(monthResult.count) || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
