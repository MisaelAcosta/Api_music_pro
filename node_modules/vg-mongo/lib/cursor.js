const util = require('util');
const thunky = require('thunky');
const { Readable } = require('readable-stream');
const hooks = require('async_hooks');

function Cursor(getCursor) {
  Readable.call(this, { objectMode: true, highWaterMark: 0 });

  this._opts = {};

  const self = this;

  this._destroyed = false;
  this._hook = hooks && new hooks.AsyncResource('vgmongo:cursor');
  this._get = thunky((cb) => {
    getCursor((err, cursor) => {
      if (err) { return cb(err); }

      // Apply all opts
      for (let key in self._opts) {
        if (Object.prototype.hasOwnProperty.call(self._opts, key)) {
          cursor = cursor[key](self._opts[key]);
        }
      }

      return cb(null, cursor);
    });
  });
}

util.inherits(Cursor, Readable);

Cursor.prototype.next = function next(cb) {
  if (this._hook) cb = wrapHook(this, cb);

  const self = this;

  this._get((err, cursor) => {
    if (err) return cb(err);

    if (cursor.cursorState.dead || cursor.cursorState.killed) {
      destroy(self);
      return cb(null, null);
    }
    return cursor.next(cb);
  });

  return this;
};

Cursor.prototype.rewind = function rewind(cb) {
  if (this._hook) cb = wrapHook(this, cb);

  this._get((err, cursor) => {
    if (err) return cb(err);
    return cursor.rewind(cb);
  });

  return this;
};

Cursor.prototype.toArray = function toArray(cb) {
  const array = [];
  const self = this;

  function loop() {
    self.next((err, obj) => {
      if (err) return cb(err);
      if (!obj) return cb(null, array);
      array.push(obj);
      return setImmediate(loop);
    });
  }
  loop();
};

Cursor.prototype.map = function map(mapfn, cb) {
  const array = [];
  const self = this;

  function loop() {
    self.next((err, obj) => {
      if (err) return cb(err);
      if (!obj) return cb(null, array);
      array.push(mapfn(obj));
      return setImmediate(loop);
    });
  }

  loop();
};

Cursor.prototype.forEach = function forEach(fn) {
  const self = this;

  function loop() {
    self.next((err, obj) => {
      if (err) return fn(err);
      fn(err, obj);

      if (!obj) return null;
      return setImmediate(loop);
    });
  }

  loop();
};

const opts = ['batchSize', 'hint', 'limit', 'maxTimeMS', 'max', 'min', 'skip', 'snapshot', 'sort'];

opts.forEach((opt) => {
  Cursor.prototype[opt] = function (obj, cb) {
    this._opts[opt] = obj;
    if (cb) return this.toArray(cb);
    return this;
  };
});

Cursor.prototype.count = function count(cb) {
  if (this._hook) cb = wrapHook(this, cb);

  const self = this;

  this._get((err, cursor) => {
    if (err) { return cb(err); }
    return cursor.count(false, self.opts, cb);
  });
};

Cursor.prototype.size = function size(cb) {
  if (this._hook) cb = wrapHook(this, cb);

  const self = this;

  this._get((err, cursor) => {
    if (err) { return cb(err); }
    return cursor.count(true, self.opts, cb);
  });
};

Cursor.prototype.explain = function explain(cb) {
  if (this._hook) cb = wrapHook(this, cb);

  this._get((err, cursor) => {
    if (err) { return cb(err); }
    return cursor.explain(cb);
  });
};

Cursor.prototype.destroy = function destroyFunc() {
  const self = this;

  function done(err) {
    if (err) { self.emit('error', err); }
    destroy(self);
  }

  return this._get((err, cursor) => {
    if (err) return done(err);
    if (cursor.close) {
      return cursor.close(done);
    }
    return true;
  });
};

Cursor.prototype._read = function _read() {
  const self = this;
  this.next((err, data) => {
    if (err) return self.emit('error', err);
    return self.push(data);
  });
};

function destroy(self) {
  if (self._destroyed) return;
  self._destroyed = true;
  if (self._hook) self._hook.emitDestroy();
}

function runInAsyncScope(self, cb, err, val) {
  if (self._hook.runInAsyncScope) {
    self._hook.runInAsyncScope(cb, null, err, val);
  } else {
    self._hook.emitBefore();
    cb(err, val);
    self._hook.emitAfter();
  }
}

function wrapHook(self, cb) {
  return function _wrapHook(err, val) {
    runInAsyncScope(self, cb, err, val);
  };
}

module.exports = Cursor;
