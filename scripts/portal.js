function Portal(url)
{
  var p = this;

  this.url = "dat://"+to_hash(url);

  this.name = "";
  this.desc = "";
  this.icon = this.url + "/media/content/icon.svg";
  this.sameAs = [];
  this.follows = [];
  this.discoverable = null;

  this.record_url = null;

  if (this.url === r.client_url || this.url === "$rotonde") {
    this.icon = r.client_url.replace(/\/$/, "") + "/media/logo.svg";
  }

  this.archive = null; // Gets set on connection or start.
  // Resolve "masked" (f.e. hashbase) dat URLs to "hashed" (dat://0123456789abcdef/) one.
  DatArchive.resolveName(this.url).then(hash => {
    if (!hash) return;
    this.dat = "dat://"+hash+"/";
  });


  // Cached data.
  this._ = {};
  this.invalidate = function()
  {
    this.__entries_buffered__ = this._.entries || this.__entries_buffered__;
    this._ = {};
  }

  this.is_remote = false;
  this.remote_parent = null;

  this.is_discovered = false;

  this.onparse = []; // Contains functions of format json => {...}
  this.fire = function(event) {
    var handlers;
    if (typeof(event) === "function")
      handlers = [event];
    else if (event.length && typeof(event[0]) === "function")
      handlers = event;
    else
      handlers = this["on"+event];
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
  
  this.start = async function()
  {
    this.archive = await r.db.indexArchive(this.url);
    this.maintenance();
  }

  this.get = async function()
  {
    var record = this._.record;
    if (!record) {
      record = this._.record = await r.db.portals.get(":origin", p.url);
      if (!record)
        throw new Error("Portal not found: " + p.url);
      this.record_url = record.getRecordURL();

      // Values for contexts unable to await get()
      p.name = record.name.replace(/ /g, "_");
      p.desc = record.bio;
      if (record.avatar) {
        p.icon = p.url + "/" + record.avatar;
      } else {
        p.icon = p.url + "/media/content/icon.svg"
      }
      p.sameAs = record.sameAs;
      p.follows = record.follows;
      p.discoverable = record.discoverable;
      p.rotonde_version = record.rotonde_version;

      var last_timestamp = 0;
      var now = Date.now();

      var last = await r.db.feed.where(":origin+createdAt")
        .between([p.url, 0], [p.url, now])
        .last();
      if (last)
        last_timestamp = last.createdAt;
      
      if (record.feed) {
        for (var i in record.feed) {
          var entry = record.feed[i];
          var timestamp = entry.createdAt || entry.timestamp;
          if (last_timestamp < timestamp && timestamp < now)
            last_timestamp = timestamp;
        }
      }
      
      p.last_timestamp = last_timestamp;

      if (!this.fire("parse", record))
        throw new Error("onparse returned false!");    
    }
    return record;
  };

  this.maintenance = async function()
  {
    if (!r.is_owner)
      return;

    var record_me = await this.get();

    // Remove duplicate portals
    var checked = new Set();
    var followsOrig = record_me.follows;
    var follows = [];
    for(var id in followsOrig){
      var hash = to_hash(followsOrig[id].url);
      if(checked.has(hash)){ continue; }
      checked.add(hash);
      var name = name_from_hash(hash);
      follows.push({ name: name, url: "dat://"+hash+"/" });
    }

    r.db.portals.update(record_me.getRecordURL(), {
      follows: follows,
      rotonde_version: r.client_version
    });

    // Copy any legacy feed entries to /posts/
    if (record_me.feed && record_me.feed.length > 0)
      for (var i in record_me.feed)
        r.home.add_entry(new Entry(record_me.feed[i], this));
  }

  this._connect = async function()
  {
    var record;

    try {

      // Check if we "know" the portal. Index and watch async.
      record = await p.get();
      if (p.archive && r.db.isSource(p.archive.url))
        r.db.watchArchive(p.url);
      else
        r.db.indexArchive(p.archive || p.url, { watch: true }).then(_ => p.archive = _);

    } catch (err) {

      // We don't have any cached data - index and watch await, then get.
      if (p.archive && r.db.isSource(p.archive.url))
        await r.db.watchArchive(p.url);
      else
        p.archive = await r.db.indexArchive(p.archive || p.url, { watch: true });
      record = await p.get();

    }
  }

  this.connect = async function()
  {
    console.log('connecting to: ', p.url);
    
    try {
      await p._connect();
    } catch (err) {
      console.log('connection failed: ', p.url, err);
      r.home.feed.next();
      return;
    }

    setTimeout(r.home.feed.next, r.home.feed.connection_delay);      
    await r.home.feed.register(p);
  }

  this.discover = async function()
  {
    this.is_discovered = true;

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
    var record_me = await p.get();
    if (!record_me.sameAs || record_me.sameAs.length === 0) {
      return;
    }

    var remotes = record_me.sameAs.map((remote_url) => {
      return {
        url: remote_url,
        oncreate: function() {
          this.is_remote = true;
          this.remote_parent = p;
        },
        onparse: function(record) {
          if (p.name === record.name) {
            record.name = "";
          }
          this.name = `${p.name}=${record.name}`
          this.icon = p.icon;
          if (has_hash(r.home.portal, this.remote_parent)) {
            Array.prototype.push.apply(r.home.feed.queue, record.follows.map(port => {
              return {
                url: port.url,
                onparse: function() { return true; }
              }
            }))
          }
          if (this.sameAs) {
            return has_hash(this.sameAs, p.hashes());
          }
          return false;
        }
      }
    });
    // We try to connect to the remotes before any other portals, as they're of higher priority.
    remotes.push.apply(remotes, r.home.feed.queue);
    r.home.feed.queue = remotes;
    r.home.feed.connect();
  }

  this.__entries_buffered__ = [];
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

    // __entries_buffered__ is a different beast - we need to check the entry's existence manually.
    var bufferedIndex = this.__entries_buffered__.indexOf(entry);
    if (bufferedIndex === -1)
      this.__entries_buffered__.push(entry);
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
      var feed = (await this.get()).feed || [];
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
        r.home.feed.refresh_lazy("entries() finished");
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
    this.entries(); // Don't await - we need this to run concurrently to fill __entries_buffered__
    return this.__entries_buffered__;
  }
  this.entryBuffered = async function(id)
  {
    var entries = await this.entriesBuffered();
    return this.__entries_map__[id];
  }

  this.relationship = function(target = r.home.portal)
  {
    if (this.url === r.client_url) return create_rune("portal", "rotonde");
    if (has_hash(this, target)) return create_rune("portal", "self");
    if (has_hash(this.follows, target)) return create_rune("portal", "both");

    return create_rune("portal", "follow");
  }

  this.time_offset = function() // days
  {
    return parseInt((Date.now() - this.last_timestamp)/1000);
  }

  this.badge = function(special_class)
  {
    // Avoid 'null' class.
    special_class = special_class || '';

    var html = "";

    html += "<img src='"+escape_attr(this.icon)+"'/>";
    html += "<a data-operation='"+escape_attr(this.url)+"' href='"+escape_attr(this.url)+"'>"+this.relationship()+escape_html(this.name)+"</a> ";

    html += "<br />"

    var updated = this.last_timestamp
    if(updated){
      html += "<span class='time_ago'>"+timeSince(updated)+" ago</span>"
    }

    html += "<br />"
    // Version
    if(this.rotonde_version){
      // Used to check if the rotonde version matches when mod version is present.
      var version_regex = /^[0-9.]+[a-z]?/;
      var version_self = r.home.portal.rotonde_version.match(version_regex);
      var version_portal = this.rotonde_version.match(version_regex);
      var version_match =
        // Don't compare if either string doesn't contain a match.
        version_self &&
        version_portal &&
        version_self[0] == version_portal[0];
      // The version to display.
      var version = escape_html(this.rotonde_version)
        .split(/\r\n|\n/).slice(0, 2).join("<br>"); // Allow 2 lines for mod versions
      html += "<span class='version "+(version_match ? 'same' : '')+"'>"+version+"</span>"
    }

    html += "<span>"+this.follows.length+" Portals</span>"

    return "<yu class='badge "+special_class+"' data-operation='"+(special_class === "discovery"?"":"un")+escape_attr(this.url)+"'>"+html+"</yu>";
  }

  this.__hashes__ = null;
  this.__hashes_set__ = null;
  this.__hashes_urls__ = {};
  this.__hashes_generate__ = function()
  {
    if (
      this.__hashes_urls__.url == this.url &&
      this.__hashes_urls__.archive_url == (this.archive ? this.archive.url : undefined) &&
      this.__hashes_urls__.dat == this.dat
    ) return; // URLs didn't update - use cached hashes.

    var hashes = this.__hashes__ = [];
    var hash;
    if (hash = to_hash(this.__hashes_urls__.url = this.url))
      hashes.push(hash);
    if (hash = to_hash(this.__hashes_urls__.archive_url = (this.archive ? this.archive.url : undefined)))
      hashes.push(hash);
    if (hash = to_hash(this.__hashes_urls__.dat = this.dat))
      hashes.push(hash);

    this.__hashes_set__ = new Set(hashes);
  }
  this.hashes = function()
  {
    this.__hashes_generate__();
    return this.__hashes__;
  }
  this.hashes_set = function()
  {
    this.__hashes_generate__();
    return this.__hashes_set__;
  }

  this.is_known = function(discovered)
  {
    var hashes = this.hashes_set();

    for (var id in r.home.feed.portals) {
      var lookup = r.home.feed.portals[id];
      if (has_hash(hashes, lookup))
        return true;
    }

    if (discovered) {
      for (var id in r.home.discovered) {
        var lookup = r.home.discovered[id];
        if (has_hash(hashes, lookup))
          return true;
      }
    }

    return false;
  }
}

r.confirm("script","portal");
