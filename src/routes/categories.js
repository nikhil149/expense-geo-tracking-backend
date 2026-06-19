const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// GET all categories
router.get('/', async (req, res) => {
  try {
    const categories = await db('categories')
      .whereNull('user_id')
      .orWhere('user_id', req.user.id)
      .select('*')
      .orderBy('id', 'asc');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a custom category
router.post('/', async (req, res) => {
  const { name, color, icon } = req.body;
  
  if (!name || !color || !icon) {
    return res.status(400).json({ error: 'Category name, color, and icon are required.' });
  }

  try {
    const insertedCategory = await db('categories').insert({
      name,
      color: color || '#6B7280',
      icon: icon || 'HelpCircle',
      is_custom: true,
      user_id: req.user.id
    }).returning('id');
    
    const id = typeof insertedCategory[0] === 'object' ? insertedCategory[0].id : insertedCategory[0];

    const newCategory = await db('categories').where({ id }).first();
    res.status(201).json(newCategory);
  } catch (error) {
    // Unique constraint violation check for SQLite
    if (error.message.includes('UNIQUE') || error.code === '23505') {
      return res.status(400).json({ error: 'A category with this name already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
