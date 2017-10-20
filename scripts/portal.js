function Portal(data)
{
  this.data = data;
  if(!this.data.feed) this.data.feed = [];
  if(!this.data.port) this.data.port = [];

  this.archive = new DatArchive(this.data.dat);

  this.el = document.createElement('div'); this.el.id = "portal";

  // Profile
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

  // Activity
  this.activity_wr = document.createElement('div'); this.activity_wr.id = "activity";
  this.portals_el = document.createElement('t'); this.portals_el.className = "portals";
  this.neighbors_el = document.createElement('t'); this.neighbors_el.className = "neighbors";
  this.activity_wr.appendChild(this.portals_el);
  this.activity_wr.appendChild(this.neighbors_el);
  this.el.appendChild(this.activity_wr);

  this.port_status_el = document.createElement('t'); this.port_status_el.className = "port_status";

  this.port_list_el = document.createElement('t'); this.port_list_el.className = "port_list";
  this.el.appendChild(this.port_status_el);
  this.el.appendChild(this.port_list_el);

  this.version_el = document.createElement('div'); this.version_el.id = "version";
  this.el.appendChild(this.version_el);


  this.install = function(el)
  {
    this.data.dat = window.location.toString();
    this.data.client_version = r.client_version;
    this.version_el.textContent = "◒ "+this.data.client_version;

    el.appendChild(this.el);
    this.update();
    r.load_feed(this.data.port);
  }

  this.update = function()
  {
    this.icon_el.innerHTML = "<img src='media//content/icon.svg'/>";
    this.name_el.innerHTML = "@"+this.data.name;
    this.site_el.innerHTML = "<a href='"+this.data.site+"' target='_blank'>"+this.data.site.replace(/^(https?:|)\/\//,'')+"</a>";
    this.desc_el.innerHTML = this.data.desc;

    this.neighbors_el.innerHTML = "0<unit>Neighbors</unit>";
    this.portals_el.innerHTML = this.data.port.length+"<unit>Portals</unit>";
    this.portals_el.className = this.data.port.length > 45 ? "portals limit" : "portals";

    this.name_el.setAttribute("data-operation",this.data.name == "new_name" ? "edit:name "+this.data.name : "filter @"+this.data.name);
    this.desc_el.setAttribute("data-operation","edit:desc "+this.data.desc);
    this.site_el.setAttribute("data-operation","edit:site "+this.data.site);

    setTimeout(r.portal.update_neighbors, 1500);
    
    document.title = "@"+this.data.name;
  }

  this.update_neighbors = function()
  {
    r.portal.neighbors_el.innerHTML = r.index.collect_neighbors().size+"<unit>Neighbors</unit>";
  }

  this.add_entry = function(entry)
  {
    this.data.feed.push(entry.to_json());
    this.save();
  }

  this.save = async function()
  {
    var archive = new DatArchive(window.location.toString())

    if(this.data.feed.length > 100){
      var old = this.data.feed.splice(0,50);
      await archive.writeFile('/frozen-'+(Date.now())+'.json', JSON.stringify(old, null, 2));
    }

    await archive.writeFile('/portal.json', JSON.stringify(this.data, null, 2));
    await archive.commit();
    r.feed.update();
    this.update();
  }
}

r.confirm("script","portal");
