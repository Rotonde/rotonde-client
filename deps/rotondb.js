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

  promiseRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = event => resolve(request.result);
      request.onerror = event => reject(request.error);
    });
  },

  promiseRequests(requests) {
    var promises = [];
    for (var i in requests) {
      promises[i] = RotonDBUtil.promiseRequest(requests[i]);
    }
    return promises;
  },

  regexEscapePattern: /[-\/\\^$*+?.()|[\]{}]/g,
  regexEscape(s) {
    return s.replace(RotonDBUtil.regexEscapePattern, "\\$&");
  },

  wildcardToRegexCache: {},
  wildcardToRegex(pattern) {
    var regex = RotonDBUtil.wildcardToRegexCache[pattern];
    if (regex)
      return regex;
    return RotonDBUtil.wildcardToRegexCache[pattern] =
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
      if (RotonDBUtil.matchPattern(str, patterns[i]))
        return true;
    return false;
  },

  wrapRecord(archive, file, data) {
    data["_url"] = archive.url + file;
    data["_origin"] = archive.url;
    data["_indexed"] = Date.now();
    data["_version"] = archive.rdb.version;

    return data;
  },

  unwrapRecord(data) {
    data = JSON.parse(JSON.stringify(data));

    data.getRecordURL = (_=>()=>_)(data["_url"]);
    delete data["_url"];
    data.getRecordOrigin = (_=>()=>_)(data["_origin"]);
    delete data["_origin"];
    data.getIndexedAt = (_=>()=>_)(data["_indexed"]);
    delete data["_indexed"];
    data.getVersion = (_=>()=>_)(data["_version"]);
    delete data["_version"];

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

  sort(records, key, sampleValue) {
    if (records.length < 1) {
      return records;
    }

    // Let's ignore sorting by alphabet for a second.

    var valueIndex = -1;
    // Find last sortable key, based on our sample value(s).
    if (key.indexOf("+") !== -1) {
      var keySplit = key.split("+");
      for (var i = keySplit.length - 1; i > -1; --i) {
        var value = sampleValue[i];
        // We define "sortable" as "definitely a number."
        if (isNaN(parseFloat(value)))
          continue;
        valueIndex = i;
        key = keySplit[i];
        break;
      }

      if (valueIndex === -1)
        return records; // Found no sortable property.
    } else if (isNaN(parseFloat(sampleValue)))
      return records; // Single key, but not sortable.
    
    return records.sort((a, b) => a[key] - b[key]);
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
  fixFilepaths(paths) {
    for (var i in paths) {
      paths[i] = "/" + paths[i].replace(RotonDBUtil.fixFilepathsBackslashPattern, "/");
    }
  },

  splitURL(url) {
    url = url.toLowerCase();

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

  this.timeoutDir = 4000;
  this.timeoutFile = 1000;
  this.delayWrite = 100;
  this.fetchCountMax = 15; // TODO: Increase (or even drop) once Beaker becomes more robust.
  this.fetchRetriesMax = 3;
  
  this._defs = {};

  this._tables = [];

  this._urlcache = {};
  this._recordcaches = {};

  this.define = function(name, opts) {
    this._defs[name] = opts;
  }

  // Note: This method is concurrency-unsafe. It'll be your fault if everything blows up spectacularly.
  // (I'm talking to you, future Maik. - Maik)
  this.open = (version) => new Promise((resolve, reject) => {
    version = version || 0;
    // 0 throws an exception, 1 doesn't trigger onupgradeneeded, and we need to take RotonDB meta into account.
    version += 3;

    if (this._idb) {
      // Let's close the existing IndexedDB, then re-open it.
      this._idb.close();
    }

    this._idbOpenRequest = window.indexedDB.open(name, version);

    this._idbOpenRequest.onupgradeneeded = e => {
      this._idb = this._idbOpenRequest.result;

      // Create internal meta object stores.
      // _rdb_archives: Store any required archive metadata, f.e. versions.
      {
        var store;
        try {
          store = this._idbOpenRequest.transaction.objectStore("_rdb_archives");
          if (!store)
            throw null;
        } catch (err) {
          store = this._idb.createObjectStore("_rdb_archives", { keyPath: "url" });
        }
      }

      // Create object stores and indices if missing.
      for (var name in this._defs) {
        var def = this._defs[name];
        var store;
        try {
          store = this._idbOpenRequest.transaction.objectStore(name);
          if (!store)
            throw null;
        } catch (err) {
          store = this._idb.createObjectStore(name);
        }
        for (var i in def.index) {
          var indexName = def.index[i];
          // It should be safe to delete and recreate the index.
          try {
            if (!store.index(indexName))
              throw null;
            store.deleteIndex(indexName);
          } catch (err) {
          }
          var keyPaths = indexName.split("+");
          for (var kpi in keyPaths) {
            var keyPath = keyPaths[kpi];
            if (keyPath.length > 1 && keyPath[0] === ":")
              keyPaths[kpi] = "_" + keyPath.substr(1);
          }
          if (keyPaths.length === 1)
            keyPaths = keyPaths[0];
          store.createIndex(indexName, keyPaths, { unique: false });
        }

        // Create internally used indices.
        try {
          if (!store.index(":origin"))
            throw null;
        } catch (err) {
          store.createIndex(":origin", "_origin", { unique: false });
        }
        try {
          if (!store.index(":url"))
            throw null;
        } catch (err) {
          store.createIndex(":url", "_url", { unique: true });
        }
      }
    }

    this._idbOpenRequest.onsuccess = async e => {
      this._idb = this._idbOpenRequest.result;

      // Get all cached archive data early, as we randomly access it later on.
      this._archivesCached = [];
      this._archivemapCached = {};
      var transactionArchives = this._idb.transaction("_rdb_archives", "readonly");
      var storeArchives = transactionArchives.objectStore("_rdb_archives");
      await new Promise((resolve, reject) => storeArchives.openCursor().onsuccess = e => {
        var cursor = e.target.result;
        if (!cursor) {
          resolve();
          return;
        }
        var archive = cursor.value;
        this._archivesCached.push(archive);
        this._archivemapCached[archive.url] = archive;
        cursor.continue();
      });

      for (var name in this._defs) {
        var table = this[name] || new RotonDBTable(this, name);
        table._open(this._defs[name]);
        this[name] = table;
        this._tables.push(table);
      }

      // Update any rdbed archives.
      var archives = this._archives;
      var archiveopts = this._archiveopts;

      this._archives = [];
      this._archivemap = {};
      this._archiveopts = {};
      this._archiveurls = new Set();

      if (!archives) {
        resolve();
        return;
      }
      for (var i in archives) {
        var archive = archives[i];
        this.indexArchive(archive, archiveopts[archive.urlResolved]);
      }
      resolve();      
    }

    this._idbOpenRequest.onerror = e => {
      reject(this._idbOpenRequest.error);
    }
  });

  this._getArchiveAndURL = async function(archiveOrURL) {
    var url = archiveOrURL.url || archiveOrURL;
    var urlResolved = this._urlcache[url];
    if (!urlResolved) {
      try {
        urlResolved = "dat://" + await DatArchive.resolveName(url);
        this._urlcache[url] = urlResolved;
      } catch (e) {
      }
    }
    if (!urlResolved)
      urlResolved = url;
    url = RotonDBUtil.normalizeURL(url);
    urlResolved = RotonDBUtil.normalizeURL(urlResolved);
    
    var archive = undefined;
    if (this._archivemap[url]) {
      if (url != urlResolved && !this._archiveurls.has(urlResolved))
        this._archiveurls.add(urlResolved);
      archive = this._archivemap[url];
    } else if (this._archivemap[urlResolved])
      archive = this._archivemap[urlResolved];
    
    return { archive: archive, url: url, urlResolved: urlResolved };
  }
  this._getArchive = async function(url) {
    return (await this._getArchiveAndURL(url)).archive;
  }

  this._getArchiveCachedInfo = async function(url) {
    if (this._archivemapCached[url])
      return this._archivemapCached[url];

    var transaction = this._idb.transaction("_rdb_archives", "readonly");
    var store = transaction.objectStore("_rdb_archives");
    return this._archivemapCached[url] = await RotonDBUtil.promiseRequest(store.get(url));
  }
  this._updateArchiveCachedInfo = async function(archive) {
    var info = {
      url: archive.url,
      version: archive.rdb.version,
      paths: archive.rdb.paths, 
    };

    var index = this._archivesCached.findIndex(a => a.url === archive.url);
    if (index !== -1)
      this._archivesCached[index] = info;
    else
      this._archivesCached.push(info);
    this._archivemapCached[archive.url] = info;

    var transaction = this._idb.transaction("_rdb_archives", "readwrite");
    var store = transaction.objectStore("_rdb_archives");
    await RotonDBUtil.promiseRequest(store.put(info));
  }

  this.isSource = function(url) {
    // This can fail with unresolved names, but we can't resolve here.
    return this._archiveurls.has(RotonDBUtil.normalizeURL(url));
  }

  this.indexArchive = async function(archiveOrURL, opts) {
    var {archive, url, urlResolved} = await this._getArchiveAndURL(archiveOrURL);
    if (!archive) {
      archive = new DatArchive(url);
    }
    archive.urlResolved = urlResolved; // Nothing will care about this, right?

    var paths = await RotonDBUtil.promiseTimeout(archive.readdir("/", { recursive: true, timeout: this.timeoutDir }), this.timeoutDir);
    var info = await RotonDBUtil.promiseTimeout(archive.getInfo({ timeout: this.timeoutDir }), this.timeoutDir);
    RotonDBUtil.fixFilepaths(paths);
    archive.rdb = {
      pattern: [],
      events: null,
      paths: paths,
      failed: new Set(),
      fetching: {},
      version: info.version,
      history: undefined,
    };

    var cachedInfo = await this._getArchiveCachedInfo(archive.url);    
    if (cachedInfo && cachedInfo.version < archive.rdb.version) {
      archive.rdb.history = await RotonDBUtil.promiseTimeout(archive.history({ start: cachedInfo.version + 1, end: archive.rdb.version, timeout: this.timeoutFile }), this.timeoutFile);
    }

    this._archives.push(archive);
    this._recordcaches[urlResolved] = {};
    this._archivemap[urlResolved] = archive;
    this._archiveopts[urlResolved] = opts || {};
    this._archiveurls.add(url);
    if (url != urlResolved && !this._archiveurls.has(urlResolved))
      this._archiveurls.add(urlResolved);
    
    for (var i in this._tables) {
      var table = this._tables[i];
      // Build archive.rdb.pattern and handle history.
      await table._indexArchive(archive);
    }
    
    // Process archive.rdb.pattern
    this._watch(archive);

    // Inform the tables about the files' existence.
    var updated = false;
    for (var i in paths) {
      var path = paths[i];
      updated = await this._invalidate(archive, path, false) || updated;
    }

    await this._updateArchiveCachedInfo(archive);

    if (updated)
      this._fire("indexes-updated", archive.url);

    return archive;
  }

  this.unindexArchive = async function(archiveOrURL) {
    var {archive, url, urlResolved} = await this._getArchiveAndURL(archiveOrURL);
    if (!archive)
      return;

    this._archives.splice(this._archives.indexOf(archive), 1);
    this._recordcaches[urlResolved] = undefined;
    this._archivemap[urlResolved] = undefined;
    this._archiveopts[urlResolved] = undefined;
    if (this._archiveurls.has(url))
      this._archiveurls.delete(url);
    if (this._archiveurls.has(urlResolved))
      this._archiveurls.delete(urlResolved);

    this._unwatch(archive);

    for (var i in this._tables) {
      var table = this._tables[i];
      // The tables need to find the records and remove them themselves.
      await table._unindexArchive(archive);
    }

    archive.rdb = undefined;    

  }

  this.watchArchive = async function(archiveOrURL) {
    var {archive, url, urlResolved} = await this._getArchiveAndURL(archiveOrURL);
    if (!archive)
      return;
    
    this._archiveopts[urlResolved].watch = true;
    this._watch(archive);    
  }

  this.unwatchArchive = async function(archiveOrURL) {
    var {archive, url, urlResolved} = await this._getArchiveAndURL(archiveOrURL);
    if (!archive)
      return;
    
    this._archiveopts[urlResolved].watch = true;
    this._unwatch(archive);    
  }

  this._watch = function(archive) {
    if (this._archiveopts[archive.urlResolved].watch === false)
      return;
    if (archive.rdb.events)
      this._unwatch(archive);
    archive.rdb.events = archive.watch(archive.rdb.pattern);
    archive.rdb.events.addEventListener("invalidated", ({path}) => {
      // Download and cache the record in background.
      archive.download(path);
    });
    archive.rdb.events.addEventListener("changed", ({path}) => {
      path = "/" + path.replace(RotonDBUtil.fixFilepathsBackslashPattern, "/");
      while (path.length > 2 && path[0] === "/" && path[1] === "/")
        path = path.substr(1);
      
      // Update general archive info.
      RotonDBUtil.promiseTimeout(archive.getInfo({ timeout: this.timeoutDir }), this.timeoutDir).then(info => {
        archive.rdb.version = info.version;
        this._updateArchiveCachedInfo(archive);
      });
      
      // Don't limit ourselves to invalidation: Fetch real-time updates ahead of time.
      if (this._invalidate(archive, path, false)) // We need to clear anything cached first.
        this._fetch(archive, path, true, true);
    });
  }

  this._unwatch = function(archive) {
    if (!archive.rdb.events)
      return;
    archive.rdb.events.close();
    archive.rdb.events = null;
  }

  this._invalidate = async function(archive, path, fire) {
    var updated = false;
    for (var i in this._tables) {
      var table = this._tables[i];
      updated = await table._invalidate(archive, path) || updated;
    }
    if (updated && fire)
      this._fire("indexes-updated", archive.url + path);
    return updated;
  }

  this._fetch = async function(archive, file, isAvailable, fire) {
    var updated = false;
    for (var i in this._tables) {
      var table = this._tables[i];
      updated = await table._fetch(archive, file, isAvailable) || updated;
    }
    if (updated && fire)
      this._fire("indexes-updated", archive.url + file);
    return updated;
  }

  this._getRecordCached = function(url, path) {
    var cache = this._recordcaches[url];
    if (!cache)
      cache = this._recordcaches[url] = {};
    if (!path)
      return cache;
    var record = cache[path];
    if (!record)
      return undefined;
    return record;
  }

  this._setRecordCached = function(url, path, record) {
    var cache = this._recordcaches[url];
    if (!cache)
      cache = this._recordcaches[url] = {};
    cache[path] = record;
  }

  this._on = {
    "indexes-updated": [] // Contains functions of format (url) => {...}
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

  // TL;DR for this following write mess: Don't write concurrently.
  this._writing = {};
  this._writeSafe = function(url, archive, path, record) {
    var writing = this._writing[url];
    if (writing) {
      clearTimeout(writing.timeout);
    } else {
      this._writing[url] = writing = {};
    }
    writing.record = record;
    writing.timeout = setTimeout(() => {
      this._writing[url] = undefined;
      archive.writeFile(path, JSON.stringify(record));
    }, this.delayWrite);
  }

  // TL;DR for this following fetch mess: Don't hammer Beaker with file requests.
  this._fetches = 0;
  this._fetchQueue = [];
  this._fetchExec = function(fetchGen, resolve, reject, attempt) {
    // fetchGen is a function generating the fetching promise, thus basically an async function.
    var db = this; // Used later because this there != this here.

    if (attempt === undefined)
      attempt = 0;

    if (this._fetches >= this.fetchCountMax) {
      // Fetch needs to be queued.
      return new Promise((resolve, reject) => {
        // Return a promise and queue our new promise's resolve and rejects.
        // They will be called further down when it's the fetch's turn.
        db._fetchQueue.push([ fetchGen, resolve, reject, attempt ]);
      });
    }

    // Fetch fits in our fetching budget.
    this._fetches++;
    var fetch = fetchGen();
    // Return the original promise; once it finishes, move on to the next queued fetch.
    // If this already was queued, invoke the queued resolve and reject from our proxy promise.

    fetch.then(
      function () {
        // Move to next and invoke any passed resolve.
        db._fetchNext.call(db);
        if (resolve)
          resolve.apply(this, Array.prototype.slice.call(arguments));
      },
      function () {
        attempt++;
        if (attempt < db.fetchRetriesMax) {
          // Retry.
          db._fetchQueue.push([ fetchGen, resolve, reject, attempt ]);
          db._fetchNext.call(db);
        } else {
          // We retried too often - reject.
          db._fetchNext.call(db);
          if (reject)
            reject.apply(this, Array.prototype.slice.call(arguments));
        }
      }
    );
    return fetch;
  };
  this._fetchNext = function() {
    this._fetches--;
    if (this._fetchQueue.length > 0) {
      var queued = this._fetchQueue.splice(0, 1)[0];
      // queued is an array containing the args for _fetchExec.
      this._fetchExec.apply(this, queued);
    }
  };

}

function RotonDBTable(db, name) {
  this._db = db;
  this.name = name;

  this._open = function(def) {
    this._def = def;
  }

  this._transaction = function(mode) {
    this._idbTransaction = this._db._idb.transaction(this.name, mode);
    this._idbTransaction.onerror = e => {
      console.error("Transaction to table failed!",this.name,this._idbTransaction.error);
      this._idbTransaction = null;
      this._idbStore = null;
    }
    this._idbTransaction.oncomplete = e => {
      this._idbTransaction = null;
      this._idbStore = null;
    }
    this._idbTransaction.onabort = e => {
      this._idbTransaction = null;
      this._idbStore = null;
    }
    return this._idbTransaction;
  }

  this._store = function(mode) {
    return this._transaction(mode).objectStore(this.name);
  }

  this._indexArchive = async function(archive) {
    if (typeof this._def.filePattern === "string")
      archive.rdb.pattern.push(this._def.filePattern);
    else
      Array.prototype.push.apply(archive.rdb.pattern, this._def.filePattern);
    
    if (archive.rdb.history) {
      // Delete records modified in history from our DB. Refetch them later.
      var store = this._store("readwrite");
      var promises = [];
      for (var hi in archive.rdb.history) {
        var entry = archive.rdb.history[hi];
        if (!RotonDBUtil.matchPattern(entry.path, this._def.filePattern))
          continue;
        promises.push(RotonDBUtil.promiseRequest(store.delete(archive.url + entry.path)).catch(_=>_));
      }
      await Promise.all(promises);
    }
  }

  this._unindexArchive = async function(archive) {
    // TODO: Should records keep existing in IndexedDB even after unindexing the archive?
  }

  this._ack = function(archive, path, record) {
    // Acknowledge the file, actually download and read it later on _fetch
    if (archive.rdb.paths.indexOf(path) === -1) {
      archive.rdb.paths.push(path);
      this._db._updateArchiveCachedInfo(archive);
    }
    this._db._setRecordCached(archive.url, path, record);
  }

  this._invalidate = async function(archive, path) {
    if (!RotonDBUtil.matchPattern(path, this._def.filePattern))
      return false;
    
    // Acknowledge file and reset cached record for the path.
    this._ack(archive, path, undefined);
    
    return true;
  }

  this._fetch = async function(archive, path, isAvailable) {
    if (!RotonDBUtil.matchPattern(path, this._def.filePattern))
      return undefined;
    if (archive.rdb.failed.has(path)) {
      if (isAvailable) {
        archive.rdb.failed.delete(path);
      } else {
        return undefined;
      }
    }

    var record = this._db._getRecordCached(archive.url, path);
    if (record)
      return record;
    
    try {
      var fetch = archive.rdb.fetching[path];
      if (fetch && !isAvailable) {
        // Already fetching the same record.
        record = await fetch;
      } else {
        // Start a "shared" fetch in case we end up fetching this concurrently.
        // We create a fetching async function, send it through the _fetchExec queue
        // and store the returned promise in the fetching map.
        record = await (archive.rdb.fetching[path] = this._db._fetchExec(async () => {
          // TODO: archive.download can timeout even though the file exists.
          // if (!isAvailable)
            // await RotonDBUtil.promiseTimeout(archive.download(path), this._db.timeoutFile);
          return JSON.parse(await RotonDBUtil.promiseTimeout(archive.readFile(path, { timeout: this._db.timeoutFile }), this._db.timeoutFile));
        }));
      }
    } catch (e) {
      // toString because this can fail more than once at a time (concurrent fetch).
      // Prevent the log from cluttering with the same error message.
      console.error("Failed fetching "+archive.url+path+" "+e.stack);
    }
    archive.rdb.fetching[path] = undefined;

    if (!record) {
      this._ack(archive, path, undefined);
      archive.rdb.failed.add(path);
      return undefined;
    }

    return await this._ingest(archive, path, record, true);
  }

  this._ingest = async function(archive, path, record, validate) {
    if (this._def.preprocess) this._def.preprocess(record);
    if (validate && this._def.validate && !this._def.validate(record)) {
      this._ack(archive, path, undefined);
      var store = this._store("readwrite");
      await RotonDBUtil.promiseRequest(store.delete(url));
      return undefined;
    }

    record = RotonDBUtil.wrapRecord(archive, path, record);

    this._ack(archive, path, record);

    var store = this._store("readwrite");
    await RotonDBUtil.promiseRequest(store.put(record, archive.url + path));

    return record;
  }

  this.isCached = async function(url) {
    return await RotonDBUtil.promiseRequest(this._store("readonly").index(":url").get(url)) ? true : false;
  }

  this.isRecordFile = function(url) {
    let path = RotonDBUtil.splitURL(url).path;
    return RotonDBUtil.matchPattern(path, this._def.filePattern);
  }

  this.listRecordFiles = async function(url) {
    if (!url) {
      let all = [];
      for (let archive of this._db._archives) {
        let archiveURL = RotonDBUtil.normalizeURL(archive.url);
        all = all.concat(archive.rdb.paths
          .filter(path => RotonDBUtil.matchPattern(path, this._def.filePattern))
          .map(path => archiveURL + path));
      }
      return all;
    }

    let archiveURL = RotonDBUtil.splitURL(url).archiveURL;
    let archive = await this._db._getArchive(url);
    return archive.rdb.paths
      .filter(path => RotonDBUtil.matchPattern(path, this._def.filePattern))
      .map(path => archiveURL + path);
  }

  this.get = async function(urlOrKey, value) {
    var record = undefined;
    var key = urlOrKey;
    if (!value) {
      key = ":url";
      value = urlOrKey;
    }

    var store = this._store("readonly");
    var index = store.index(key);
    record = await RotonDBUtil.promiseRequest(index.get(value));

    if (!record) {
      if (key === ":url") {
        // Let's cheat a little.
        // We assume that the archive must be indexed.
        var { archiveURL, path } = RotonDBUtil.splitURL(value);
        var archive = await this._db._getArchive(archiveURL);
        if (!archive)
          return undefined;
        return await this._fetch(archive, path);
      }

      if (key === ":origin") {
        // Let's cheat a little.
        // We assume that the archive must be indexed.
        var archive = await this._db._getArchive(RotonDBUtil.normalizeURL(value));
        if (!archive)
          return undefined;
        
        // Check for the first cached record with a matching path.
        var cache = this._db._getRecordCached(archive.url);
        for (var path in cache) {
          if (!RotonDBUtil.matchPattern(path, this._def.filePattern))
            continue;
          record = cache[path];
          if (record)
            return RotonDBUtil.unwrapRecord(record);
        }

        // If the record hasn't been indexed, let's just recheck the archive.
        var paths = archive.rdb.paths;
        var record = false;
        for (var i in paths) {
          var file = paths[i];
          // We only care about the first file.
          if (record = await this._fetch(archive, file))
            return RotonDBUtil.unwrapRecord(record);
        }

        return undefined;
      }

      // Worst case scenario - refetch and check everything with a matching path.
      for (var ai in this._db._archives) {
        var archive = this._db._archives[ai];
        if (!archive)
          continue;
        for (var pi in archive.rdb.paths) {
          var path = archive.rdb.paths[pi];
          if (!RotonDBUtil.matchPattern(path, this._def.filePattern))
            continue;
          var record = await this._fetch(archive, path);
          if (record && RotonDBUtil.isValue(record, key, value))
            return RotonDBUtil.unwrapRecord(record);
        }
      }

      return undefined;
    }
    
    return RotonDBUtil.unwrapRecord(record);
  }

  this.query = function() {
    return new RotonDBQuery(this);
  }

  this.where = function(key) {
    return this.query().where(key);
  }

  this._fetchQuery = async function(stack, foreachfn) {
    // "Cheating" prepass: Check for any clauses containing :origin.
    // This prevents us from fetching anything from uninteresting archives.
    var origin = undefined;
    for (var si = stack.length - 1; si > -1; --si) {
      var query = stack[si];
      if (query._clause && query._clause._origin) {
        if (!origin)
          origin = (url) => true;
        origin = ((a, b) => (url) => a(url) && b(url))(origin, query._clause._origin);
      }
    }

    var records = [];

    /* Short summary of what's going on here:
     * 
     * Go through all archives we know about.
     * If we're filtering origins, filter them now.
     * Get the actual archive to lazy fetch later on.
     * 
     * Go through all filepaths we know about.
     * Filter the filepaths - we only care about records for this table.
     * 
     * Try to get record from following sources in order:
     * archive temporary cache
     * IndexedDB store
     * archive fetch
     */
    // Get everything from matching archives with matching paths.
    // If the record isn't cached and the archive is indexed, fetch.
    // Do all that async.
    var promises = [];
    var push = record => {
      records.push(record);
    }
    if (foreachfn) {
      push = (push => record => {
        foreachfn(record);
        push(record);
      })(push);
    }

    // Wrap our push with the clause filters.
    // While at it, also get the sorting function.
    var sort = null;
    while (stack.length > 0) {
      var query = stack.pop();
      if (query._clause) {
        sort = query._clause._sort || sort; // We only care about the last sort.
        push = (push => record => {
          if (query._clause._filter(record))
            push(record);
        })(push);
      }
    }

    // The filters already expect the unwrapped record.
    push = (push => record => {
      push(RotonDBUtil.unwrapRecord(record));
    })(push);

    for (var ai in this._db._archivesCached) {
      var archiveCached = this._db._archivesCached[ai];
      if (!archiveCached)
        continue;
      if (origin && !origin(archiveCached.url))
        continue;
      var archive = this._db._archivemap[archiveCached.url];
      var archiveCache = this._db._getRecordCached(archiveCached.url);

      for (var pi in archiveCached.paths) {
        var path = archiveCached.paths[pi];
        if (!RotonDBUtil.matchPattern(path, this._def.filePattern))
          continue;
        
        if (archiveCache[path]) {
          push(archiveCache[path]);
          continue;
        }
        
        promises.push(((archiveCached, archive, path) => new Promise((resolve, reject) => {
          // Sadly, we can't start the transaction outside the promise.
          var store = this._store("readonly");
          var index = store.index(":url");
          var request = index.get(archiveCached.url + path);
          
          var fetchOrPush = record => {
            if (record) {
              this._db._setRecordCached(archiveCached.url, path, record);
              push(record);
            }
            if (record || !archive) {
              resolve(); // Don't cancel early, but push nothing.
              return;
            }

            this._fetch(archive, path).then(record => {
              if (record) {
                push(record);
              }
              resolve(); // Don't cancel early, but push nothing.              
            });
          }

          request.onsuccess = e => fetchOrPush(request.result);
          request.onerror = e => fetchOrPush(null);
        }))(archiveCached, archive, path));
      }
    }
    await Promise.all(promises);

    if (sort)
      records = sort(records);
    return records;
  }

  this.update = function(url, updatesOrFn) {
    if (typeof updatesOrFn === "function")
      return this._updateByFn(url, updates);
    return this._updateByUpdates(url, updatesOrFn);
  }
  this._updateByUpdates = async function(url, updates) {
    var record = await this.get(url) || {};
    Object.assign(record, updates);
    try {
      await this.put(url, record);
      return 1;
    } catch (e) {
      return 0;
    }
  }
  this._updateByFn = async function(url, fn) {
    var record = await this.get(url);
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
    var archive = await this._db._getArchive(archiveURL);
    if (!archive)
      throw new Error("Archive "+archiveURL+" not indexed");

    record = RotonDBUtil.unwrapRecord(record);
    if (this._def.serialize) {
      record = this._def.serialize(record);
    }
    
    await this._ingest(archive, path, record, false);
    this._db._fire("indexes-updated", archiveURL + path);
    this._db._writeSafe(url, archive, path, record); // Don't await this.
    return archiveURL + path;
  }

  this.delete = async function(url) {
    try {
      var store = this._store("readwrite");
      await RotonDBUtil.promiseRequest(store.delete(url));

      var { archiveURL, path } = RotonDBUtil.splitURL(url);
      var archive = await this._db._getArchive(archiveURL);
      if (!archive)
        return 1;

      var index = archive.rdb.paths.indexOf(path);
      if (index !== -1) {
        archive.rdb.paths.splice(index, 1);
        this._db._updateArchiveCachedInfo(archive);
      }

      this._db._fire("indexes-updated", archiveURL + path);

      try {
        await archive.unlink(path);
      } catch (e) {
        // Fail silently if we don't own the archive.
      }
      return 1;
    } catch (e) {
      console.error("Failed deleting",url,e);
      return 0;
    }
  }

}

function RotonDBQuery(source, clause) {
  this._source = source;
  this._clause = clause;

  this.where = function(key) {
    return new RotonDBWhereClause(this, key);
  }

  this._fetchQuery = async function(stack, foreachfn) {
    stack.push(this);
    return await this._source._fetchQuery(stack, foreachfn);
  }

  this.toArray = async function() {
    return await this._fetchQuery([]);
  }

  this.forEach = async function(foreachfn) {
    return await this._fetchQuery([], foreachfn);
  }

  this.last = async function() {
    var records = await this._fetchQuery([]);
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
  this._filter = (input => true);
  this._sort = (input => input);

  this._ = function(type, data, sampleValue) {
    this._type = type;
    this._data = data;
    this._transform = this["_transform_"+type](data);
    this._filter = this["_filter_"+type](data);
    // According to a WebDB error message I once got, where clauses order implicitly.
    this._sort = input => RotonDBUtil.sort(input, c._key, sampleValue);
    
    if (this._key === ":origin") {
      this._origin = this["_origin_"+type](sampleValue);
    } else {
      // Let's fall back to split...
      var keySplit = this._key.split("+");
      var indexOfOrigin = keySplit.indexOf(":origin");
      if (indexOfOrigin !== -1) {
        this._origin = this["_origin_"+type](sampleValue[indexOfOrigin]);
      }
    }

    return new RotonDBQuery(this._source, this);
  }

  this.equals = function(value) {
    return this._("equals", value, value);
  }
  this._transform_equals = value => input => {
    var output = [];
    for (var i in input) {
      var record = input[i];
      if (RotonDBUtil.isValue(record, c._key, value))
        output.push(record);
    }
    return output;
  }
  this._filter_equals = value => input => {
    return RotonDBUtil.isValue(input, c._key, value);
  }
  this._origin_equals = value => input => {
    return input === value;
  }

  this.between = function(lowerValue, upperValue) {
    return this._("between", { lowerValue: lowerValue, upperValue: upperValue }, lowerValue);
  }
  this._transform_between = ({lowerValue, upperValue}) => input => {
    var output = [];
    for (var i in input) {
      var record = input[i];
      if (RotonDBUtil.isValueBetween(record, c._key, lowerValue, upperValue))
        output.push(record);
    }
    return output;
  }
  this._filter_between = ({lowerValue, upperValue}) => input => {
    return RotonDBUtil.isValueBetween(input, c._key, lowerValue, upperValue);
  }
  this._origin_between = value => input => {
    return input === value;
  }

}
