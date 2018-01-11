// Surprise! This isn't WebDB.
// RotonDB doesn't strive for 1:1 WebDB compatibility.
// Instead, it's a thin implementation of just what we need.
// At the time of writing, a WebDB bundle (unminified) weighed in at over half a meg.
// Additionally, we were experiencing a few stalling issues when indexing archives
// and WebDB straight out refused to acknowledge the existence of records in some cases.

RotonDBUtil = {

  // Wraps a given promise in another promise.
  // If the inner promise doesn't resolve / reject until the given
  // timeout, the wrapping promise automatically rejects with an error.
  promiseTimeout(promise, timeout) {
    var error = new Error("Promise hanging, timed out");
    return new Promise((resolve, reject) => {
      var rejectout = setTimeout(() => {
        reject(error);
        resolve = null;
        reject = null;
      }, timeout);
      promise.then(
        function() {
          clearTimeout(rejectout);
          if (resolve) resolve.apply(this, arguments);
        },
        function() {
          clearTimeout(rejectout);
          if (reject) reject.apply(this, arguments);
        }
      );
    });
  },

  regexEscapePattern: /[-\/\\^$*+?.()|[\]{}]/g,
  regexEscape(s) {
    return s.replace(RotonDBUtil.regexEscapePattern, "\\$&");
  },

  wildcardToRegex: {},
  wildcardToRegex(pattern) {
    var regex = RotonDBUtil.wildcardToRegex[pattern];
    if (regex)
      return regex;
    return RotonDBUtil.wildcardToRegex[pattern] =
      new RegExp("^" +
        pattern.split("*")
          .map(s => RotonDBUtil.regexEscape(s))
          .join(".*")
      + "$");
  },

  matchPattern(str, patterns) {
    if (typeof patterns === "string")
      return str.match(RotonDBUtil.wildcardToRegex(patterns));
    for (var i in patterns)
      if (str.match(RotonDBUtil.wildcardToRegex(patterns[i])))
        return true;
    return false;
  },

  toRecord(archive, file, data) {
    data.getRecordURL = (_=>()=>_)(archive.url + file);
    data.getRecordOrigin = (_=>()=>_)(archive.url);
    data.getIndexedAt = (_=>()=>_)(Date.now());

    return data;
  },

  getValue(record, key) {
    if (key.indexOf("+") !== -1) {
      var multi = [];
      var keySplit = key.split("+");
      for (var i in keySplit) {
        multi[i] = RotonDBUtil.getValue(record, keySplit[i]);
      }
      return multi;
    }

    if (key === ":origin")
      return record.getRecordOrigin();
    
    return record[key];
  },

  isEqual(x, y) {
    // Equality isn't an easy problem in JS...
    // Taken from https://stackoverflow.com/a/16788517

    if (x === null || x === undefined || y === null || y === undefined) { return x === y; }
    // after this just checking type of one would be enough
    if (x.constructor !== y.constructor) { return false; }
    // if they are functions, they should exactly refer to same one (because of closures)
    if (x instanceof Function) { return x === y; }
    // if they are regexps, they should exactly refer to same one (it is hard to better equality check on current ES)
    if (x instanceof RegExp) { return x === y; }
    if (x === y || x.valueOf() === y.valueOf()) { return true; }
    if (Array.isArray(x) && x.length !== y.length) { return false; }

    // if they are dates, they must had equal valueOf
    if (x instanceof Date) { return false; }

    // if they are strictly equal, they both need to be object at least
    if (!(x instanceof Object)) { return false; }
    if (!(y instanceof Object)) { return false; }

    // recursive object equality check
    var p = Object.keys(x);
    return
      Object.keys(y).every(function (i) { return p.indexOf(i) !== -1; }) &&
      p.every(function (i) { return RotonDBUtil.isEqual(x[i], y[i]); });
  },

  isValue(record, key, value) {
    if (key.indexOf("+") !== -1) {
      var keySplit = key.split("+");
      for (var i in keySplit) {
        if (!RotonDBUtil.isEqual(RotonDBUtil.getValue(record, keySplit[i]), value[i]))
          return false;
      }
      return true;
    }

    return RotonDBUtil.isEqual(RotonDBUtil.getValue(record, key), value);
  },

  isValueBetween(record, key, lowerValue, upperValue) {
    if (key.indexOf("+") !== -1) {
      var keySplit = key.split("+");
      for (var i in keySplit) {
        if (!RotonDBUtil.isValueBetween(record, keySplit[i], lowerValue[i], upperValue[i]))
          return false;
      }
      return true;
    }

    var value = RotonDBUtil.getValue(record, key);

    // If below or above, at least return true if equal.
    if (value < lowerValue || upperValue < value)
      return RotonDBUtil.isEqual(value, lowerValue) || RotonDBUtil.isEqual(value, upperValue);
    
    return true;
  },

  fixFilepathsBackslashPattern: /\\/g,
  fixFilepaths(files) {
    for (var i in files) {
      files[i] = "/" + files[i].replace(RotonDBUtil.fixFilepathsBackslashPattern, "/");
    }
  },

  splitURL(url) {
    if (
      url.length > 6 &&
      url[0] == 'd' && url[1] == 'a' && url[2] == 't' && url[3] == ':'
    )
      // We check if length > 6 but remove 4.
      // The other 2 will be removed below.
      url = url.substring(4);
    
    if (
      url.length > 2 &&
      url[0] == '/' && url[1] == '/'
    )
      url = url.substring(2);
  
    var indexOfSlash = url.indexOf("/");
    if (indexOfSlash === -1)
      indexOfSlash = url.length;
    return { archiveURL: "dat://"+url.substring(0, indexOfSlash), path: url.substring(indexOfSlash) };
  },

  normalizeURL(url) {
    return RotonDBUtil.splitURL(url).archiveURL;
  },

};

function RotonDB(name) {
  this._name = name;

  this.timeoutDir = 8000;
  this.timeoutFile = 1000;
  
  this._defs = {};

  this._tables = [];

  this.define = function(name, opts) {
    this._defs[name] = opts;
  }

  this.open = function() {
    for (var i in this._defs) {
      var table = this[i] || new RotonDBTable(this, i);
      table._open(this._defs[i]);
      this[i] = table;
      this._tables.push(table);
    }

    // Update any watched archives.
    var archives = this._archives;
    var archiveopts = this._archiveopts;

    this._archives = [];
    this._archivemap = {};
    this._archiveopts = {};
    this._archiveurls = new Set();

    if (!archives)
      return;
    for (var i in archives) {
      var archive = archives[i];
      this.indexArchive(archive, archiveopts[archive.url]);
    }
  }

  this.indexArchive = async function(archive, opts) {
    var url = archive.url || RotonDBUtil.normalizeURL(archive);
    try { url = "dat://" + await DatArchive.resolveName(url); } catch (e) { }
    if (this._archivemap[url])
      return this._archivemap[url];
    if (typeof archive === "string")
      archive = new DatArchive(url);
    else if (archive.url != url)
      // If we could just update the existing archive URL...
      archive = new DatArchive(url);
    
    this._archives.push(archive);
    this._archivemap[url] = archive;
    this._archiveopts[url] = opts || {};
    this._archiveurls.add(url);

    var files = await RotonDBUtil.promiseTimeout(archive.readdir("/", { recursive: true, timeout: this.timeoutDir }), this.timeoutDir);
    RotonDBUtil.fixFilepaths(files);
    archive.watch = {
      pattern: [],
      events: null
    };
    
    for (var i in this._tables) {
      var table = this._tables[i];
      // Build archive.watch.pattern
      await table._indexArchive(archive, files);
    }

    // Process archive.watch.pattern
    this._watch(archive);

    // Inform the tables about the files' existence.
    for (var i in files) {
      var file = files[i];
      await this._invalidate(archive, file);
    }

    return archive;
  }

  this.isSource = function(url) {
    return this._archiveurls.has(url);
  }

  this.unindexArchive = async function(archive, opts) {
    var url = archive.url || RotonDBUtil.normalizeURL(archive);
    try { url = "dat://" + await DatArchive.resolveName(url); } catch (e) { }
    if (!this._archivemap[url])
      return;
    if (typeof archive === "string")
      archive = this._archivemap[url];
    
    this._archives.push(archive);
    this._archivemap[url] = null;
    this._archiveopts[url] = null;
    this._archiveurls.delete(url);

    this._unwatch(archive);

    for (var i in this._tables) {
      var table = this._tables[i];
      // The tables need to find the records and remove them themselves.
      await table._unindexArchive(archive, files);
    }

  }

  this._watch = function(archive) {
    if (this._archiveopts[archive.url].watch === false)
      return;
    if (archive.watch.events)
      this._unwatch(archive);
    archive.watch.events = archive.createFileActivityStream(archive.watch.pattern);
    archive.watch.events.addEventListener("invalidated", ({path}) => {
      archive.download(path);
    });
    archive.watch.events.addEventListener("changed", ({path}) => {
      this._invalidate(archive, path);
    });
  }

  this._unwatch = function(archive) {
    if (!archive.watch.events)
      return;
    archive.watch.events.close();
    archive.watch.events = null;
  }

  this._invalidate = async function(archive, file) {
    var updated = false;
    for (var i in this._tables) {
      var table = this._tables[i];
      updated |= await table._invalidate(archive, file);
    }
    if (updated)
      this._fire("indexes-updated", archive.url + file);
    return updated;
  }

  this._on = {
    "indexes-updated": [] // Contains functions of format (url, version) => {...}
  };
  this.on = function(event, handler) {
    this._on[event].push(handler);
  }
  this._fire = function(event) {
    var handlers;
    if (typeof(event) === "function")
      handlers = [event];
    else if (event.length && typeof(event[0]) === "function")
      handlers = event;
    else
      handlers = this._on[event];
    if (!handlers || handlers.length === 0) return true; // Return true by default.
    var args = Array.prototype.splice.call(arguments, 1);
    for (var id in handlers) {
      var result = handlers[id].apply(this, args);
      if (result === true) // We only want true, not truly values.
        continue; // If the handler returned true, continue to the next handler.
      else if (result === false) // We only want false, not falsy values.
        return false; // Exit early.
      else if (result !== undefined)
        return result; // If the handler returned something, return it early.
    }
    return true;
  }

}

function RotonDBTable(db, name) {
  this._db = db;
  this.name = name;

  this._open = function(def) {
    this._def = def;
    this._records = [];
    // TODO: Create indexed mappings.
  }

  this._indexArchive = async function(archive, files) {
    if (typeof this._def.filePattern === "string")
      archive.watch.pattern.push(this._def.filePattern);
    else
      Array.prototype.push.apply(archive.watch.pattern, this._def.filePattern);
  }

  this._unindexArchive = async function(archive, files) {
    // TODO: Update indexed mappings.
    for (var i = 0; i < this._records.length; i++) {
      var record = this._records[i];
      if (record.getRecordOrigin() !== archive.url)
        continue;
      this._records.splice(i, 1);
      i--;
    }
  }

  this._invalidate = async function(archive, file) {
    if (!RotonDBUtil.matchPattern(file, this._def.filePattern))
      return false;
    
    // TODO: Instead of reading the record on invalidation, just kick out the currently cached record, ack the file, fetch on _fetch.
    
    // await RotonDBUtil.promiseTimeout(archive.download(file), this._db.timeoutFile);
    var record = JSON.parse(await RotonDBUtil.promiseTimeout(archive.readFile(file, { timeout: this._db.timeoutFile }), this._db.timeoutFile));
    // TODO: Do this on uncached fetch.
    this._ingest(archive, file, record);

    return true;
  }

  this._ingest = function(archive, file, record) {
    if (this._def.preprocess) this._def.preprocess(record);
    if (this._def.validate) this._def.validate(record);

    record = RotonDBUtil.toRecord(archive, file, record);
    
    // Check for existing record and replace it.
    var index = this._records.findIndex(other =>
      other.getRecordURL() == record.getRecordURL()
    );
    if (index < 0) {
      this._records.push(record);
      // TODO: Update indexed mappings.
    } else {
      // Check if existing record is older and replace.
      var other = this._records[index];
      if (other.getIndexedAt() >= record.getIndexedAt())
        return false;
      this._records[index] = record;
      // TODO: Update indexed mappings.
    }
  }

  this.get = async function(urlOrKey, value) {
    if (value)
      return await this._getByKey(urlOrKey, value);
    if (urlOrKey === ":origin")
      return await this._getByOrigin(value);
    await this._getByURL(urlOrKey);
  }
  this._getByURL = async function(url) {
    // Let's cheat a little.
    // We know that the archive must be indexed.
    var { archiveURL, path } = RotonDBUtil.splitURL(url);
    var archive = this._db._archivemap[archiveURL];
    if (!archive)
      return undefined;

    // TODO: Use indexed mappings.
    for (var i in this._records) {
      var record = this._records[i];
      if (record.getRecordURL() === url)
        return record;
    }

    // If the record hasn't been indexed, let's just attempt reading the file from FS.
    try {
      if (!await this._invalidate(archive, path))
        return undefined;
    } catch (e) {
      return undefined;
    }

    // TODO: Fetch lazily!
    // Let's assume that if the record didn't exist before and it got updated, it got added.
    // If it got added, it must be the last record...
    return this._records[this._records.length - 1];
  }
  this._getByOrigin = async function(url) {
    // Let's cheat a little.
    // We know that the archive must be indexed.
    var archive = this._db._archivemap[RotonDBUtil.normalizeURL(url)];
    if (!archive)
      return undefined;
    url = archive.url;

    // TODO: Use indexed mappings.
    for (var i in this._records) {
      var record = this._records[i];
      if (record.getRecordOrigin() === url)
        return record;
    }

    // If the record hasn't been indexed, let's just check the FS again.
    var files = await RotonDBUtil.promiseTimeout(archive.readdir("/", { recursive: true, timeout: this.timeoutDir }), this.timeoutDir);
    RotonDBUtil.fixFilepaths(files);
    var updated = false;
    for (var i in files) {
      var file = files[i];
      // We only care about the first file.
      if (updated = await this._invalidate(archive, file))
        break;
    }
    if (!updated)
      return undefined;
    
    // TODO: Fetch lazily!
    // Let's assume that if the record didn't exist before and it got updated, it got added.
    // If it got added, it must be the last record...
    return this._records[this._records.length - 1];
  }
  this._getByKey = async function(key, value) {
    // TODO: Use indexed mappings, fetch if uncached.
    for (var i in this._records) {
      var record = this._records[i];
      if (RotonDBUtil.isValue(record, key, value))
        return record;
    }
    return null;
  }

  this.query = function() {
    return new RotonDBQuery(this);
  }

  this.where = function(key) {
    return this.query().where(key);
  }

  this._fetch = async function(stack) {
    // TODO: Fetch lazily!
    var records = this._records;
    while (stack.length > 0) {
      var query = stack.pop();
      if (query._clause) {
        // Still use transform. Don't do this in the future.
        records = query._clause._transform(records);
      } else if (query._transform) {
        // TODO: Precheck if this ever comes true, fetch everything if needed beforehand.
        records = query._transform(records);
      }
    }
    return records;
  }

  this.update = async function(url, updatesOrFn) {
    if (typeof updatesOrFn === "function")
      return await this._updateByFn(url, updates);
    return await this._updateByUpdates(url, updatesOrFn);
  }
  this._updateByUpdates = async function(url, updates) {
    var record = await this._getByURL(url) || {};
    for (var i in updates) {
      record[i] = updates[i];
    }
    try {
      await this.put(url, record);
      return 1;
    } catch (e) {
      return 0;
    }
  }
  this._updateByFn = async function(url, fn) {
    var record = await this._getByURL(url);
    record = fn(record);
    try {
      await this.put(url, record);
      return 1;
    } catch (e) {
      return 0;
    }
  }

  this.put = async function(url, record) {
    var { archiveURL, path } = RotonDBUtil.splitURL(url);
    var archive = this._db._archivemap[archiveURL];
    if (!archive)
      throw new Error("Archive "+archiveURL+" not indexed");
    
    this._ingest(archive, archiveURL + path, record);
    this._db._fire("indexes-updated", archiveURL + path);
    if (this._def.serialize) record = this._def.serialize(record);
    await archive.writeFile(path, JSON.stringify(record));
    await archive.commit();
    return archiveURL + path;
  }

  this.delete = async function(url) {
    try {
      var { archiveURL, path } = RotonDBUtil.splitURL(url);
      var archive = this._db._archivemap[archiveURL];
      if (!archive)
        throw new Error("Archive "+archiveURL+" not indexed");
      
      // TODO: Refresh indexed mappings.
      var index = this._records.findIndex(other =>
        other.getRecordURL() == url
      );
      if (index !== -1)
        this._records.splice(index, 1);
      await archive.unlink(path);
      await archive.commit();      
      return 1;
    } catch (e) {
      return 0;
    }
  }

}

function RotonDBQuery(source, transformOrClause) {
  this._source = source;
  this._clause = transformOrClause && transformOrClause._type ? transformOrClause : null;
  this._transform = !transformOrClause ? (input => input) : (transformOrClause._transform || transformOrClause);

  this.where = function(key) {
    return new RotonDBWhereClause(this, key);
  }

  this._fetch = async function(stack) {
    stack.push(this);
    return await this._source._fetch(stack);
  }

  this.toArray = async function() {
    return await this._fetch([]);
  }

  this.last = async function() {
    var records = await this._fetch([]);
    return records[records.length - 1];
  }

}

function RotonDBWhereClause(source, key) {
  var c = this;
  this._source = source;
  this._key = key;

  this._type = null;
  this._data = null;
  this._transform = (input => input);

  this._ = function(type, data) {
    this._type = type;
    this._data = data;
    this._transform = this["_transform_"+type](data);
    return new RotonDBQuery(this._source, this);
  }

  this.equals = function(value) {
    return this._("equals", value);
  }
  this._transform_equals = value => input => {
    var output = [];
    for (var i in input) {
      var record = input[i];
      if (RotonDBUtil.isValue(record, c._key, value))
        output.push(record);
    }
    // TODO: Sort!
    // RotonDBUtil.sort(output, );
    return output;
  }

  this.between = function(lowerValue, upperValue) {
    return this._("between", { lowerValue: lowerValue, upperValue: upperValue });
  }
  this._transform_between = ({lowerValue, upperValue}) => input => {
    var output = [];
    for (var i in input) {
      var record = input[i];
      if (RotonDBUtil.isValueBetween(record, c._key, lowerValue, upperValue))
        output.push(record);
    }
    // TODO: Sort!
    // RotonDBUtil.sort(output, );
    return output;
  }

}

// Already create and setup the instance, which can be used by all other scripts.
r.install_db(new RotonDB("rotonde"));

r.confirm("dep","rotondb");
