//@ts-check
class Portal {
  constructor(url) {
    this.url = "dat://" + toHash(url);
    if (url === "$rotonde")
      this.url = url;
    // URL used for database stuff.
    this.recordURL = this.url;

    this.name = "";
    this.desc = "";
    this.icon = this.url + "/media/content/icon.svg";
    this.sameAs = [];
    this.follows = [];

    this.isRemote = false;
    this.remote_parent = null;

    if (this.url === "$rotonde") {
      this.icon = r.url + "/media/logo.svg";
    }

    /** @type {DatArchive} */
    this.archive = null; // Set on connection or on start.
    // Resolve "masked" (f.e. hashbase) dat URLs to "hashed" (dat://0123456789abcdef/) one.
    // This is required to find and prevent duplicates.
    DatArchive.resolveName(this.url).then(hash => {
      if (!hash)
        return;
      this.dat = `dat://${hash}`;
    });

    // Cached data.
    this._ = {};
    this._hashes = null;
    this._hashesSet = null;
    this._hashesURLs = {};

    // Contains functions of format json => {...}
    this.onparse = [];

  }

  fire(event) {
    let handlers;
    if (typeof(event) === "function")
      handlers = [event];
    else if (event.length && typeof(event[0]) === "function")
      handlers = event;
    else
      handlers = this["on"+event];
    if (!handlers || handlers.length === 0) return true; // Return true by default.
    let args = Array.prototype.splice.call(arguments, 1);
    for (let handler of handlers) {
      let result = handler.apply(this, args);
      if (result === true) // We only want true, not truly values.
        continue; // If the handler returned true, continue to the next handler.
      else if (result === false) // We only want false, not falsy values.
        return false; // Exit early.
      else if (result !== undefined)
        return result; // If the handler returned something, return it early.
    }
    return true;
  }

  invalidate() {
    this._entriesBuffered = this._.entries || this._entriesBuffered;
    this._ = {};
  }

  
  _hashesGen() {
    if (
      this._hashesURLs.url == this.url &&
      this._hashesURLs.archiveURL == (this.archive ? this.archive.url : undefined) &&
      this._hashesURLs.dat == this.dat
    )
      return; // URLs didn't update - use cached hashes.

    let hashes = this._hashes = [];
    let hash;
    if (hash = toHash(this._hashesURLs.url = this.url))
      hashes.push(hash);
    if (hash = toHash(this._hashesURLs.archiveURL = (this.archive ? this.archive.url : undefined)))
      hashes.push(hash);
    if (hash = toHash(this._hashesURLs.dat = this.dat))
      hashes.push(hash);

    this._hashesSet = new Set(hashes);
  }
  get hashes() {
    this._hashesGen();
    return this._hashes;
  }
  get hashesSet() {
    this._hashesGen();
    return this._hashesSet;
  }

  get relationship() {
    if (this.url.length > 0 && this.url[0] == "$")
      return "rotonde";

    if (hasHash(this, r.home.portal))
      return "self";
    
    if (hasHash(this.follows, r.home.portal))
      return "both";

    if (hasHash(r.home.portal.follows, this))
      return "follow";

    return "unknown";
  }

  isKnown(discovered) {
    let hashes = this.hashesSet;

    for (let id in r.home.feed.portals) {
      let lookup = r.home.feed.portals[id];
      if (hasHash(hashes, lookup))
        return true;
    }

    return false;
  }

  async _connect() {
    let record;

    // This is known to fail.
    /*
    try {
      // Check if we "know" the portal. Index and watch async.
      record = await r.db.portals.get(":origin", this.url);
      if (this.archive && r.db.isSource(this.archive.url))
        r.db.watchArchive(this.url);
      else
        r.db.indexArchive(this.archive || this.url, { watch: true }).then(_ => this.archive = _);
      return await this.getRecord();
    } catch (e) {
    }
    */

    // We don't have any cached data - index and watch await, then get.
    if (this.archive && r.db.isSource(this.archive.url))
      await r.db.watchArchive(this.archive.url);
    else
      this.archive = await r.db.indexArchive(this.archive || this.url, { watch: true });
    record = await this.getRecord();

    return record;
  }

  async connect() {
    console.log("[portal]", "Connecting to", this.url);
    try {
      await this._connect();
    } catch (e) {
      console.error("[portal]", "Failed connecting to", this.url, e);
      throw e;
    }
  }

  async fetch() {
    console.log("[portal]", "Fetching", this.url);
    try {
      this.archive = new DatArchive(this.url);
      let recordForce;
      try {
        // Assume that a profile.json in the correct format exists in the archive.
        recordForce = JSON.parse(await this.archive.readFile("/profile.json"));
      } catch (e) {
        // ... or portal.json
        recordForce = JSON.parse(await this.archive.readFile("/portal.json"));
        r.db.portals._def.preprocess(recordForce);
      }
      return await this.getRecord(recordForce);
    } catch (e) {
      return false;
    }
  }

  async maintenance() {
    if (r.isOwner && !(await this.archive.getInfo()).isOwner)
      return;

    let recordMe = await this.getRecord();

    // Remove duplicate portals
    let checked = new Set();
    let followsOrig = recordMe.follows;
    let follows = [];
    for (let follow of followsOrig) {
      let domain = toHash(follow.url);
      if (checked.has(domain))
        continue;
      checked.add(domain);
      let name = ""; // name_from_domain(domain);
      follows.push({ name: name, url: `dat://${domain}` });
    }

    let feed = recordMe.feed;
    let promises = [];

    promises.push(r.db.portals.update(recordMe.getRecordURL(), {
      follows: follows,
      version: r.version,
      feed: []
    }));

    // Copy any legacy feed entries to /posts/
    if (feed && feed.length > 0)
      for (let i in feed)
        promises.push(r.home.postEntry(new Entry(feed[i], this)));
    
    await Promise.all(promises);
  }

  async getRecord(recordForce) {
    let record = this._.record;
    if (record)
      return record;

    record = this._.record = recordForce || await r.db.portals.get(":origin", this.url);
    if (!record)
      throw new Error("Portal not found: " + this.url);
    if (record.getRecordURL)
      this.recordURL = record.getRecordURL();

    // Values for contexts unable to await get()
    this.name = record.name;
    this.desc = record.bio;
    if (record.avatar) {
      this.icon = this.url + "/" + record.avatar;
    } else {
      this.icon = this.url + "/media/content/icon.svg"
    }
    this.sameAs = record.sameAs;
    this.follows = record.follows;
    this.discoverable = record.discoverable;
    this.version = record.version;

    this.timestampLast = (await this.archive.getInfo()).mtime;

    if (!this.fire("parse", record))
      throw new Error("onparse returned false!");    
    return record;
  }

}

function PortalLegacy(url)
{

  

  this.discover = async function()
  {
    this.discovery = true;

    // console.log('connecting to: ', p.url);

    try {
      await p._connect();
    } catch (err) {
      // console.log('connection failed: ', p.url, err);
      r.home.discover_next();
      return;
    }

    setTimeout(r.home.feed.next, r.home.feed.connection_delay);      

    r.home.discover_next(p);
  }

  this.load_remotes = async function() {
    var record_me = await p.getRecord();
    if (!record_me.sameAs || record_me.sameAs.length === 0) {
      return;
    }

    var remotes = record_me.sameAs.map((remote_url) => {
      return {
        url: remote_url,
        oncreate: function() {
          this.isRemote = true;
          this.remote_parent = p;
        },
        onparse: function(record) {
          if (p.name === record.name) {
            record.name = "";
          }
          this.name = `${p.name}=${record.name}`
          this.icon = p.icon;
          if (has_hash(r.home.portal, this.remote_parent)) {
            Array.prototype.push.apply(r.home.feed.connectQueue, record.follows.map(port => {
              return {
                url: port.url,
                onparse: function() { return true; }
              }
            }))
          }
          if (this.sameAs) {
            return has_hash(this.sameAs, p.hashes);
          }
          return false;
        }
      }
    });
    // We try to connect to the remotes before any other portals, as they're of higher priority.
    remotes.push.apply(remotes, r.home.feed.connectQueue);
    r.home.feed.connectQueue = remotes;
    r.home.feed.startConnectLoop();
  }

  this._entriesBuffered = [];
  this.__entries_map__ = {}; // Cache entries when possible.
  this.__entries_pending__ = null;
  /* Warning! The entry query can take some time to resolve.
   * Unfortunately, during that time, the feed can refresh multiple times.
   * We previously returned this._.entries, further causing issues, as we
   * manipulated it at the same time.
   * 
   * If an entry query is already pending, we now instead "block",
   * which prevents the issues mentioned above from happening.
   * 
   * If you just want entries "now" and don't care about accuracy,
   * use entriesBuffered instead.
   */
  this.__entries_ingest__ = function(raw, added, entries, entries_map) {
    var timestamp = raw.createdAt || raw.timestamp;
    if (added.has(timestamp)) return;
    var entry = entries_map[timestamp];
    if (!entry)
      entries_map[timestamp] = entry = new Entry(raw, p);
    else
      entry.update(raw, p);
    entry.is_mention = entry.detect_mention();
    added.add(timestamp);
    entries.push(entry);
    entries_map[entry.id] = entry;

    // _entriesBuffered is a different beast - we need to check the entry's existence manually.
    var bufferedIndex = this._entriesBuffered.indexOf(entry);
    if (bufferedIndex === -1)
      this._entriesBuffered.push(entry);
    // Note: We don't need to refresh, as buffered entries are shared via __entries_map__
  }
  this.entries = function() {
    if (this._.entries)
      return (async () => this._.entries)();
    
    if (this.__entries_pending__)
      return this.__entries_pending__;
    
    this.__entries_pending__ = (async () => {
      var _ = this._; // We only want to cache our entries for the current _
      // If this._ gets reset, we still return the "current" entries, but don't cache them.
      var added = new Set();
      var entries = [];
      var entries_map = this.__entries_map__;

      // Legacy feed: single feed array containing all posts.
      var feed = (await this.getRecord()).feed || [];
      for (var id in feed) {
        var raw = feed[id];
        this.__entries_ingest__(raw, added, entries, entries_map);
      }

      // New format feed: posts split into multiple files.
      await r.db.feed.where(":origin").equals(p.url).forEach(raw => {
        this.__entries_ingest__(raw, added, entries, entries_map);
      });

      // TODO: Remove stale entries from __entries_map__

      _.entries = entries;

      if (this.__entries_refresh__ && this._ === _) {
        // We were rendering a subset of entries, f.e. via entriesBuffered,
        // and want the feed to refresh lazily once entries() "finished."
        this.__entries_refresh__ = false;
        r.home.feed.refreshLazy("entries() finished");
      }

      return entries;
    })();

    this.__entries_pending__.then(
      () => this.__entries_pending__ = null,
      () => this.__entries_pending__ = null
    );
    return this.__entries_pending__ || (async () => this._.entries)();
  };
  this.entry = async function(id)
  {
    var entries = await this.entries();
    return this.__entries_map__[id];
  }

  // This function returns a "safe" but outdated subset of the entries.
  this.entriesBuffered = async function() {
    if (this._.entries)
      return this._.entries;
    this.__entries_refresh__ = true;
    this.entries(); // Don't await - we need this to run concurrently to fill _entriesBuffered
    return this._entriesBuffered;
  }
  this.entryBuffered = async function(id)
  {
    var entries = await this.entriesBuffered();
    return this.__entries_map__[id];
  }

}
