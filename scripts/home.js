//@ts-check
class Home {
  constructor() {
    this.url = localStorage.getItem("profile_archive") || window.location.origin;
    this.network = [];
    this._networkCache = null;
  
    this._displayLog = true;
    this._displayLogPrev = true;
    
    this.el = rd$`<div id="portal"></div>`;
    r.root.appendChild(this.el);

    /** @type {Portal} */
    this.portal = null;
    this.feed = new Feed();
  }

  async start() {
    this.log("Initializing");

    // Connect to our own portal on start.
    this.portal = new Portal(this.url);
    this.portal.archive = await r.db.indexArchive(this.url);
    await this.portal.maintenance();
    await this.feed.register(this.portal);
    
    let archive = await r.home.portal.archive.getInfo();
    r.isOwner = archive.isOwner;

    await this.feed.start();

    this.log("Ready");
  }

  async selectArchive() {
    let archive = await DatArchive.selectArchive({
      title: "Select Profile",
      buttonLabel: "Login"
    });
    if (!archive)
      return;
      
    if (hasHash(
      [ window.location.origin.toString(), await DatArchive.resolveName(window.location.origin.toString()) ],
      archive.url
    )) {
      // Returning to our main profile.
      localStorage.removeItem("profile_archive");
    } else {
      // Switching to another profile.
      localStorage.setItem("profile_archive", archive.url);
    }
    // For now, the safest way to reset everything is to just reload the page.
    window.location.reload();
  }

  log(text, life) {
    if (this._displayLog) {
      if (life) {
        this._displayLog = false;
        setTimeout(() => {
          this._displayLog = true;
          r.operator.input.setAttribute("placeholder", this._displayLogPrev);
        }, life);
      } else {
        this._displayLogPrev = text;
      }

      r.operator.input.setAttribute("placeholder", text);
    } else if (!life) {
      this._displayLogPrev = text;
    }
  }

  async addEntry(entry) {
    // Create /posts dir if missing.
    try {
      await this.portal.archive.mkdir("/posts");
    } catch (e) { }
    // Ignore if post with same already ID exists.
    try {
      if (await this.portal.archive.stat("/posts/" + entry.id + ".json"))
        return;
    } catch (e) { }
    await r.db.feed.put(this.portal.archive.url + "/posts/" + entry.id + ".json", entry.to_json());
  }

  async render(reason) {

    await this.feed.render();
  }
  
}

function HomeLegacy()
{





  this.update = async function()
  {
    var record_me = await this.portal.getRecord();
    document.title = "@"+record_me.name;
    this.network = this.collect_network();

    // Get pinned post if exists
    if (record_me.pinned != undefined) {
      r.home.pinned_entry = await r.db.feed.get(r.home.portal.archive.url + "/posts/" + record_me.pinned + ".json");
      if (r.home.pinned_entry)
        (r.home.pinned_entry = new Entry(r.home.pinned_entry, r.home.portal)).pinned = true
    }

    // Update sidebar.
    r.status.update();

    // Update filter:portals and filter:network

    this.portals_page = this.feed.page;
    if (this.portals_ != this.feed.target ||
        this.portals_page_filter != this.feed.filter) {
      // Jumping between tabs? Switching filters? Reset!
      this.portals_page = 0;
    }
    this.portals_ = this.feed.target;
    this.portals_page_filter = this.feed.filter;

    var cmin = this.portals_page * (this.portals_page_size - 2);
    var cmax = cmin + this.portals_page_size - 2;
    this.discovered_count = 0;

    var portals = this.feed.wr_portals_el;

    // Reset culling.
    rdom_cull(portals, cmin, cmax, 0);

    if (this.portals_page > 0) {
      // Create page_prev_el if missing.
      if (!this.portals_page_prev_el) {
        this.portals_page_prev_el = document.createElement('div');
        this.portals_page_prev_el.className = 'badge paginator page-prev';
        this.portals_page_prev_el.setAttribute('data-operation', 'page:--');
        this.portals_page_prev_el.setAttribute('data-validate', 'true');
        this.portals_page_prev_el.innerHTML = "<a class='message' dir='auto'>&lt</a>";
        portals.appendChild(this.portals_page_prev_el);
      }
      // Remove refresh_el.
      if (this.portals_refresh_el) {
        portals.removeChild(this.portals_refresh_el);
        this.portals_refresh_el = null;
      }
    } else {
      // Create refresh_el if missing.
      if (!this.portals_refresh_el) {
        this.portals_refresh_el = document.createElement('div');
        this.portals_refresh_el.setAttribute('data-validate', 'true');
        this.portals_refresh_el.innerHTML = "<a class='message' dir='auto'>↻</a>";
        portals.appendChild(this.portals_refresh_el);
        rdom_move(this.portals_refresh_el, 0);
      }
      // Update classes and operation.
      this.portals_refresh_el.className = "badge paginator refresh";
      if (this.feed.target == "network") {
        this.portals_refresh_el.setAttribute('data-operation', 'network_refresh');
        if (this.discovering > -1) {
          this.portals_refresh_el.className += " refreshing";
        }
      } else {
        this.portals_refresh_el.className += " refreshing";
      }
      // Remove page_prev_el.
      if (this.portals_page_prev_el) {
        portals.removeChild(this.portals_page_prev_el);
        this.portals_page_prev_el = null;
      }
    }

    // Offset always === 1. The 0th element is always a pagination element.
    rdom_cull(portals, cmin, cmax, 1);

    // Portal List
    if (this.feed.target == "portals") {
      // We're rendering the portals tab - sort them and display them.
      var sorted_portals = this.feed.portals.sort(function(a, b) {
        return b.last_timestamp - a.last_timestamp;
      });
      for (id in sorted_portals) {
        var portal = sorted_portals[id];
        rdom_add(portals, portal.url, id, portal.badge.bind(portal));
      }
    }

    // Network List
    var sorted_discovered = this.discovered.sort(function(a, b) {
      return b.last_timestamp - a.last_timestamp;
    });

    for (var id in sorted_discovered) {
      var portal = sorted_discovered[id];

      // Hide portals that turn out to be known after discovery (f.e. added afterwards).
      if (portal.isKnown()) {
        var index = this.discovered.indexOf(portal);
        if (index !== -1)
          this.discovered.splice(index, 1);
        continue;
      }

      if (this.feed.target === "network") {    
        rdom_add(portals, portal.url, this.discovered_count, portal.badge.bind(portal, "network"));
      }
      this.discovered_count++;
    }

    var count = this.feed.portals.length;
    if (this.feed.target == "network") {
      count = this.discovered_count;
    }

    if (count >= cmax) {
      // Create page_next_el if missing.
      if (!this.portals_page_next_el) {
        this.portals_page_next_el = document.createElement('div');
        this.portals_page_next_el.className = 'badge paginator page-next';
        this.portals_page_next_el.setAttribute('data-operation', 'page:++');
        this.portals_page_next_el.setAttribute('data-validate', 'true');
        this.portals_page_next_el.innerHTML = "<a class='message' dir='auto'>&gt</a>";
        portals.appendChild(this.portals_page_next_el);
      }
    } else {
      // Remove page_next_el.
      if (this.portals_page_next_el) {
        portals.removeChild(this.portals_page_next_el);
        this.portals_page_next_el = null;
      }
    }

    // Reposition paginators.
    rdom_move(this.portals_page_prev_el, 0);
    rdom_move(this.portals_page_next_el, portals.childElementCount - 1);

    // Remove zombies.
    rdom_cleanup(portals);

  }
}
