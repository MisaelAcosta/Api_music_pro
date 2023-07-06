const mongodb = require('mongodb');
const Database = require('./lib/database');

module.exports = function vgMongo(connString, dbname, options) {
  const db = new Database(connString, dbname, options);
  if (typeof Proxy !== 'undefined') {
    const handler = {
      get: function _get(obj, prop) {
        if (prop === 'on' || prop === 'emit') {
          return db[prop].bind(db);
        }

        if (db[prop]) return db[prop];
        if (typeof prop === 'symbol') return db[prop];

        db[prop] = db.collection(prop);
        return db[prop];
      },
    };

    return Proxy.create === undefined ? new Proxy({}, handler) : Proxy.create(handler);
  }
  return db;
};

// expose bson stuff visible in the shell
module.exports.Binary = mongodb.Binary;
module.exports.Code = mongodb.Code;
module.exports.DBRef = mongodb.DBRef;
module.exports.Double = mongodb.Double;
module.exports.Int32 = mongodb.Int32;
module.exports.Long = mongodb.Long;
module.exports.MaxKey = mongodb.MaxKey;
module.exports.MinKey = mongodb.MinKey;
module.exports.NumberLong = mongodb.Long;
module.exports.ObjectId = mongodb.ObjectId;
module.exports.ObjectID = mongodb.ObjectID;
module.exports.Symbol = mongodb.Symbol;
module.exports.Timestamp = mongodb.Timestamp;
module.exports.Map = mongodb.Map;
module.exports.Decimal128 = mongodb.Decimal128;

module.exports.default = module.exports;
