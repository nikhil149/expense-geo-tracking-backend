const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// GET all goals
router.get('/', async (req, res) => {
  try {
    const goals = await db('goals').select('*').orderBy('id', 'asc');
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single goal with linked transactions/investments list
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const goal = await db('goals').where('id', id).first();
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    // Retrieve all linked investments and populate transaction details
    const investments = await db('investments')
      .select('investments.*', 'transactions.title as transaction_title', 'transactions.amount as transaction_amount', 'transactions.type as transaction_type')
      .join('transactions', 'investments.transaction_id', 'transactions.id')
      .where('investments.goal_id', id)
      .orderBy('investments.allocated_date', 'desc');

    res.json({
      ...goal,
      investments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create savings goal
router.post('/', async (req, res) => {
  const { name, target_amount, target_date, color, icon } = req.body;

  if (!name || target_amount === undefined) {
    return res.status(400).json({ error: 'Goal name and target amount are required.' });
  }

  try {
    const [id] = await db('goals').insert({
      name,
      target_amount: parseFloat(target_amount),
      current_amount: 0.00,
      target_date: target_date || null,
      color: color || '#8B5CF6', // Default accent violet
      icon: icon || 'target'
    });

    const newGoal = await db('goals').where('id', id).first();
    res.status(201).json(newGoal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update savings goal
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, target_amount, target_date, color, icon } = req.body;

  try {
    const oldGoal = await db('goals').where('id', id).first();
    if (!oldGoal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    await db('goals')
      .where('id', id)
      .update({
        name: name !== undefined ? name : oldGoal.name,
        target_amount: target_amount !== undefined ? parseFloat(target_amount) : oldGoal.target_amount,
        target_date: target_date !== undefined ? target_date : oldGoal.target_date,
        color: color !== undefined ? color : oldGoal.color,
        icon: icon !== undefined ? icon : oldGoal.icon
      });

    const updatedGoal = await db('goals').where('id', id).first();
    res.json(updatedGoal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE savings goal (deletes linked investments allocations via CASCADE)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const goal = await db('goals').where('id', id).first();
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    await db('goals').where('id', id).del();
    res.json({ message: 'Savings goal deleted successfully.', id: parseInt(id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
