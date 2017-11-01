function Home()
{
  this.url = window.location.toString();

  this.setup = function()
  {
    this.portal = new Portal(this.url)
    this.portal.start().then(r.home.install).then(r.home.feed.install);
  }

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

  this.feed = new Feed();

  this.install = function()
  {
    r.el.appendChild(r.home.el);
    r.home.update();
    r.home.log("ready");
  }

  this.update = function()
  {
    this.icon_el.innerHTML = "<img src='media//content/icon.svg'/>";
    this.name_el.innerHTML = r.home.portal.json.name;
    this.site_el.innerHTML = "<a href='"+r.home.portal.json.site+"' target='_blank'>"+r.home.portal.json.site.replace(/^(https?:|)\/\//,'')+"</a>";
    this.desc_el.innerHTML = r.home.portal.json.desc;

    this.neighbors_el.innerHTML = "0<unit>Neighbors</unit>";
    this.portals_el.innerHTML = r.home.feed.portals.length+"<unit>Portals</unit>";

    this.name_el.setAttribute("data-operation",r.home.portal.json.name == "new_name" ? "edit:name "+r.home.portal.json.name : "filter @"+r.home.portal.json.name);
    this.desc_el.setAttribute("data-operation","edit:desc "+r.home.portal.json.desc);
    this.site_el.setAttribute("data-operation","edit:site "+r.home.portal.json.site);
    
    document.title = "@"+r.home.portal.json.name;
  }

  this.log = function(text)
  {
    r.home.portal.json.client_version = r.client_version;
    r.home.version_el.textContent = "◒ "+r.home.portal.json.client_version+" "+text;
  }

  this.update_neighbors = function()
  {
    r.portal.neighbors_el.innerHTML = r.index.collect_neighbors().size+"<unit>Neighbors</unit>";
  }

  this.add_entry = function(entry)
  {
    this.portal.json.feed.push(entry.to_json());
    this.save();
  }

  this.save = async function()
  {
    var archive = new DatArchive(window.location.toString())

    if(this.portal.json.feed.length > 100){
      var old = this.portal.json.feed.splice(0,50);
      await archive.writeFile('/frozen-'+(Date.now())+'.json', JSON.stringify(old, null, 2));
    }

    await archive.writeFile('/portal.json', JSON.stringify(this.portal.json, null, 2));
    await archive.commit();

    this.portal.refresh();
    this.update();
  }
}

r.confirm("script","home");