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
    }, e => {
      console.warn("[portal]", "Failed resolving", this.url, "-", e);
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

  async invalidate() {
    this._ = {};
    this.entries = await r.db.feed.listRecordFiles(this.url);
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
    if (!r.isOwner)
      return;

    let me = await this.getRecord();

    // Remove duplicate portals
    let checked = new Set();
    let followsOrig = me.follows;
    let follows = [];
    for (let follow of followsOrig) {
      let hash = toHash(follow.url);
      if (checked.has(hash))
        continue;
      checked.add(hash);
      follows.push({ name: r.getName(hash), url: `dat://${hash}` });
    }

    // Sort the list if possible.
    follows = follows.sort((a, b) => {
      let ap = r.home.feed.getPortal(a.url, false);
      let bp = r.home.feed.getPortal(b.url, false);
      let ai = (ap ? -ap.timestampLast : 0) || follows.indexOf(a);
      let bi = (bp ? -bp.timestampLast : 0) || follows.indexOf(b);
      return ai - bi;
    });

    let feed = me.feed;
    let promises = [];

    promises.push(r.db.portals.update(me.getRecordURL(), {
      follows: follows,
      version: r.version,
      feed: []
    }));

    // Copy any legacy feed entries to /posts/
    if (feed && feed.length > 0)
      for (let i in feed)
        promises.push(r.home.postEntry(new Entry(feed[i], this, false)));
    
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
