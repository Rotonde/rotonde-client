function Portal(url)
{
  var p = this;

  this.url = url;
  this.hash = to_hash(url);
  this.file = null;
  this.json = null;
  this.archive = new DatArchive(this.url);

  this.last_entry = null;

  this.start = async function()
  {
    var file = await this.archive.readFile('/portal.json',{timeout: 2000}).then(console.log("done!"));

    this.json = JSON.parse(file);
    this.maintenance();
  }

  this.maintenance = function()
  {
    // Remove portals duplicate
    var portals = [];
    for(id in this.json.port){
      var url = this.json.port[id].replace("dat://","").replace("/","").trim();
      if(url.length != 64 || portals.indexOf(url) > -1){ continue; }
      portals.push("dat://"+url+"/")
    }
    this.json.port = portals;
  }

  this.connect = async function()
  {
    console.log("connecting to: ",p.url);

    try {
      p.file = await p.archive.readFile('/portal.json',{timeout: 2000});
    } catch (err) {
      console.log("connection failed: ",p.url)
      r.home.feed.next();
      return;
    } // Bypass slow loading feeds

    p.json = JSON.parse(p.file)
    r.home.feed.register(p)
    setTimeout(r.home.feed.next, 250);
  }

  this.discover = async function()
  {
    console.log("connecting to: ",p.url);

    try {
      p.file = await p.archive.readFile('/portal.json',{timeout: 2000});
    } catch (err) {
      console.log("connection failed: ",p.url)
      return;
    } // Bypass slow loading feeds

    p.json = JSON.parse(p.file)
    r.home.discover_next(p);
  }

  this.refresh = async function()
  {
    try {
      console.log("refreshing: ",p.url)
      p.file = await p.archive.readFile('/portal.json',{timeout: 1000});
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
    for(id in this.json.feed){
      var entry = new Entry(this.json.feed[id],p);
      entry.id = id;
      entry.is_mention = entry.detect_mention();
      e.push(entry);
    }
    this.last_entry = e[p.json.feed.length-1];
    return e;
  }

  this.relationship = function(target = r.home.url)
  {
    target = target.replace("dat://","").replace("/","").trim();

    for(id in this.json.port){
      var hash = this.json.port[id];
      if(hash.indexOf(target) > -1){
        return "@";
      }
    }
    return "~";
  }

  this.updated = function()
  {
    if(this.json.feed.length < 1){ return 0; }

    return p.json.feed[p.json.feed.length-1].timestamp;
  }

  this.time_offset = function() // days
  {
    return parseInt((Date.now() - this.updated())/1000);
  }

  this.badge = function(special_class)
  {
    var html = "";

    html += "<img src='"+this.archive.url+"/media/content/icon.svg'/>";
    html += "<a data-operation='"+this.url+"' href='"+this.url+"'>"+this.relationship()+this.json.name+"</a> ";

    html += "<br />"
    
    if(this.last_entry){
      html +=  "<span class='time_ago'>"+this.last_entry.time_ago()+" ago</span>" 
    }
    
    html += "<br />"
    // Version
    if(this.json.client_version){
      // Used to check if the rotonde version matches when multiple version lines are present.
      var client_version_main = this.json.client_version.split(/\r\n|\n/)[0];
      // Based off of entry.formatter
      this.json.client_version = this.json.client_version
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .split(/\r\n|\n/).slice(0, 2).join("<br>") // Allow 2 lines for mod versions
      html += "<span class='version "+(client_version_main == r.home.portal.json.client_version ? 'same' : '')+"'>"+this.json.client_version+"</span>"
    }
    
    html += "<span>"+this.json.port.length+" Portals</span>"

    return "<yu class='badge "+special_class+"' data-operation='un"+this.url+"'>"+html+"</yu>";
  }

  this.is_known = function()
  {
    var archive_hash = this.archive.url.replace("dat://","").replace("/","").trim();
    var portal_hash = this.url.replace("dat://","").replace("/","").trim();

    for(id in r.home.feed.portals){
      var lookup = r.home.feed.portals[id];
      var lookup_archive_hash = lookup.archive.url.replace("dat://","").replace("/","").trim();
      var lookup_portal_hash = lookup.url.replace("dat://","").replace("/","").trim();

      if(lookup_archive_hash === portal_hash){ return true; }
      if(lookup_portal_hash === portal_hash){ return true; }
      if(lookup_archive_hash === archive_hash){ return true; }
      if(lookup_portal_hash === archive_hash){ return true; }
    }
    return false;
  }
}

r.confirm("script","portal");
