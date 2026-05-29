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
  }
};
