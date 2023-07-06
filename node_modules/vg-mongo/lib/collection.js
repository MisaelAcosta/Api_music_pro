const mongodb = require('mongodb');
const once = require('once');
const debug = require('debug')('universal-vg-mongo:collection');

const Cursor = require('./cursor');
const Bulk = require('./bulk');
const getTenantPattern = require('./tenants');

const writeOpts = { writeConcern: { w: 1 }, ordered: true };
function noop() {}

const oid = mongodb.ObjectID.createPk;

function Collection(opts, getConnection) {
  this._name = opts.name;
  this._getConnection = getConnection;
  this._getCollection = function _getCollection(cb, tenant) {
    let collectionName = this._name;
    if (tenant) {
      collectionName = `${this._name}_#${getTenantPattern(tenant)}`;
    }

    this._getConnection((err, connection) => {
      if (err) { return cb(err); }
      return cb(null, connection.collection(collectionName));
    });
  };
}

Collection.prototype.find = function find(query, projection, opts = {}, cb) {
  if (typeof query === 'function') return this.find({}, null, null, query);
  if (typeof projection === 'function') return this.find(query, null, null, projection);
  if (typeof opts === 'function') return this.find(query, projection, null, opts);

  const self = this;

  function getCursor(cb2) {
    self._getCollection((err, collection) => {
      if (err) { return cb2(err); }

      if (projection) {
        if (opts) opts.projection = projection;
        else opts = { projection };
      }
      return cb2(null, collection.find(query, opts));
    }, opts?.tenant);
  }

  const cursor = new Cursor(getCursor);
  if (cb) return cursor.toArray(cb);
  return cursor;
};

Collection.prototype.asyncFind = function asyncFind(query, projections, opts) {
  return new Promise((resolve, reject) => {
    this.find(query, projections, opts, (err, docs) => {
      if (err) return reject(err);
      return resolve(docs);
    });
  });
};

Collection.prototype.findOne = function findOne(query, projection, opts = {}, cb) {
  if (typeof query === 'function') return this.findOne({}, null, null, query);
  if (typeof projection === 'function') return this.findOne(query, null, null, projection);
  if (typeof opts === 'function') return this.findOne(query, projection, null, opts);
  return this.find(query, projection, opts)
    .next((err, doc) => {
      if (err) return cb(err);
      return cb(null, doc);
    });
};

Collection.prototype.asyncFindOne = function asyncFindOne(query, projections, opts = {}) {
  debug('asyncFindOne called: ', query, projections, opts);
  return new Promise((resolve, reject) => {
    this.findOne(query, projections, opts, (err, doc) => {
      if (err) return reject(err);
      return resolve(doc);
    });
  });
};

Collection.prototype.findAndModify = function findAndModify(opts, cb) {
  this.runCommand('findAndModify', opts, (err, result) => {
    if (err) return cb(err);
    return cb(null, result.value, result.lastErrorObject || { n: 0 });
  });
};

Collection.prototype.count = function count(query, cb) {
  if (typeof query === 'function') return this.count({}, query);
  return this.find(query).count(cb);
};

Collection.prototype.asyncCount = function asyncCount(query, opts = {}) {
  debug('asyncCount called: ', query, opts);
  if (typeof query === 'function') return this.count({}, {}, query);
  if (typeof opts === 'function') return this.count(query, {}, opts);
  return new Promise((resolve, reject) => {
    this.find(query, { _id: 1 }, opts)
      .count((err, doc) => {
        if (err) return reject(err);
        return resolve(doc);
      });
  });
};

Collection.prototype.distinct = function distinct(field, query, cb) {
  this.runCommand('distinct', { key: field, query }, (err, result) => {
    if (err) return cb(err);
    return cb(null, result.values);
  });
};

Collection.prototype.insert = function insert(docOrDocs, opts, cb) {
  if (Array.isArray(docOrDocs)) {
    this.insertMany(docOrDocs, opts, cb);
  } else {
    this.insertOne(docOrDocs, opts, cb);
  }
};

Collection.prototype.asyncInsert = function asyncInsert(docOrDocs, opts = {}) {
  return new Promise((resolve, reject) => {
    if (Array.isArray(docOrDocs)) {
      this.insertMany(docOrDocs, opts, (err, docs) => {
        if (err) return reject(err);
        return resolve(docs);
      });
    } else {
      this.insertOne(docOrDocs, opts, (err, docs) => {
        if (err) return reject(err);
        return resolve(docs);
      });
    }
  });
};

Collection.prototype.insertOne = function insertOne(doc, opts = {}, cb) {
  if (!opts && !cb) return this.insertOne(doc, {}, noop);
  if (typeof opts === 'function') return this.insertOne(doc, {}, opts);
  if (opts && !cb) return this.insertOne(doc, opts, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);

    doc._id = doc._id || oid();

    return collection.insertOne(doc, xtend(writeOpts, opts), (err2) => {
      if (err2) return cb(err2);
      return cb(null, doc);
    });
  }, opts?.tenant);
};

Collection.prototype.insertMany = function insertMany(docs, opts, cb) {
  if (!opts && !cb) return this.insert(docs, {}, noop);
  if (typeof opts === 'function') return this.insert(docs, {}, opts);
  if (opts && !cb) return this.insert(docs, opts, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);

    for (let i = 0; i < docs.length; i += 1) {
      if (!docs[i]._id) docs[i]._id = oid();
    }

    return collection.insertMany(docs, xtend(writeOpts, opts), (err2) => {
      if (err2) return cb(err);
      return cb(null, docs);
    });
  }, opts?.tenant);
};

Collection.prototype.update = function updateFunc(query, update, opts, cb) {
  if (!opts && !cb) return this.update(query, update, {}, noop);
  if (typeof opts === 'function') return this.update(query, update, {}, opts);

  if (opts.multi) {
    this.updateMany(query, update, opts, cb);
  } else {
    this.updateOne(query, update, opts, cb);
  }
  return true;
};

Collection.prototype.asyncUpdate = function asyncUpdate(query, update, opts = {}) {
  debug('asyncUpdate called: ', query, update, opts);
  return new Promise((resolve, reject) => {
    if (opts.multi) {
      this.updateMany(query, update, opts, (err, doc) => {
        if (err) return reject(err);
        return resolve(doc);
      });
    } else {
      this.updateOne(query, update, opts, (err, doc) => {
        if (err) return reject(err);
        return resolve(doc);
      });
    }
  });
};

Collection.prototype.updateOne = function updateOneFunc(query, update, opts, cb = noop) {
  if (!opts && !cb) return this.updateOne(query, update, {}, noop);
  if (typeof opts === 'function') return this.updateOne(query, update, {}, opts);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);

    return collection.updateOne(query, update, xtend(writeOpts, opts), (err2, result) => {
      if (err2) { return cb(err2); }
      return cb(null, result.result);
    });
  }, opts?.tenant);
};

Collection.prototype.updateMany = function updateMany(query, update, opts, cb = noop) {
  if (!opts && !cb) return this.updateMany(query, update, {}, noop);
  if (typeof opts === 'function') return this.updateMany(query, update, {}, opts);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);
    return collection.updateMany(query, update, xtend(writeOpts, opts), (err2, result) => {
      if (err2) { return cb(err2); }
      return cb(null, result.result);
    });
  }, opts?.tenant);
};

Collection.prototype.save = function save(doc, opts, cb) {
  if (!opts && !cb) return this.save(doc, {}, noop);
  if (typeof opts === 'function') return this.save(doc, {}, opts);
  if (!cb) return this.save(doc, opts, noop);

  if (doc._id) {
    return this.replaceOne({ _id: doc._id }, doc, xtend({ upsert: true }, opts), (err) => {
      if (err) return cb(err);
      return cb(null, doc);
    });
  }
  return this.insert(doc, opts, cb);
};

Collection.prototype.replaceOne = function replaceOne(query, update, opts, cb = noop) {
  if (!opts && !cb) return this.replaceOne(query, update, {}, noop);
  if (typeof opts === 'function') return this.replaceOne(query, update, {}, opts);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);

    return collection.replaceOne(query, update, xtend(writeOpts, opts), (err2, result) => {
      if (err2) { return cb(err2); }
      return cb(null, result.result);
    });
  });
};

Collection.prototype.remove = function remove(query, opts, cb) {
  if (typeof query === 'function') return this.remove({}, { justOne: false }, query);
  if (typeof opts === 'function') return this.remove(query, { justOne: false }, opts);
  if (typeof opts === 'boolean') return this.remove(query, { justOne: opts }, cb);
  if (!opts) return this.remove(query, { justOne: false }, cb);
  if (!cb) return this.remove(query, opts, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);
    const deleteOperation = opts.justOne ? 'deleteOne' : 'deleteMany';

    return collection[deleteOperation](query, xtend(writeOpts, opts), (err2, result) => {
      if (err2) return cb(err2);
      result.result.deletedCount = result.deletedCount;
      return cb(null, result.result);
    });
  }, opts?.tenant);
};

Collection.prototype.asyncRemove = function asyncRemove(query = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    this.remove(query, { ...opts, justOne: false }, (err, docs) => {
      if (err) return reject(err);
      return resolve(docs);
    });
  });
};

Collection.prototype.asyncRemoveAll = function asyncRemoveAll(opts = {}) {
  return new Promise((resolve, reject) => {
    this.remove({}, { ...opts, justOne: false }, (err, docs) => {
      if (err) return reject(err);
      return resolve(docs);
    });
  });
};

Collection.prototype.rename = function rename(name, opts, cb) {
  if (typeof opts === 'function') return this.rename(name, {}, opts);
  if (!opts) return this.rename(name, {}, noop);
  if (!cb) return this.rename(name, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);
    return collection.rename(name, opts, cb);
  });
};

Collection.prototype.drop = function drop(opts = {}, cb) {
  if (typeof opts === 'function') return this.drop({}, opts);
  return this.runCommand('drop', opts, cb);
};

Collection.prototype.asyncDrop = function asyncDrop(opts = {}) {
  return new Promise((resolve, reject) => {
    this.stats((err) => {
      if (err) return resolve();
      return this.drop(opts, (err2) => {
        if (err2) return reject(err2);
        return resolve();
      });
    }, opts);
  });
};

Collection.prototype.stats = function stats(cb) {
  this.runCommand('collStats', cb);
};

Collection.prototype.mapReduce = function mapReduce(map, reduce, opts, cb) {
  if (typeof opts === 'function') { return this.mapReduce(map, reduce, {}, opts); }
  if (!cb) { return this.mapReduce(map, reduce, opts, noop); }

  return this._getCollection((err, collection) => {
    if (err) return cb(err);

    return collection.mapReduce(map, reduce, opts, cb);
  });
};

Collection.prototype.runCommand = function runCommand(cmd, opts = {}, cb) {
  if (typeof opts === 'function') return this.runCommand(cmd, {}, opts);

  const cmdObject = {};
  cmdObject[cmd] = this._name;
  Object.keys(opts).forEach((key) => {
    cmdObject[key] = opts[key];
  });

  return this._getConnection((err, connection) => {
    if (err) return cb(err);
    return connection.command(cmdObject, cb);
  });
};

Collection.prototype.toString = function toString() {
  return this._name;
};

Collection.prototype.dropIndexes = function dropIndexes(cb) {
  this.runCommand('dropIndexes', { index: '*' }, cb);
};

Collection.prototype.dropIndex = function dropIndex(index, cb) {
  this.runCommand('dropIndexes', { index }, cb);
};

Collection.prototype.createIndex = function createIndex(index, opts, cb) {
  if (typeof opts === 'function') return this.createIndex(index, {}, opts);
  if (!opts) return this.createIndex(index, {}, noop);
  if (!cb) return this.createIndex(index, opts, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);
    return collection.createIndex(index, opts, cb);
  });
};

Collection.prototype.ensureIndex = function ensureIndex(index, opts, cb) {
  if (typeof opts === 'function') return this.ensureIndex(index, {}, opts);
  if (!opts) return this.ensureIndex(index, {}, noop);
  if (!cb) return this.ensureIndex(index, opts, noop);

  return this._getCollection((err, collection) => {
    if (err) return cb(err);
    return collection.ensureIndex(index, opts, cb);
  });
};

Collection.prototype.getIndexes = function getIndexes(cb) {
  this._getCollection((err, collection) => {
    if (err) { return cb(err); }
    return collection.indexes(cb);
  });
};

Collection.prototype.reIndex = function reIndex(cb) {
  this.runCommand('reIndex', cb);
};

Collection.prototype.isCapped = function isCapped(cb) {
  this._getCollection((err, collection) => {
    if (err) { return cb(err); }
    return collection.isCapped(cb);
  });
};

Collection.prototype.group = function group(doc, cb) {
  this._getCollection((err, collection) => {
    if (err) return cb(err);
    return collection.group(doc.key || doc.keyf, doc.cond, doc.initial, doc.reduce, doc.finalize, cb);
  });
};

Collection.prototype.aggregate = function aggregate() {
  let cb;
  let opts;

  let pipeline = Array.prototype.slice.call(arguments);
  if (typeof pipeline[pipeline.length - 1] === 'function') {
    cb = once(pipeline.pop());
  }

  if ((pipeline.length === 1 || pipeline.length === 2) && Array.isArray(pipeline[0])) {
    opts = pipeline[1];
    pipeline = pipeline[0];
  }

  const self = this;

  const strm = new Cursor((cb2) => {
    self._getCollection((err2, collection) => {
      if (err2) return cb(err2);
      return cb2(null, collection.aggregate(pipeline, opts));
    });
  });

  if (cb) {
    return strm.toArray(cb);
  }

  return strm;
};

Collection.prototype.initializeOrderedBulkOp = function initializeOrderedBulkOp(opts) {
  return new Bulk(this._name, true, this._getConnection, this._dbname, opts);
};

Collection.prototype.initializeUnorderedBulkOp = function initializeUnorderedBulkOp(opts) {
  return new Bulk(this._name, false, this._getConnection, this._dbname, opts);
};

function xtend(obj, ext) {
  return {
    ...obj,
    ...ext,
  };
}

module.exports = Collection;
