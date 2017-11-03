function Portal(url)
{
  var p = this;

  this.url = url;
  this.file = null;
  this.json = null;
  this.archive = new DatArchive(this.url);

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

  this.last_entry = function()
  {
    return this.entries()[p.json.feed.length-1];
  }

  this.entries = function()
  {
    var e = [];
    for(id in this.json.feed){
      var entry = new Entry(this.json.feed[id],p);
      entry.id = id;
      e.push(entry);
    }
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
    return (Date.now() - this.updated())/1000;
  }

  this.badge = function()
  {
    var html = "";

    return "<yu class='badge'><img src='"+this.archive.url+"/media/content/icon.svg'/><a data-operation='"+this.url+"'>"+this.relationship()+this.json.name+"</a><br />"+this.last_entry().time_ago()+" ago</yu>";
  }

  this.is_known = function()
  {
    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      if(portal.archive.url === this.archive.url){
        return true;
      }
    }
    return false;
  }
}

r.confirm("script","portal");
