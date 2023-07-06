const mongodb = require('mongodb');
const each = require('each-series');

const maxBulkSize = 1000;

function noop() {}

const oid = mongodb.ObjectID.createPk;

function Bulk(colName, ordered, onserver, opts) {
  if (!opts) {
    return new Bulk(colName, ordered, onserver, { writeConcern: { w: 1 } });
  }

  this._colname = colName;
  this._cmds = [];
  this._currCmd = null;
  this._ordered = ordered;
  this._getConnection = onserver;

  this._writeConcern = opts.writeConcern;

  const self = this;
  this.find = function find(query) {
    let upsert = false;
    const findobj = {};
    function remove(lim) {
      if (!self._currCmd) {
        self._currCmd = {
          delete: self._colname,
          deletes: [],
          ordered: self._ordered,
          writeConcern: self._writeConcern,
        };
      }
      if (!self._currCmd.delete || self._currCmd.deletes.length === maxBulkSize) {
        self._cmds.push(self._currCmd);
        self._currCmd = {
          delete: self._colname,
          deletes: [],
          ordered: self._ordered,
          writeConcern: self._writeConcern,
        };
      }
      self._currCmd.deletes.push({ q: query, limit: lim });
    }

    function update(updObj, multi) {
      if (!self._currCmd) {
        self._currCmd = {
          update: self._colname,
          updates: [],
          ordered: self._ordered,
          writeConcern: self._writeConcern,
        };
      }
      if (!self._currCmd.update || self._currCmd.updates.length === maxBulkSize) {
        self._cmds.push(self._currCmd);
        self._currCmd = {
          update: self._colname,
          updates: [],
          ordered: self._ordered,
          writeConcern: self._writeConcern,
        };
      }
      self._currCmd.updates.push({
        q: query,
        u: updObj,
        multi,
        upsert,
      });
    }

    findobj.upsert = function upsertFunc() {
      upsert = true;
      return findobj;
    };

    findobj.remove = function removeFunc() {
      remove(0);
    };

    findobj.removeOne = function removeOne() {
      remove(1);
    };

    findobj.update = function updateFunc(updObj) {
      update(updObj, true);
    };

    findobj.updateOne = function updateOneFunc(updObj) {
      update(updObj, false);
    };

    findobj.replaceOne = function replaceOneFunc(updObj) {
      this.updateOne(updObj);
    };

    return findobj;
  };
}

Bulk.prototype.insert = function insert(doc) {
  if (!this._currCmd) {
    this._currCmd = {
      insert: this._colname,
      documents: [],
      ordered: this._ordered,
      writeConcern: this._writeConcern,
    };
  }
  if (!this._currCmd.insert || this._currCmd.documents.length === maxBulkSize) {
    this._cmds.push(this._currCmd);
    this._currCmd = {
      insert: this._colname,
      documents: [],
      ordered: this._ordered,
      writeConcern: this._writeConcern,
    };
  }
  if (!doc._id) doc._id = oid();
  this._currCmd.documents.push(doc);
};

const cmdkeys = {
  insert: 'nInserted',
  delete: 'nRemoved',
  update: 'nUpserted',
};

Bulk.prototype.tojson = function tojson() {
  if (this._currCmd) this._cmds.push(this._currCmd);

  const obj = {
    nInsertOps: 0,
    nUpdateOps: 0,
    nRemoveOps: 0,
    nBatches: this._cmds.length,
  };

  this._cmds.forEach((cmd) => {
    if (cmd.update) {
      obj.nUpdateOps += cmd.updates.length;
    } else if (cmd.insert) {
      obj.nInsertOps += cmd.documents.length;
    } else if (cmd.delete) {
      obj.nRemoveOps += cmd.deletes.length;
    }
  });

  return obj;
};

Bulk.prototype.toString = function toStringFunc() {
  return JSON.stringify(this.tojson());
};

Bulk.prototype.execute = function executeFunc(cb) {
  if (!cb) return this.execute(noop);

  const self = this;
  const result = {
    writeErrors: [],
    writeConcernErrors: [],
    nInserted: 0,
    nUpserted: 0,
    nMatched: 0,
    nModified: 0,
    nRemoved: 0,
    upserted: [],
  };

  if (this._currCmd) {
    this._cmds.push(this._currCmd);
  }

  return this._getConnection((err, connection) => {
    if (err) return cb(err);
    return each(self._cmds, (cmd, i, done) => {
      connection.command(cmd, (err2, res) => {
        if (err) return done(err2);
        result[cmdkeys[Object.keys(cmd)[0]]] += res.n;
        return done();
      });
    }, (err3) => {
      if (err3) return cb(err3);
      result.ok = 1;
      return cb(null, result);
    });
  });
};

module.exports = Bulk;
