const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'src', 'db', 'dev.sqlite3')
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, cb) => {
        // Enable foreign key support in SQLite
        conn.run('PRAGMA foreign_keys = ON', cb);
      }
    }
  },
  production: {
    client: 'pg',
    connection: () => {
      let host, port, user, database, password;
      
      // Support for existing full connection strings OR explicit variables
      if (process.env.DATABASE_URL) {
        const parsed = new URL(process.env.DATABASE_URL);
        host = parsed.hostname;
        port = parsed.port || '5432';
        user = parsed.username;
        database = parsed.pathname.replace('/', '');
        password = decodeURIComponent(parsed.password);
      } else {
        host = process.env.DB_HOST;
        port = process.env.DB_PORT || '5432';
        user = process.env.DB_USER;
        database = process.env.DB_NAME;
        password = process.env.DB_PASSWORD;
      }

      let ssl = false;
      if (process.env.DATABASE_SSL === 'true') {
        ssl = { rejectUnauthorized: false };
      } else if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) {
        ssl = { rejectUnauthorized: false };
      }

      return {
        host,
        port: parseInt(port, 10),
        user,
        database,
        password,
        ssl,
      };
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};
