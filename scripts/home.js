function Home()
{
  this.url = window.location.origin.toString();
  this.network = [];

  this.setup = function()
  {
    this.portal = new Portal(this.url)
    this.portal.start().then(r.home.install).then(r.home.feed.install);
  }

  this.el = document.createElement('div'); this.el.id = "portal";

  // Profile
  this.logo_el = document.createElement('img'); this.logo_el.id = "logo";
  this.logo_el.src = "dat://2714774d6c464dd12d5f8533e28ffafd79eec23ab20990b5ac14de940680a6fe/media/logo.svg";
  this.profile_wr = document.createElement('div'); this.profile_wr.id = "profile";
  this.icon_el = document.createElement('div'); this.icon_el.className = "icon";
  this.name_el = document.createElement('t'); this.name_el.className = "name";
  this.desc_el = document.createElement('t'); this.desc_el.className = "desc";
  this.site_el = document.createElement('t'); this.site_el.className = "site";
  this.profile_wr.appendChild(this.icon_el);
  this.profile_wr.appendChild(this.name_el);
  this.profile_wr.appendChild(this.desc_el);
  this.profile_wr.appendChild(this.site_el);
  this.el.appendChild(this.profile_wr);
  this.el.appendChild(this.logo_el);

  this.port_status_el = document.createElement('t'); this.port_status_el.className = "port_status";

  this.port_list_el = document.createElement('t'); this.port_list_el.className = "port_list";
  this.el.appendChild(this.port_status_el);
  this.el.appendChild(this.port_list_el);

  this.version_el = document.createElement('div'); this.version_el.id = "version";
  this.el.appendChild(this.version_el);

  this.feed = new Feed();

  this.install = function()
  {
    r.el.appendChild(r.home.el);
    r.home.update();
    r.home.log("ready");

    r.home.portal.json.client_version = r.client_version;
    r.home.version_el.innerHTML = "<a href='https://github.com/Rotonde/rotonde-client' target='_blank'>"+r.home.portal.json.client_version+"</a>";

    setInterval(r.home.discover, 4000);
  }

  this.update = function()
  {
    this.icon_el.innerHTML = "<img src='media//content/icon.svg'/>";
    this.name_el.innerHTML = r.home.portal.json.name;
    this.site_el.innerHTML = "<a href='"+r.home.portal.json.site+"' target='_blank'>"+r.home.portal.json.site.replace(/^(https?:|)\/\//,'')+"</a>";
    this.desc_el.innerHTML = r.home.portal.json.desc;

    this.name_el.setAttribute("data-operation",r.home.portal.json.name == "new_name" ? "edit:name "+r.home.portal.json.name : "filter @"+r.home.portal.json.name);
    this.desc_el.setAttribute("data-operation","edit:desc "+r.home.portal.json.desc);
    this.site_el.setAttribute("data-operation","edit:site "+r.home.portal.json.site);
    
    document.title = "@"+r.home.portal.json.name;
    this.network = r.home.collect_network();

    // Portal List
    var html = "";
    for(id in this.feed.portals){
      var portal = this.feed.portals[id];
      html += portal.badge();
    }
    r.home.feed.wr_portals_el.innerHTML = html;
  }

  this.log = function(text)
  {
    r.operator.input_el.setAttribute("placeholder",text);
  }

  this.collect_network = function()
  {
    var collection = [];

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      for(i in portal.json.port){
        var p = portal.json.port[i];
        if(collection.indexOf(p) > -1){ continue; }
        collection.push(p)
      }
    }
    return collection;
  }

  this.add_entry = function(entry)
  {
    this.portal.json.feed.push(entry.to_json());
    this.save();
  }

  this.save = async function()
  {
    var archive = r.home.portal.archive;

    if(this.portal.json.feed.length > 100){
      var old = this.portal.json.feed.splice(0,50);
      await archive.writeFile('/frozen-'+(Date.now())+'.json', JSON.stringify(old, null, 2));
    }

    await archive.writeFile('/portal.json', JSON.stringify(this.portal.json, null, 2));
    await archive.commit();

    this.portal.refresh("saved");
    this.update();
  }

  this.discover = async function()
  {
    if(r.home.feed.queue.length > 0){ return; }

    r.home.log("Discovering network of "+r.home.network.length+" portals.. ");

    var rand = parseInt(Math.random() * r.home.network.length);
    var portal = new Portal(r.home.network[rand]);

    portal.discover();
  }

  this.discovery = null;

  this.discover_next = function(portal)
  {
    if(r.home.discovery){
      if(r.home.discovery.url == portal.url){
        return;
      }
      if(r.home.portal.url == portal.url){
        return;
      }
      if(portal.updated() < r.home.discovery.updated()){
        return;
      }
      if(portal.is_known()){
        return;
      }
      if(portal.time_offset()/86400 > 1.5){
        return;
      }
      if(!portal.last_entry){
        return;
      }
    }
    if(portal.json.feed.length < 1){ return; }

    r.home.feed.wr_portals_el.innerHTML += portal.badge("discovery");

    r.home.discovery = portal;
    r.home.feed.refresh("discovery");
  }
}

r.confirm("script","home");
