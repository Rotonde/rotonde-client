function Portal(url)
{
  var p = this;

  this.url = url;

  this.name = "";
  this.desc = "";
  this.icon = url.replace(/\/$/, "") + "/media/content/icon.svg";
  this.sameas = [];
  this.follows = [];
  this.discoverable = null;

  this.record_url = null;

  if (this.url === r.client_url || this.url === "$rotonde") {
    this.icon = r.client_url.replace(/\/$/, "") + "/media/logo.svg";
  }

  this.archive = new DatArchive(this.url);
  // Resolve "masked" (f.e. hashbase) dat URLs to "hashed" (dat://0123456789abcdef/) one.
  DatArchive.resolveName(this.url).then(hash => {
    if (!hash) return;
    this.dat = "dat://"+hash+"/";
  });


  // Cached data.
  this._ = {};
  this.invalidate = function()
  {
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
    await r.db.indexArchive(p.archive);
    this.maintenance();
  }

  this.get = async function()
  {
    var record = this._.record;
    if (!record) {
      record = this._.record = await r.db.portals.get(":origin", p.archive.url);
      if (!record)
        throw new Error("Portal not found: " + p.archive.url);
      this.record_url = record.getRecordURL();

      // Values for contexts unable to await get()
      p.name = record.name.replace(/ /g, "_");
      p.desc = record.bio;
      if (record.avatar) {
        p.icon = p.archive.url + "/" + record.avatar;
      } else {
        p.icon = p.archive.url + "/media/content/icon.svg"
      }
      p.sameas = record.sameas;
      p.follows = record.follows;
      p.discoverable = record.discoverable;
      p.rotonde_version = record.rotonde_version;

      var last_timestamp = 0;
      var now = Date.now();

      var last = await r.db.feed.where(":origin+createdAt")
        .between([p.archive.url, 0], [p.archive.url, now])
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

  this.connect = async function()
  {
    console.log('connecting to: ', p.url);
    
    var record;
    try {
      if (r.db.isSource(p.archive.url))
        await r.db.unindexArchive(p.archive.url);
      await r.db.indexArchive(p.archive);
      record = await p.get();
    } catch (err) {
      console.log('connection failed: ', p.url, err);
      r.home.feed.next();
      return;
    }

    setTimeout(r.home.feed.next, r.home.feed.connection_delay);      
    await r.home.feed.register(p);
  }

  this.load_remotes = async function() {
    var record_me = await p.get();
    if (!record_me.sameas || record_me.sameas.length === 0) {
      return;
    }

    var remotes = record_me.sameas.map((remote_url) => {
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
          if (this.sameas) {
            return has_hash(this.sameas, p.hashes());
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

  this.discover = async function()
  {
    this.is_discovered = true;

    // console.log('connecting to: ', p.url);

    var record;
    try {
      if (!r.db.isSource(p.archive.url))
        await r.db.indexArchive(p.archive, { watch: false });
      record = await p.get();
    } catch (err) {
      // console.log('connection failed: ', p.url, err);
      r.home.discover_next();
      return;
    }

    setTimeout(r.home.feed.next, r.home.feed.connection_delay);      

    r.home.discover_next(p);
  }

  // Cache entries when possible.

  this.entries = async function()
  {
    if (this._.entries)
      return this._.entries;
    
    var added = new Set();
    var entries = this._.entries = [];
    var entries_map = this._.entries_map = {};

    var feed = (await this.get()).feed || [];
    feed = feed.concat(await r.db.feed.where(":origin").equals(p.archive.url).toArray());    
    
    var entry;
    for (var id in feed) {
      var raw = feed[id];
      var timestamp = raw.createdAt || raw.timestamp;
      if (added.has(timestamp)) continue;
      entry = entries_map[timestamp];
      if (!entry)
        entries_map[timestamp] = entry = new Entry(raw, p);
      else
        entry.update(raw, p);
      entry.is_mention = entry.detect_mention();
      added.add(timestamp);
      entries.push(entry);
      entries_map[entry.id] = entry;
    }

    return entries;
  }
  this.entry = async function(id)
  {
    var entries = this.entries();
    return this._.entries_map[id];
  }

  this.relationship = function(target = r.home.portal.hashes_set())
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

  this.badge = async function(special_class)
  {
    var record = await this.get();
    var record_me = await r.home.portal.get();
    // Avoid 'null' class.
    special_class = special_class || '';

    var html = "";

    html += "<img src='"+this.archive.url+"/media/content/icon.svg'/>";
    html += "<a data-operation='"+this.url+"' href='"+this.url+"'>"+this.relationship()+escape_html(this.name)+"</a> ";

    html += "<br />"

    var updated = this.last_timestamp
    if(updated){
      html += "<span class='time_ago'>"+timeSince(updated)+" ago</span>"
    }

    html += "<br />"
    // Version
    if(record.rotonde_version){
      // Used to check if the rotonde version matches when mod version is present.
      var version_regex = /^[0-9.]+[a-z]?/;
      var version_self = record_me.rotonde_version.match(version_regex);
      var version_portal = record.rotonde_version.match(version_regex);
      var version_match =
        // Don't compare if either string doesn't contain a match.
        version_self &&
        version_portal &&
        version_self[0] == version_portal[0];
      // The version to display.
      var version = escape_html(record.rotonde_version)
        .split(/\r\n|\n/).slice(0, 2).join("<br>"); // Allow 2 lines for mod versions
      html += "<span class='version "+(version_match ? 'same' : '')+"'>"+version+"</span>"
    }

    html += "<span>"+record.follows.length+" Portals</span>"

    return "<yu class='badge "+special_class+"' data-operation='"+(special_class === "discovery"?"":"un")+this.url+"'>"+html+"</yu>";
  }

  this.__hashes__ = null;
  this.__hashes_set__ = null;
  this.__hashes_urls__ = {};
  this.__hashes_generate__ = function()
  {
    if (
      this.__hashes_urls__.url == this.url &&
      this.__hashes_urls__.archive_url == this.archive.url &&
      this.__hashes_urls__.dat == this.dat
    ) return; // URLs didn't update - use cached hashes.

    var hashes = this.__hashes__ = [];
    var hash;
    if (hash = to_hash(this.__hashes_urls__.url = this.url))
      hashes.push(hash);
    if (hash = to_hash(this.__hashes_urls__.archive_url = this.archive.url))
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
