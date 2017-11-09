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
  this.version_el = document.createElement('t'); this.version_el.className = "version";
  this.profile_wr.appendChild(this.icon_el);
  this.profile_wr.appendChild(this.name_el);
  this.profile_wr.appendChild(this.desc_el);
  this.profile_wr.appendChild(this.site_el);
  this.el.appendChild(this.profile_wr);
  this.el.appendChild(this.logo_el);
  this.el.appendChild(this.version_el);

  this.port_status_el = document.createElement('t'); this.port_status_el.className = "port_status";

  this.port_list_el = document.createElement('t'); this.port_list_el.className = "port_list";
  this.el.appendChild(this.port_status_el);
  this.el.appendChild(this.port_list_el);

  this.feed = new Feed();

  this.discovered = [];
  this.discovered_count = 0;
  this.discovered_hashes = [];
  this.discovery_page = 0;
  this.discovery_page_size = 16;
  this.discovering = -1;

  this.install = function()
  {
    r.el.appendChild(r.home.el);
    r.home.update();
    r.home.log("ready");

    r.home.portal.json.client_version = r.client_version;
    r.home.logo_el.title = r.home.portal.json.client_version;
    r.home.version_el.textContent = r.home.portal.json.client_version;

    setInterval(r.home.discover, 4000);
  }

  this.update = function()
  {
    this.icon_el.innerHTML = "<img src='media/content/icon.svg'/>";
    this.name_el.innerHTML = r.escape_html(r.home.portal.json.name);
    this.site_el.innerHTML = "<a href='"+r.escape_attr(r.home.portal.json.site)+"' target='_blank'>"+r.escape_html(r.home.portal.json.site).replace(/^(https?:|)\/\//,'')+"</a>";
    this.desc_el.innerHTML = r.escape_html(r.home.portal.json.desc);

    this.name_el.setAttribute("data-operation",r.home.portal.json.name == "new_name" ? "edit:name "+r.home.portal.json.name : "filter @"+r.home.portal.json.name);
    this.desc_el.setAttribute("data-operation","edit:desc "+r.home.portal.json.desc);
    this.site_el.setAttribute("data-operation","edit:site "+r.home.portal.json.site);
    
    document.title = "@"+r.home.portal.json.name;
    this.network = r.home.collect_network();

    // Portal List
    for (id in this.feed.portals) {
      var portal = this.feed.portals[id];
      portal.badge_add(null, r.home.feed.wr_portals_el);
    }

    // Discovery List
    var sorted_discovered = r.home.discovered.sort(function(a, b) {
      return a.updated() < b.updated() ? 1 : -1;
    });

    var discovery = r.home.feed.wr_discovery_el;

    this.discovery_page = r.home.feed.page;
    var cmin = (this.discovery_page == 0 ? 0 : 1) + this.discovery_page * (this.discovery_page_size - (this.discovery_page <= 0 ? 1 : 2));
    var cmax = cmin + this.discovery_page_size - (this.discovery_page <= 0 ? 1 : 2);
    this.discovered_count = 0;

    if (this.discovery_page > 0) {
      // Create page_prev_el if missing.
      if (!this.discovery_page_prev_el) {
        this.discovery_page_prev_el = document.createElement('div');
        this.discovery_page_prev_el.className = 'badge paginator page-prev';
        this.discovery_page_prev_el.setAttribute('data-operation', 'page:--');
        this.discovery_page_prev_el.setAttribute('data-validate', 'true');
        this.discovery_page_prev_el.innerHTML = "<a class='message' dir='auto'>&lt</a>";
        discovery.appendChild(this.discovery_page_prev_el);
      }
    } else {
      // Remove page_prev_el.
      if (this.discovery_page_prev_el) {
        discovery.removeChild(this.discovery_page_prev_el);
        this.discovery_page_prev_el = null;
      }
    }

    for (var id in sorted_discovered) {
      var portal = sorted_discovered[id];

      var c = this.discovered_count;

      // Hide portals that turn out to be known after discovery (f.e. added afterwards).
      if (portal.is_known()) {
        c = -1;
      } else {
        this.discovered_count++;
      }

      // TODO: Allow custom discovery time filter.
      // if (portal.time_offset() / 86400 > 3)
          // c = -2;

      portal.badge_add('discovery', discovery, c, cmin, cmax);
    }

    if (this.discovered_count >= cmax) {
      // Create page_next_el if missing.
      if (!this.discovery_page_next_el) {
        this.discovery_page_next_el = document.createElement('div');
        this.discovery_page_next_el.className = 'badge paginator page-next';
        this.discovery_page_next_el.setAttribute('data-operation', 'page:++');
        this.discovery_page_next_el.setAttribute('data-validate', 'true');
        this.discovery_page_next_el.innerHTML = "<a class='message' dir='auto'>&gt</a>";
      }
      // Always append as last.
      discovery.appendChild(this.discovery_page_next_el);
    } else {
      // Remove page_next_el.
      if (this.discovery_page_next_el) {
        discovery.removeChild(this.discovery_page_next_el);
        this.discovery_page_next_el = null;
      }
    }

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
    r.home.feed.refresh("saved");
  }

  this.discover = async function()
  {
    // Discovery supports discovering while the feed is loading.
    // if (r.home.feed.queue.length > 0)
      // return;

    // Uncomment as soon as race conditions arise:
    // If already discovering, let the running discovery finish first.
    // This is running intervalled anyway.
    if (r.home.discovering > -1) {
      // return;
    }

    r.home.log(`Discovering network of ${r.home.network.length} portals...`);
    r.home.discover_next_step();
  }

  this.discover_next = function(portal)
  {
    setTimeout(r.home.discover_next_step, 250);
    
    if (!portal) {
      return;
    }

    r.home.discovered_hashes = r.home.discovered_hashes.concat(portal.hashes());
    
    if (portal.is_known(true)) {
      return;
    }
    
    r.home.discovered.push(portal);
    r.home.update();
    r.home.feed.refresh("discovery");
  }
  
  this.discover_next_step = function()
  {
    var url;
    while (r.home.discovering < r.home.network.length - 1 &&
           has_hash(r.home.discovered_hashes,
             (url = r.home.network[++r.home.discovering])
             .replace("dat://","").replace("/","").trim()
           )) { }

    if (r.home.discovering >= r.home.network.length) {
      r.home.discovering = -1;
      return;
    }
        
    try {
      var portal = new Portal(url);
      portal.discover();
    } catch (err) {
      // Hopefully we can catch the beaker crash...
    }
  }
}

r.confirm("script","home");