function Index()
{
  this.portals = {};
  this.fetching_portals = {};

  this.listeners = [];

  this.portal_file_name = 'portal.json';

  this.lookup_url = function(url)
  {
    var portal = this.portals[url];
    if(typeof portal === 'undefined'){
      if(!this.fetching_portals[url]){
        this.fetching_portals[url] = true;
        this.fetch_url(url);
      }
      return null;
    }
    return portal;
  }

  this.lookup_name = function(name)
  {
    // We return an array since multiple people might be using the same name.
    var results = [];
    for(var url in this.portals){
      var portal = this.portals[url];
      if(portal.name === name){ results.push(portal); }
    }
    return results;
  }

  this.autocomplete_name = function(name)
  {
    var results = [];
    name = name.replace("@","").replace("@","").trim();
    for(var url in this.portals){
      var portal = this.portals[url];
      if(portal.name && portal.name.substr(0,name.length) == name){
        results.push(portal);
      }
    }
    return results;
  }

  this.fetch_url = async function(url)
  {
    var resolved = url;
    // Normalize dat:// URLs to their public key.
    if(url.slice(0,6) === 'dat://'){
      try{
        resolved = 'dat://' + await DatArchive.resolveName(url) + '/';
      }catch(e){
        console.error("Couldn't resolve dat:// URL.", e);
      }
    }
    var archive = new DatArchive(resolved);
    var activity = archive.createFileActivityStream(this.portal_file_name);
    this.read_portal_json(url, resolved, archive);
    activity.addEventListener('changed', e => {
      this.read_portal_json(url, resolved, archive);
    });
  }

  this.make_portal = function(data, url, archive)
  {
    return Object.assign({}, data, {
      port: data.port.map(entry => {
        // Normalize dat:// entries to include a trailing slash.
        if(entry.slice(0,6) === 'dat://' && entry.slice(-1) !== '/') {
          entry += '/';
        }
        return entry;
      }),
      url: url,
      archive: archive
    });
  }

  this.read_portal_json = async function(key, url, archive)
  {
    try{
      var portal_data = await archive.readFile(this.portal_file_name);
      if(is_json(portal_data)){
        var portal = JSON.parse(portal_data);  
        delete this.fetching_portals[key];
        this.portals[key] = this.make_portal(portal, url, archive);
        this.notify_change(key);
      }
      else{
        console.log("Malformed JSON")
      }
    }catch(e){
      console.error("Error reading remote portal.json", e);
    }
  }

  this.notify_change = function(key)
  {
    for(var id in this.listeners){ this.listeners[id].portal_changed(key); }
  }

  function is_json(text)
  {
    try{
      JSON.parse(text);
      return true;
    }
    catch (error){
      return false;
    }
  }
}

r.confirm("script","index");
