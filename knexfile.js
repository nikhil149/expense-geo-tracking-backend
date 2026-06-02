const path = require('path');
const { Signer } = require('@aws-sdk/rds-signer');

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
      let host, port, user, database;
      
      // Support for existing full connection strings OR explicit variables
      if (process.env.DATABASE_URL) {
        const parsed = new URL(process.env.DATABASE_URL);
        host = parsed.hostname;
        port = parsed.port || '5432';
        user = parsed.username;
        database = parsed.pathname.replace('/', '');
      } else {
        host = process.env.DB_HOST;
        port = process.env.DB_PORT || '5432';
        user = process.env.DB_USER;
        database = process.env.DB_NAME;
      }

      return {
        host,
        port: parseInt(port, 10),
        user,
        database,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        password: async () => {
          // Generates a fresh 15-minute token using the AWS SDK
          // This function is invoked automatically by node-postgres (pg) 
          // whenever a new database connection is spawned by the pool.
          const signer = new Signer({
            region: process.env.AWS_REGION || 'ap-south-1',
            hostname: host,
            port: parseInt(port, 10),
            username: user,
          });
          return await signer.getAuthToken();
        }
      };
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};
