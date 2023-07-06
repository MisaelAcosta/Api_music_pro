const {
  MongoClient,
  ObjectId,
} = require('mongodb');
const util = require('util');
const { EventEmitter } = require('events');
const thunky = require('thunky');
const debug = require('debug')('universal-vg-mongo:database');

const getTenantPattern = require('./tenants');

const Collection = require('./collection');

function noop() {}

function Database(connString, dbname = 'test', options = { }) {
  const self = this;
  this._dbname = dbname;
  EventEmitter.call(this);

  this.getTenantPattern = getTenantPattern;
  this._getConnection = thunky((cb) => {
    MongoClient.connect(connString, {
      ...options,
      useUnifiedTopology: true,
    }, (err, conn) => {
      if (err) {
        self.emit('error', err);
        return cb(err);
      }

      self.emit('connect');
      return cb(null, conn.db(this._dbname), conn);
    });
  });

  this.ObjectId = ObjectId;
}

util.inherits(Database, EventEmitter);

Database.prototype.collection = function collection(colName) {
  return new Collection({ name: colName }, this._getConnection);
};

Database.prototype.close = function close(force, cb = noop) {
  debug('db.close called');
  if (typeof force === 'function') {
    return this.close(false, force);
  }

  const self = this;

  return this._getConnection((err, server, conn) => {
    if (err) return cb(err);
    conn.close(force);

    self.emit('close');
    return cb();
  });
};

Database.prototype.runCommand = function runCommand(opts, cb = noop) {
  debug('db.runCommand: ', opts);
  if (typeof opts === 'string') {
    const tmp = opts;
    opts = {};
    opts[tmp] = 1;
  }

  this._getConnection((err, connection) => {
    if (err) return cb(err);
    return connection.command(opts, (err2, result) => {
      if (err2) return cb(err2);
      return cb(null, result);
    });
  });
};

Database.prototype.listCollections = function listCollections(cb) {
  debug('db.listCollections');
  this._getConnection((err, connection) => {
    if (err) { return cb(err); }

    return connection.listCollections().toArray((err2, collections) => {
      if (err2) { return cb(err2); }
      return cb(null, collections);
    });
  });
};

Database.prototype.getCollectionNames = function getCollectionNames(cb) {
  this.listCollections((err, collections) => {
    if (err) { return cb(err); }
    return cb(null, collections.map((collection) => collection.name));
  });
};

Database.prototype.createCollection = function _createCollection(name, opts, cb) {
  if (typeof opts === 'function') return this.createCollection(name, {}, opts);

  const cmd = { create: name };
  Object.keys(opts).forEach((opt) => {
    cmd[opt] = opts[opt];
  });
  return this.runCommand(cmd, cb);
};

Database.prototype.stats = function stats(scale, cb) {
  debug('db.stats');
  if (typeof scale === 'function') return this.stats(1, scale);
  return this.runCommand({ dbStats: 1, scale }, cb);
};

Database.prototype.dropDatabase = function dropDatabase(cb) {
  debug('db.dropDatabase');
  this.runCommand('dropDatabase', cb);
};

Database.prototype.createUser = function createUser(usr, cb) {
  const cloned = { ...usr };
  const username = cloned.user;
  delete cloned.user;

  const cmd = {
    createUser: username,
    ...cloned,
  };

  this.runCommand(cmd, cb);
};

Database.prototype.addUser = Database.prototype.createUser;

Database.prototype.dropUser = function dropUser(username, cb) {
  this.runCommand({ dropUser: username }, cb);
};

Database.prototype.removeUser = Database.prototype.dropUser;

Database.prototype.eval = function _eval(fn) {
  const cb = arguments[arguments.length - 1];
  this.runCommand({
    eval: fn.toString(),
    args: Array.prototype.slice.call(arguments, 1, arguments.length - 1),
  }, (err, res) => {
    if (err) return cb(err);
    return cb(null, res.retval);
  });
};

Database.prototype.getLastErrorObj = function getLastErrorObj(cb) {
  this.runCommand('getLastError', cb);
};

Database.prototype.getLastError = function getLastError(cb) {
  this.runCommand('getLastError', (err, res) => {
    if (err) return cb(err);
    return cb(null, res.err);
  });
};

Database.prototype.toString = function toString() {
  return this._dbname;
};

module.exports = Database;
