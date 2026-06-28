const knex = require('knex');
const config = require('../../knexfile');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const environment = process.env.NODE_ENV || 'development';
const activeConfig = config[environment] || config.development;

// Initialize database connection
const db = knex(activeConfig);

// Initialize DB schema and pre-populate seed data if empty
async function initDb() {
  console.log(`Initializing database schema for environment: ${environment}...`);

  // Ensure DB folder exists (only for local development SQLite instances)
  if (environment === 'development' && activeConfig.connection && activeConfig.connection.filename) {
    const dbDir = path.dirname(activeConfig.connection.filename);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  // 1. Create USERS Table
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('phone_number').notNullable().unique();
      table.string('name').notNullable();
      table.timestamps(true, true);
    });
    console.log('Table "users" created successfully.');
  } else {
    // Migration: Check if legacy email column exists and migrate to phone_number
    const hasEmail = await db.schema.hasColumn('users', 'email');
    if (hasEmail) {
      console.log('Migrating legacy "users" table to phone auth...');
      await db.schema.alterTable('users', (table) => {
        table.string('phone_number').unique(); // Allow null temporarily
      });
      // Delete old users since they don't have phone numbers
      await db('users').del();
      await db.schema.alterTable('users', (table) => {
        table.dropColumn('email');
        table.dropColumn('password_hash');
      });
      // Note: SQLite doesn't fully support altering column constraints to NOT NULL easily, 
      // but Knex handles basic drops. Since we deleted the data, any new inserts will require phone_number anyway.
      console.log('Migration complete.');
    }
  }

  // 2. Create CATEGORIES Table
  const hasCategories = await db.schema.hasTable('categories');
  if (!hasCategories) {
    await db.schema.createTable('categories', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable().unique();
      table.string('color').notNullable(); // Hex code for Category
      table.string('icon').notNullable();  // Lucide icon name
      table.boolean('is_custom').defaultTo(false);
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').nullable();
      table.timestamps(true, true);
    });
    console.log('Table "categories" created successfully.');
  }

  // 3. Create TRANSACTIONS Table
  const hasTransactions = await db.schema.hasTable('transactions');
  if (!hasTransactions) {
    await db.schema.createTable('transactions', (table) => {
      table.increments('id').primary();
      table.string('title').notNullable();
      table.decimal('amount', 14, 2).notNullable();
      table.string('type').notNullable(); // 'income', 'expense', or 'investment'
      table.datetime('date').notNullable();
      table.integer('category_id').unsigned().references('id').inTable('categories').onDelete('SET NULL');
      table.double('latitude');
      table.double('longitude');
      table.string('location_name');
      table.text('notes');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamps(true, true);
    });
    console.log('Table "transactions" created successfully.');
  }

  // 4. Create GOALS Table
  const hasGoals = await db.schema.hasTable('goals');
  if (!hasGoals) {
    await db.schema.createTable('goals', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.decimal('target_amount', 14, 2).notNullable();
      table.decimal('current_amount', 14, 2).defaultTo(0).notNullable();
      table.datetime('target_date');
      table.string('color');
      table.string('icon');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamps(true, true);
    });
    console.log('Table "goals" created successfully.');
  }

  // 5. Create INVESTMENTS Table (Join Table linking transactions/investments to goals)
  const hasInvestments = await db.schema.hasTable('investments');
  if (!hasInvestments) {
    await db.schema.createTable('investments', (table) => {
      table.increments('id').primary();
      table.integer('transaction_id').unsigned().unique()
        .references('id').inTable('transactions').onDelete('CASCADE');
      table.integer('goal_id').unsigned().notNullable()
        .references('id').inTable('goals').onDelete('CASCADE');
      table.decimal('allocated_amount', 14, 2).notNullable();
      table.datetime('allocated_date').notNullable();
      table.timestamps(true, true);
    });
    console.log('Table "investments" created successfully.');
  }

  // 6. Create OTPS Table
  const hasOtps = await db.schema.hasTable('otps');
  if (!hasOtps) {
    await db.schema.createTable('otps', (table) => {
      table.increments('id').primary();
      table.string('phone_number').notNullable().unique();
      table.string('otp_code').notNullable();
      table.datetime('expires_at').notNullable();
      table.timestamps(true, true);
    });
    console.log('Table "otps" created successfully.');
  }

  // --- Seed Data ---

  // Seed Default User if empty
  const userCount = await db('users').count('id as count').first();
  if (parseInt(userCount.count) === 0) {
    await db('users').insert({
      id: 1,
      phone_number: '+1234567890',
      name: 'Nikhil Rachawar'
    });
    console.log('Default user "+1234567890" seeded.');
  }

  // Seed Categories if empty
  const categoryCount = await db('categories').count('id as count').first();
  if (parseInt(categoryCount.count) === 0) {
    const defaultCategories = [
      { name: 'Food & Dining', color: '#EC4899', icon: 'utensils', is_custom: false, user_id: null },
      { name: 'Transport', color: '#3B82F6', icon: 'car', is_custom: false, user_id: null },
      { name: 'Housing & Rent', color: '#10B981', icon: 'home', is_custom: false, user_id: null },
      { name: 'Utilities', color: '#F59E0B', icon: 'zap', is_custom: false, user_id: null },
      { name: 'Entertainment', color: '#8B5CF6', icon: 'film', is_custom: false, user_id: null },
      { name: 'Health & Gym', color: '#EF4444', icon: 'heart-pulse', is_custom: false, user_id: null },
      { name: 'Shopping', color: '#06B6D4', icon: 'shopping-bag', is_custom: false, user_id: null },
      { name: 'Salary & Income', color: '#10B981', icon: 'trending-up', is_custom: false, user_id: null },
      { name: 'Investments', color: '#6366F1', icon: 'bar-chart-2', is_custom: false, user_id: null }
    ];
    await db('categories').insert(defaultCategories);
    console.log('Default categories seeded.');
  }

  // Seed Goals if empty
  const goalCount = await db('goals').count('id as count').first();
  if (parseInt(goalCount.count) === 0) {
    const defaultGoals = [
      {
        name: 'Europe Vacation Fund',
        target_amount: 6000.00,
        current_amount: 0, // calculated from investments
        target_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months from now
        color: '#8B5CF6',
        icon: 'plane',
        user_id: 1
      },
      {
        name: 'Tesla Model 3 Deposit',
        target_amount: 15000.00,
        current_amount: 0,
        target_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        color: '#6366F1',
        icon: 'zap',
        user_id: 1
      },
      {
        name: 'Emergency Nest Egg',
        target_amount: 10000.00,
        current_amount: 0,
        target_date: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000).toISOString(),
        color: '#10B981',
        icon: 'shield',
        user_id: 1
      }
    ];
    await db('goals').insert(defaultGoals);
    console.log('Default savings goals seeded.');
  }

  // Seed Transactions and Investments if empty
  const transactionCount = await db('transactions').count('id as count').first();
  if (parseInt(transactionCount.count) === 0) {
    const cats = await db('categories').select('id', 'name');
    const getCatId = (name) => cats.find((c) => c.name === name).id;

    // Standard geographical references centered in San Francisco, CA
    const baseLat = 37.7749;
    const baseLng = -122.4194;

    const mockTransactions = [
      {
        title: 'Blue Bottle Coffee',
        amount: 8.50,
        type: 'expense',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        category_id: getCatId('Food & Dining'),
        latitude: baseLat + 0.0035,
        longitude: baseLng - 0.0042,
        location_name: 'Blue Bottle Coffee, SOMA',
        notes: 'Espresso and morning croissant.',
        user_id: 1
      },
      {
        title: 'Safeway Groceries',
        amount: 84.20,
        type: 'expense',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Food & Dining'),
        latitude: baseLat - 0.0084,
        longitude: baseLng + 0.0092,
        location_name: 'Safeway, Market St',
        notes: 'Weekly groceries replenishment.',
        user_id: 1
      },
      {
        title: 'Monthly Rent',
        amount: 2200.00,
        type: 'expense',
        date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Housing & Rent'),
        latitude: baseLat,
        longitude: baseLng,
        location_name: 'Mission District Apartments',
        notes: 'May Rent payment.',
        user_id: 1
      },
      {
        title: 'Bi-Weekly Paycheck',
        amount: 3200.00,
        type: 'income',
        date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Salary & Income'),
        latitude: baseLat + 0.012,
        longitude: baseLng - 0.008,
        location_name: 'TechCorp Headquarters, Downtown SF',
        notes: 'Regular salary deposit.',
        user_id: 1
      },
      {
        title: 'Shell Gas Station',
        amount: 45.60,
        type: 'expense',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Transport'),
        latitude: baseLat - 0.0062,
        longitude: baseLng - 0.0112,
        location_name: 'Shell Fuel Station, Potrero Hill',
        notes: 'Filled up the tank.',
        user_id: 1
      },
      {
        title: 'Equinox Fitness Club',
        amount: 150.00,
        type: 'expense',
        date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Health & Gym'),
        latitude: baseLat + 0.0055,
        longitude: baseLng - 0.0025,
        location_name: 'Equinox Gym, Union St',
        notes: 'Monthly membership dues.',
        user_id: 1
      },
      {
        title: 'CVS Pharmacy',
        amount: 22.40,
        type: 'expense',
        date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Health & Gym'),
        latitude: baseLat + 0.0022,
        longitude: baseLng + 0.0035,
        location_name: 'CVS, SOMA',
        notes: 'Vitamins and medicine.',
        user_id: 1
      },
      {
        title: 'Dolores Park Cafe',
        amount: 19.50,
        type: 'expense',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Food & Dining'),
        latitude: baseLat - 0.0145,
        longitude: baseLng - 0.0078,
        location_name: 'Dolores Park Cafe, Mission St',
        notes: 'Brunch with friends.',
        user_id: 1
      },
      {
        title: 'Uber Ride',
        amount: 18.25,
        type: 'expense',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Transport'),
        latitude: baseLat + 0.0095,
        longitude: baseLng - 0.0155,
        location_name: 'Marina District Pick-up',
        notes: 'Late night rideshare home.',
        user_id: 1
      },
      {
        title: 'AMC Metreon Theater',
        amount: 32.00,
        type: 'expense',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Entertainment'),
        latitude: baseLat + 0.0048,
        longitude: baseLng - 0.0031,
        location_name: 'AMC Metreon, Mission St',
        notes: 'Movie night: tickets and popcorn.',
        user_id: 1
      },
      {
        title: 'Apple Store purchase',
        amount: 129.00,
        type: 'expense',
        date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Shopping'),
        latitude: baseLat + 0.0075,
        longitude: baseLng - 0.0055,
        location_name: 'Apple Store, Union Square',
        notes: 'New MagSafe battery pack.',
        user_id: 1
      },
      {
        title: 'Pacific Gas & Electric',
        amount: 98.40,
        type: 'expense',
        date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Utilities'),
        latitude: baseLat + 0.0185,
        longitude: baseLng - 0.0012,
        location_name: 'PG&E SF Corporate Center',
        notes: 'Electricity and heating bill.',
        user_id: 1
      },
      // Investments linked to Goals
      {
        title: 'Europe Fund Allocation',
        amount: 500.00,
        type: 'investment',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Investments'),
        latitude: baseLat + 0.002,
        longitude: baseLng - 0.002,
        location_name: 'Charles Schwab Digital Platform',
        notes: 'Monthly savings auto-transferred to Travel goals.',
        user_id: 1
      },
      {
        title: 'Tesla Target Savings',
        amount: 1000.00,
        type: 'investment',
        date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Investments'),
        latitude: baseLat + 0.002,
        longitude: baseLng - 0.002,
        location_name: 'Fidelity Brokerage Account',
        notes: 'Allocating index fund gains to Tesla deposit.',
        user_id: 1
      },
      {
        title: 'Emergency Cache Deposit',
        amount: 800.00,
        type: 'investment',
        date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Investments'),
        latitude: baseLat + 0.002,
        longitude: baseLng - 0.002,
        location_name: 'Ally High-Yield Savings Account',
        notes: 'Safety net growth addition.',
        user_id: 1
      },
      {
        title: 'Europe Bonus Deposit',
        amount: 250.00,
        type: 'investment',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        category_id: getCatId('Investments'),
        latitude: baseLat + 0.002,
        longitude: baseLng - 0.002,
        location_name: 'Charles Schwab Digital Platform',
        notes: 'Additional transfer for Europe fund.',
        user_id: 1
      }
    ];

    // Insert mock transactions
    await db('transactions').insert(mockTransactions);
    console.log('Mock geographical transactions seeded.');

    // Fetch goals and newly inserted transactions to establish mappings
    const seededGoals = await db('goals').select('id', 'name');
    const seededTx = await db('transactions').select('id', 'title', 'amount', 'date');

    const getGoalId = (name) => seededGoals.find((g) => g.name === name).id;
    const getTxId = (title) => seededTx.find((t) => t.title === title).id;

    // Create Goal investment mappings
    const mockInvestments = [
      {
        transaction_id: getTxId('Europe Fund Allocation'),
        goal_id: getGoalId('Europe Vacation Fund'),
        allocated_amount: 500.00,
        allocated_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        transaction_id: getTxId('Tesla Target Savings'),
        goal_id: getGoalId('Tesla Model 3 Deposit'),
        allocated_amount: 1000.00,
        allocated_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        transaction_id: getTxId('Emergency Cache Deposit'),
        goal_id: getGoalId('Emergency Nest Egg'),
        allocated_amount: 800.00,
        allocated_date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        transaction_id: getTxId('Europe Bonus Deposit'),
        goal_id: getGoalId('Europe Vacation Fund'),
        allocated_amount: 250.00,
        allocated_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    await db('investments').insert(mockInvestments);
    console.log('Mock investments seeded and linked to savings goals.');

    // Update goal current_amounts
    for (const goal of seededGoals) {
      const sumResult = await db('investments')
        .where('goal_id', goal.id)
        .sum('allocated_amount as total')
        .first();
      const totalAllocated = parseFloat(sumResult.total) || 0;
      await db('goals').where('id', goal.id).update({ current_amount: totalAllocated });
    }
    console.log('Goal current accumulated balances calculated & updated.');
  }

  // Postgres sequences get out of sync when we manually insert hardcoded IDs during seeding.
  // We must reset the auto-increment sequences to the MAX(id) of each table.
  if (activeConfig.client === 'pg') {
    const tables = ['users', 'categories', 'transactions', 'goals', 'investments'];
    for (const table of tables) {
      try {
        await db.raw(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) + 1 FROM ${table}), 1), false)`);
      } catch (err) {
        // Silently ignore if sequence doesn't exist
      }
    }
    console.log('PostgreSQL auto-increment sequences synchronized.');
  }

  console.log('Database ready and fully seeded.');
}

module.exports = {
  db,
  initDb
};
