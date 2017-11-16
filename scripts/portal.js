function Portal(url)
{
  var p = this;

  this.url = url;
  this.file = null;
  this.json = null;
  this.archive = new DatArchive(this.url);
  // Resolve "masked" (f.e. hashbase) dat URLs to "hashed" (dat://0123456789abcdef/) one.
  DatArchive.resolveName(this.url).then(hash => {
    if (!hash) return;
    this.dat = "dat://"+hash+"/";
  });

  this.last_entry = null;

  this.badge_element = null;
  this.badge_element_html = null;

  // Cache entries when possible.
  this.cache_entries = {};

  this.expanded = [];

  this.start = async function()
  {
    var file = await this.archive.readFile('/portal.json',{timeout: 2000}).then(console.log("done!"));

    this.json = JSON.parse(file);
    this.maintenance();
  }

  this.maintenance = function()
  {
    // Remove portals duplicate
    var checked = [];
    var portals = this.json.port;
    this.json.port = [];
    for(id in portals){
      var hash = to_hash(portals[id]);
      if(has_hash(checked, hash)){ continue; }
      checked.push(hash);
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
      r.home.feed.register(p);
    } catch (err) {
      console.log('parsing failed: ', p.url);
    }

    setTimeout(r.home.feed.next, 750);
  }

  this.discover = async function()
  {
    console.log('connecting to: ', p.url);

    try {
      p.file = await promiseTimeout(p.archive.readFile('/portal.json', {timeout: 2000}), 2000);
    } catch (err) {
      console.log('connection failed: ', p.url);
      r.home.discover_next();
      return;
    } // Bypass slow loading feeds
    
    try {
      p.json = JSON.parse(p.file);
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

    p.json = JSON.parse(p.file)
  }

  this.entries = function()
  {
    var e = [];
    for (var id in this.json.feed) {
      var raw = this.json.feed[id];
      var entry = this.cache_entries[raw.timestamp];
      if (entry == null)
        this.cache_entries[raw.timestamp] = entry = new Entry(this.json.feed[id], p);
      else
        entry.update(this.json.feed[id], p);
      entry.id = id;
      entry.is_mention = entry.detect_mention();
      entry.expanded = this.expanded.indexOf(id+"") > -1;
      e.push(entry);
    }
    this.last_entry = e[p.json.feed.length - 1];
    return e;
  }

  this.entries_remove = function() {
    var entries = this.entries();
    for (var id in entries) {
      entries[id].remove_element();
    }
  }

  this.relationship = function(target = r.home.portal.hashes())
  {
    if (has_hash(this, target)) return create_rune("portal", "self");
    if (has_hash(this.json.port, target)) return create_rune("portal", "both");

    return create_rune("portal", "follow");
  }

  this.updated = function()
  {
    if(this.json == null || this.json.feed == null){ return 0; }
    if(this.json.feed.length < 1){ return 0; }

    var max = 0;
    for (var id in this.json.feed) {
      var entry = this.json.feed[id];
      var timestamp = entry.editstamp || entry.timestamp;
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

  this.badge_add = function(special_class, container, c, cmin, cmax)
  {
    if (c !== undefined && (c < cmin || cmax <= c)) {
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
    if (c !== undefined) {
      // Always append as last.
      container.appendChild(this.badge_element);
    }
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
    html += "<a data-operation='"+this.url+"' href='"+this.url+"'>"+this.relationship()+r.escape_html(this.json.name)+"</a> ";

    html += "<br />"
    
    if(this.last_entry){
      html +=  "<span class='time_ago'>"+this.last_entry.time_ago()+" ago</span>" 
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
      var version = r.escape_html(this.json.client_version)
        .split(/\r\n|\n/).slice(0, 2).join("<br>"); // Allow 2 lines for mod versions
      html += "<span class='version "+(version_match ? 'same' : '')+"'>"+version+"</span>"
    }
    
    html += "<span>"+this.json.port.length+" Portals</span>"

    return "<yu class='badge "+special_class+"' data-operation='"+(special_class === "discovery"?"":"un")+this.url+"'>"+html+"</yu>";
  }

  this.hashes = function()
  {
    var hashes = [];
    hashes.push(to_hash(this.url));
    hashes.push(to_hash(this.archive.url));
    hashes.push(to_hash(this.dat));
    // Remove falsy entries.
    for (var i = 0; i < hashes.length; i++) {
      if (!hashes[i]) {
        hashes.splice(i, 1);
        i--;
      }
    }
    return hashes;
  }

  this.is_known = function(discovered)
  {
    var hashes = this.hashes();
    var portals = [].concat(r.home.feed.portals);
    if (discovered)
      portals = portals.concat(r.home.discovered);

    for (id in portals) {
      var lookup = portals[id];
      if (has_hash(hashes, lookup))
        return true;
    }

    return false;
  }
}

function promiseTimeout(promise, timeout) {
  return new Promise((resolve, reject) => {
    var rejectout = setTimeout(() => reject(new Error("Promise hanging, timeout!")), timeout);
    promise.then(
      function() {
        clearTimeout(rejectout);        
        resolve.apply(this, arguments);
      },
      function() {
        clearTimeout(rejectout);        
        reject.apply(this, arguments);
      }
    );
  });
}

r.confirm("script","portal");
