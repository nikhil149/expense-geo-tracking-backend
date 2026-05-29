const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// GET all categories
router.get('/', async (req, res) => {
  try {
    const categories = await db('categories').select('*').orderBy('id', 'asc');
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
    const [id] = await db('categories').insert({
      name,
      color,
      icon,
      is_custom: true
    });
    
    const newCategory = await db('categories').where('id', id).first();
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
