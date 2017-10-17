function Portal(data)
{
  this.data = data;

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
  this.entries_el = document.createElement('t'); this.entries_el.className = "entries";
  this.portals_el = document.createElement('t'); this.portals_el.className = "portals";
  this.activity_wr.appendChild(this.entries_el);
  this.activity_wr.appendChild(this.portals_el);
  this.el.appendChild(this.activity_wr);

  this.port_status_el = document.createElement('t'); this.port_status_el.className = "port_status";
  
  this.port_list_el = document.createElement('t'); this.port_list_el.className = "port_list";
  this.el.appendChild(this.port_status_el);
  this.el.appendChild(this.port_list_el);

  this.install = function(el)
  {
    this.data.dat = window.location.toString();
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

    this.entries_el.innerHTML = this.data.feed.length + " <unit>" + (this.data.feed.length == 1 ? "Entry" : "Entries")+"</unit>";
    this.portals_el.innerHTML = this.data.port.length+"<unit>Portals</unit>";
    this.portals_el.className = this.data.port.length > 45 ? "portals limit" : "portals";

    this.name_el.setAttribute("data-operation",this.data.name == "new_name" ? "edit:name "+this.data.name : "filter @"+this.data.name);
    this.desc_el.setAttribute("data-operation","edit:desc "+this.data.desc);
    this.site_el.setAttribute("data-operation","edit:site "+this.data.site);

    document.title = "@"+this.data.name;
  }

  this.add_entry = function(entry)
  {
    this.data.feed.push(entry.to_json());
    this.save();
  }

  this.save = async function()
  {
    var archive = new DatArchive(window.location.toString())
    await archive.writeFile('/portal.json', JSON.stringify(this.data, null, 2));
    await archive.commit();
    r.feed.update();
    this.update();
  }
}

r.confirm("script","portal");