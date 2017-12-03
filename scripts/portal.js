function Portal(url)
{
  var p = this;

  this.url = url;
  this.icon = url.replace(/\/$/, "") + "/media/content/icon.svg";
  if (this.url === r.client_url || this.url === "$rotonde") {
      this.icon = r.client_url.replace(/\/$/, "") + "/media/logo.svg";
  }
  this.file = null;
  this.json = null;
  this.is_remove = false;
  this.archive = new DatArchive(this.url);
  // Resolve "masked" (f.e. hashbase) dat URLs to "hashed" (dat://0123456789abcdef/) one.
  DatArchive.resolveName(this.url).then(hash => {
    if (!hash) return;
    this.dat = "dat://"+hash+"/";
  });

  this.is_remote = false;
  this.remote_parent = null;

  this.last_entry = null;

  this.badge_element = null;
  this.badge_element_html = null;

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
    var file = await this.archive.readFile('/portal.json',{timeout: 2000}).then(console.log("done!"));

    this.json = JSON.parse(file);
    if (!this.fire("parse", this.json)) throw new Error("onparse returned false!");
    this.maintenance();
  }

  this.maintenance = function()
  {
    // Remove portals duplicate
    var checked = new Set();
    var portals = this.json.port;
    this.json.port = [];
    for(id in portals){
      var hash = to_hash(portals[id]);
      if(checked.has(hash)){ continue; }
      checked.add(hash);
      this.json.port.push("dat://"+hash+"/");
    }
  }

  this.connect = async function()
  {
    console.log('connecting to: ', p.url);

    try {
      p.file = await promiseTimeout(p.archive.readFile('/portal.json', {timeout: 2000}), 2000);
    } catch (err) {
      console.log('connection failed: ', p.url);
      r.home.feed.next();
      return;
    } // Bypass slow loading feeds

    try {
      p.json = JSON.parse(p.file);
      if (!p.fire("parse", p.json)) throw new Error("onparse returned false!");
      p.file = null;
      r.home.feed.register(p);
    } catch (err) {
      console.log('parsing failed: ', p.url);
    }

    setTimeout(r.home.feed.next, r.home.feed.connection_delay);
  }

  this.load_remotes = async function() {
    if (!p.json || !p.json.sameAs || p.json.sameAs.length === 0) {
      return;
    }

    r.home.feed.queue.push.apply(r.home.feed.queue, p.json.sameAs.map((remote_url) => {
      return {
        url: remote_url,
        oncreate: function() {
          this.is_remote = true;
          this.remote_parent = p;
          var hash = p.hashes()[0]
          this.icon = "dat://" + hash + "/media/content/icon.svg";
        },
        onparse: function(json) {
          this.json.name = `${p.json.name}=${json.name}`
          if (has_hash(r.home.portal, this.remote_parent)) {
            Array.prototype.push.apply(r.home.feed.queue, this.json.port.map((port) => {
              return {
                url: port,
                onparse: function() { return true}
              }
            }))
          }
          if (this.json && this.json.sameAs) {
            return has_hash(this.json.sameAs, p.hashes());
          }
          return false
        }
      }
    }));
    r.home.feed.connect();
  }

  this.connect_service = async function()
  {
    console.log('connecting to rotonde client service messages: ', p.url);

    try {
      p.file = await promiseTimeout(p.archive.readFile('/service.json', {timeout: 2000}), 2000);
    } catch (err) {
      console.log('connection failed: ', p.url);
      r.home.feed.next();
      return;
    } // Bypass slow loading feeds

    try {
      p.json = JSON.parse(p.file);
      if (!p.fire("parse", p.json)) throw new Error("onparse returned false!");
      p.file = null;
      r.home.feed.portal_rotonde = this;
    } catch (err) {
      console.log('parsing failed: ', p.url);
    }
  }

  this.discover = async function()
  {
    console.log('connecting to: ', p.url);

    try {
      p.file = await promiseTimeout(p.archive.readFile('/portal.json', {timeout: 1000}), 1000);
    } catch (err) {
      console.log('connection failed: ', p.url);
      r.home.discover_next();
      return;
    } // Bypass slow loading feeds

    try {
      p.json = JSON.parse(p.file);
      if (!p.fire("parse", p.json)) throw new Error("onparse returned false!");
      p.file = null;
    } catch (err) {
      console.log('parsing failed: ', p.url);
      r.home.discover_next();
      return;
    }

    r.home.discover_next(p);
  }

  this.refresh = async function()
  {
    try {
      console.log("refreshing: ",p.url)
      p.file = await promiseTimeout(p.archive.readFile('/portal.json',{timeout: 1000}), 1000);
    } catch (err) {
      console.log("connection failed: ",p.url)
      return;
    }

    for(id in r.home.feed.portals){
      if(r.home.feed.portals[id].url == p.url){
        r.home.feed.portals[id] = p;
      }
    }

    try {
      var oldName = p.json.name;
      p.json = JSON.parse(p.file);
      // don't replace name for remotes
      if (p.is_remote) {
        p.json.name = oldName;
      }
      p.file = null;
    } catch (err) {
      console.log('parsing failed: ', p.url);
    }
    p.__entries_cache__ = null;
  }

  // Cache entries when possible.
  this.__entries_map__ = {};
  this.__entries_cache__;

  this.entries = function()
  {
    if (this.__entries_cache__)
      return this.__entries_cache__;
    var e = this.__entries_cache__ = [];

    var entry;
    for (var id in this.json.feed) {
      var raw = this.json.feed[id];
      entry = this.__entries_map__[raw.timestamp];
      if (entry == null)
        this.__entries_map__[raw.timestamp] = entry = new Entry(this.json.feed[id], p);
      else
        entry.update(this.json.feed[id], p);
      entry.id = id;
      entry.is_mention = entry.detect_mention();
      e[id] = entry;
    }

    this.last_entry = entry;
    return e;
  }

  this.entries_remove = function() {
    var entries = this.entries();
    for (var id in entries) {
      entries[id].remove_element();
    }
  }

  this.relationship = function(target = r.home.portal.hashes_set())
  {
    if (this.url === r.client_url) return create_rune("portal", "rotonde");
    if (has_hash(this, target)) return create_rune("portal", "self");
    if (has_hash(this.json.port, target)) return create_rune("portal", "both");

    return create_rune("portal", "follow");
  }

  this.updated = function(include_edits = true)
  {
    if(this.json == null || this.json.feed == null){ return 0; }
    if(this.json.feed.length < 1){ return 0; }

    var max = 0;
    for (var id in this.json.feed) {
      var entry = this.json.feed[id];
      var timestamp = (include_edits ? entry.editstamp : null) || entry.timestamp;
      if (timestamp < max)
          continue;
        max = timestamp;
    }

    return max;
  }

  this.time_offset = function() // days
  {
    return parseInt((Date.now() - this.updated())/1000);
  }

  this.badge_add = function(special_class, container, c, cmin, cmax, offset)
  {
    if (c !== undefined && (c < 0 || c < cmin || cmax <= c)) {
      // Out of bounds - remove if existing, don't add.
      this.badge_remove();
      return null;
    }

    var html = this.badge(special_class);
    if (this.badge_element_html != html) {
      if (this.badge_element == null) {
        // Thin wrapper required.
        this.badge_element = document.createElement('div');
        this.badge_element.className = 'thin-wrapper';
      }
      this.badge_element.innerHTML = html;
      this.badge_element_html = html;
      container.appendChild(this.badge_element);
    }

    // If c !== undefined, the badge is being added to an ordered collection.
    if (c !== undefined)
      move_element(this.badge_element, c - cmin + offset);

    return this.badge_element;
  }

  this.badge_remove = function() {
    if (this.badge_element == null)
      return;
    // Simpler alternative than elem.parentElement.remove(elem);
    this.badge_element.remove();
    this.badge_element = null;
    this.badge_element_html = null;
  }

  this.badge = function(special_class)
  {
    // Avoid 'null' class.
    special_class = special_class || '';

    var html = "";

    html += "<img src='"+this.archive.url+"/media/content/icon.svg'/>";
    html += "<a data-operation='"+this.url+"' href='"+this.url+"'>"+this.relationship()+escape_html(this.json.name)+"</a> ";

    html += "<br />"

    var updated = this.updated(false)
    if(updated){
      html += "<span class='time_ago'>"+timeSince(updated)+" ago</span>"
    }

    html += "<br />"
    // Version
    if(this.json.client_version){
      // Used to check if the rotonde version matches when mod version is present.
      var version_regex = /^[0-9.]+[a-z]?/;
      var version_self = this.json.client_version.match(version_regex);
      var version_portal = r.home.portal.json.client_version.match(version_regex);
      var version_match =
        // Don't compare if either string doesn't contain a match.
        version_self &&
        version_portal &&
        version_self[0] == version_portal[0];
      // The version to display.
      var version = escape_html(this.json.client_version)
        .split(/\r\n|\n/).slice(0, 2).join("<br>"); // Allow 2 lines for mod versions
      html += "<span class='version "+(version_match ? 'same' : '')+"'>"+version+"</span>"
    }

    html += "<span>"+this.json.port.length+" Portals</span>"

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
