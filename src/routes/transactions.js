const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// Helper to recalculate goal totals when investments change
async function updateGoalProgress(goalId) {
  if (!goalId) return;
  try {
    const sumResult = await db('investments')
      .where('goal_id', goalId)
      .sum('allocated_amount as total')
      .first();
    const totalAllocated = parseFloat(sumResult.total) || 0;
    await db('goals').where('id', goalId).update({ current_amount: totalAllocated });
  } catch (error) {
    console.error(`Failed to update progress for goal ${goalId}:`, error.message);
  }
}

// GET all transactions with filters
router.get('/', async (req, res) => {
  const { category_id, type, startDate, endDate, search, limit } = req.query;

  try {
    let query = db('transactions')
      .where('transactions.user_id', req.user.id)
      .select('transactions.*', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon', 'investments.goal_id as linked_goal_id', 'goals.name as linked_goal_name')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .leftJoin('investments', 'transactions.id', 'investments.transaction_id')
      .leftJoin('goals', 'investments.goal_id', 'goals.id');

    if (category_id) {
      query = query.where('transactions.category_id', category_id);
    }
    if (type) {
      query = query.where('transactions.type', type);
    }
    if (startDate) {
      query = query.where('transactions.date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('transactions.date', '<=', endDate);
    }
    if (search) {
      query = query.where('transactions.title', 'like', `%${search}%`);
    }

    query = query.orderBy('transactions.date', 'desc');

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const transactions = await query;
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single transaction
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const transaction = await db('transactions')
      .select('transactions.*', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon', 'investments.goal_id as linked_goal_id')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .leftJoin('investments', 'transactions.id', 'investments.transaction_id')
      .where('transactions.id', id)
      .andWhere('transactions.user_id', req.user.id)
      .first();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create transaction (supports linking directly to a savings goal)
router.post('/', async (req, res) => {
  const { title, amount, type, date, category_id, latitude, longitude, location_name, notes, goal_id } = req.body;

  if (!title || amount === undefined || !type || !date) {
    return res.status(400).json({ error: 'Title, amount, type, and date are required.' });
  }

  try {
    let newTransactionId;

    // Use a Knex transaction to ensure atomic execution
    await db.transaction(async (trx) => {
      // Auto-assign category from previous transactions with the same store name
      let resolvedCategoryId = category_id ? parseInt(category_id) : null;
      if (!resolvedCategoryId && title) {
        const previousTx = await trx('transactions')
          .where('user_id', req.user.id)
          .whereNotNull('category_id')
          .whereRaw('LOWER(title) = ?', [title.toLowerCase()])
          .orderBy('date', 'desc')
          .select('category_id')
          .first();
        if (previousTx && previousTx.category_id) {
          resolvedCategoryId = previousTx.category_id;
        }
      }

      const insertedTx = await trx('transactions').insert({
        title,
        amount: parseFloat(amount),
        type,
        date,
        category_id: resolvedCategoryId,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        location_name: location_name || null,
        notes: notes || null,
        user_id: req.user.id
      }).returning('id');
      newTransactionId = typeof insertedTx[0] === 'object' ? insertedTx[0].id : insertedTx[0];

      // If linking to a goal as an investment, verify ownership and create the allocation
      if (goal_id) {
        const goal = await trx('goals').where({ id: goal_id, user_id: req.user.id }).first();
        if (goal) {
          await trx('investments').insert({
            transaction_id: newTransactionId,
            goal_id: parseInt(goal_id),
            allocated_amount: parseFloat(amount),
            allocated_date: date
          }).returning('id');
        }
      }
    });

    // Update goal accumulated progress outside the transaction block
    if (goal_id) {
      await updateGoalProgress(goal_id);
    }

    // Retrieve the fully populated new transaction to return
    const newTx = await db('transactions')
      .select('transactions.*', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon', 'investments.goal_id as linked_goal_id')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .leftJoin('investments', 'transactions.id', 'investments.transaction_id')
      .where('transactions.id', newTransactionId)
      .first();

    res.status(201).json(newTx);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update transaction
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, amount, type, date, category_id, latitude, longitude, location_name, notes, goal_id } = req.body;

  try {
    // 1. Fetch current transaction and its investment link (ensure ownership)
    const oldTx = await db('transactions').where({ id, user_id: req.user.id }).first();
    if (!oldTx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const oldInvestment = await db('investments').where('transaction_id', id).first();
    const oldGoalId = oldInvestment ? oldInvestment.goal_id : null;

    // 2. Perform updates inside transaction block
    await db.transaction(async (trx) => {
      await trx('transactions')
        .where('id', id)
        .update({
          title: title !== undefined ? title : oldTx.title,
          amount: amount !== undefined ? parseFloat(amount) : oldTx.amount,
          type: type !== undefined ? type : oldTx.type,
          date: date !== undefined ? date : oldTx.date,
          category_id: category_id !== undefined ? (category_id ? parseInt(category_id) : null) : oldTx.category_id,
          latitude: latitude !== undefined ? (latitude ? parseFloat(latitude) : null) : oldTx.latitude,
          longitude: longitude !== undefined ? (longitude ? parseFloat(longitude) : null) : oldTx.longitude,
          location_name: location_name !== undefined ? location_name : oldTx.location_name,
          notes: notes !== undefined ? notes : oldTx.notes
        });

      const finalAmount = amount !== undefined ? parseFloat(amount) : oldTx.amount;
      const finalDate = date !== undefined ? date : oldTx.date;

      // Handle linked goal investment updates
      if (goal_id !== undefined) {
        if (goal_id) {
          // Verify goal ownership
          const goal = await trx('goals').where({ id: goal_id, user_id: req.user.id }).first();
          if (goal) {
            // If goal was already linked, update it; otherwise insert new link
            if (oldInvestment) {
              await trx('investments')
                .where('transaction_id', id)
                .update({
                  goal_id: parseInt(goal_id),
                  allocated_amount: finalAmount,
                  allocated_date: finalDate
                });
            } else {
              await trx('investments').insert({
                transaction_id: id,
                goal_id: parseInt(goal_id),
                allocated_amount: finalAmount,
                allocated_date: finalDate
              }).returning('id');
            }
          }
        } else {
          // Explicitly unlinked: delete investment link
          if (oldInvestment) {
            await trx('investments').where('transaction_id', id).del();
          }
        }
      } else if (oldInvestment && amount !== undefined) {
        // If amount changed but goal_id was omitted in body, update allocated amount
        await trx('investments')
          .where('transaction_id', id)
          .update({
            allocated_amount: finalAmount
          });
      }
    });

    // 3. Recalculate affected goals
    if (oldGoalId) await updateGoalProgress(oldGoalId);
    if (goal_id && parseInt(goal_id) !== oldGoalId) {
      await updateGoalProgress(parseInt(goal_id));
    }

    const updatedTx = await db('transactions')
      .select('transactions.*', 'categories.name as category_name', 'categories.color as category_color', 'categories.icon as category_icon', 'investments.goal_id as linked_goal_id')
      .leftJoin('categories', 'transactions.category_id', 'categories.id')
      .leftJoin('investments', 'transactions.id', 'investments.transaction_id')
      .where('transactions.id', id)
      .first();

    res.json(updatedTx);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE transaction
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const tx = await db('transactions').where({ id, user_id: req.user.id }).first();
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const investment = await db('investments').where('transaction_id', id).first();
    const linkedGoalId = investment ? investment.goal_id : null;

    // Delete transaction (which deletes associated investments via cascade)
    await db('transactions').where('id', id).del();

    // Re-evaluate affected goal balance
    if (linkedGoalId) {
      await updateGoalProgress(linkedGoalId);
    }

    res.json({ message: 'Transaction deleted successfully.', id: parseInt(id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
