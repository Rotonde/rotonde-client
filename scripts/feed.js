function Feed(feed_urls)
{
  this.feed_urls = feed_urls;
  this.el = document.createElement('div'); this.el.id = "feed";
  this.tabs_el = document.createElement('div'); this.tabs_el.id = "tabs";
  this.wr_el = document.createElement('div'); this.wr_el.id = "tabs_wrapper";

  this.tab_timeline_el = document.createElement('t'); this.tab_timeline_el.id = "tab_timeline";
  this.tab_mentions_el = document.createElement('t'); this.tab_mentions_el.id = "tab_mentions";
  this.tab_whispers_el = document.createElement('t'); this.tab_whispers_el.id = "tab_whispers";
  this.tab_portals_el = document.createElement('t'); this.tab_portals_el.id = "tab_portals";
  this.tab_discovery_el = document.createElement('t'); this.tab_discovery_el.id = "tab_discovery";
  this.tab_services_el = document.createElement('t'); this.tab_services_el.id = "tab_services";

  this.tab_portals_el.setAttribute("data-operation","filter:portals");
  this.tab_portals_el.setAttribute("data-validate","true");
  this.tab_mentions_el.setAttribute("data-operation","filter:mentions");
  this.tab_mentions_el.setAttribute("data-validate","true");
  this.tab_whispers_el.setAttribute("data-operation","filter:whispers");
  this.tab_whispers_el.setAttribute("data-validate","true");
  this.tab_timeline_el.setAttribute("data-operation","clear_filter");
  this.tab_timeline_el.setAttribute("data-validate","true");
  this.tab_discovery_el.setAttribute('data-operation', 'filter:discovery');
  this.tab_discovery_el.setAttribute('data-validate', "true");

  this.el.appendChild(this.tabs_el);
  this.tabs_el.appendChild(this.tab_timeline_el);
  this.tabs_el.appendChild(this.tab_mentions_el);
  this.tabs_el.appendChild(this.tab_whispers_el);
  this.tabs_el.appendChild(this.tab_portals_el);
  this.tabs_el.appendChild(this.tab_discovery_el);
  this.tabs_el.appendChild(this.tab_services_el);

  this.wr_timeline_el = document.createElement('div'); this.wr_timeline_el.id = "wr_timeline";
  this.wr_portals_el = document.createElement('div'); this.wr_portals_el.id = "wr_portals";

  this.wr_pinned_post_el = document.createElement('div'); this.wr_pinned_post_el.id = "wr_pinned_post";

  this.el.appendChild(this.wr_el);
  this.wr_el.appendChild(this.wr_pinned_post_el);
  this.wr_el.appendChild(this.wr_timeline_el);
  this.wr_el.appendChild(this.wr_portals_el);

  this.is_bigpicture = false;
  this.bigpicture_el = document.createElement("div");
  this.bigpicture_el.classList.add("bigpicture");
  this.bigpicture_el.classList.add("hidden");
  this.wr_el.appendChild(this.bigpicture_el);
  this.__bigpicture_y__ = 0;
  this.__bigpicture_clear__ = null;
  this.__bigpicture_html__ = null;
  this.__bigpicture_htmlgen__ = null;

  this.queue = [];
  this.portals = [];
  this.portals_dummy = {};

  this.urls = {};
  this.filter = "";
  this.target = window.location.hash ? window.location.hash.substring(1) : "";
  this.timer = null;
  this.mentions = 0;

  this.page = 0;
  this.page_size = 20;
  this.page_target = null;
  this.page_filter = null;

  this.connections = 0;
  // TODO: Move this into a per-user global "configuration" once the Beaker app:// protocol ships.
  this.connections_min = 1;
  this.connections_max = 3;
  this.connection_delay = 0;
  this.connection_new_delay = 5000;

  this.install = function()
  {
    r.el.appendChild(r.home.feed.el);
    r.home.feed.start();
  }

  this.start = async function()
  {
    r.home.feed.queue = [r.home.portal.url].concat((await r.home.portal.get()).follows);

    r.home.feed.entry_discovery_intro = new Entry({
      message:
`Welcome to {_Discovery!_}
Glaze through the eyes of the users you're following.
{_Discovery_} has got two modi operandi:
{*Passive*}
Let rotonde discover new portals in the background.
Any discovered mentions and whispers will show up in the other tabs, too.
This is preferred if you don't want to miss out on anything and is enabled by default.
You can enable and disable this with {#enable_discovery#} and {#disable_discovery#} respectively.
{*Active*}
Start a discovery session with the {#discovery#} command.
This is preferred if you're on a limited data plan. Make sure to {#disable_discovery#} first.
`,
      timestamp: -1,
      media: "",
      target: []
    }, {
      url: "$rotonde",
      icon: r.client_url.replace(/\/$/, "") + "/media/logo.svg",
      name: "rotonde",
      relationship: () => create_rune("portal", "rotonde")
    });

    r.home.feed.connect();

    r.db.on("indexes-updated", r.home.feed.indexes_updated);
  }

  this.indexes_updated = function(url) {
    // Invalidate matching portal.
    for (var i in r.home.feed.portals) {
      var portal = r.home.feed.portals[i];
      if (!has_hash(portal, url))
        continue;
      portal.invalidate();
      break;
    }
    r.home.update();
    setTimeout(() => r.home.feed.refresh_lazy("tables at "+url+" updated"), 200);
  }

  this.connect = function()
  {
    if (r.home.feed.timer || r.home.feed.connections > 0) {
      // Already connecting to the queued portals.
      return;
    }

    // Connection loop:
    // Feed.next() -> Portal.connect() ->
    // wait for connection -> delay -> Feed.next();

    // Kick off initial connection loop(s).
    for (var i = 0; i < r.home.feed.connections_min; i++) {
      setTimeout(r.home.feed.connect_loop, i * (r.home.feed.connection_delay / r.home.feed.connections_min));
    }

    // Start a new loop every new_delay.
    // This allows us to start connecting to multiple portals at once.
    // It's helpful when loop A keeps locking up due to timeouts:
    // We just spawn another loop whenever the process is taking too long.
    this.timer = setInterval(r.home.feed.connect_loop, r.home.feed.connection_new_delay);
  }

  this.connect_loop = async function()
  {
    // Have we hit the concurrent loop limit?
    if (r.home.feed.connections >= r.home.feed.connections_max) {
      // Remove the interval - we don't want to spawn any more loops.
      if (r.home.feed.timer) {
        clearInterval(r.home.feed.timer);
        r.home.feed.timer = null;
      }
      return;
    }

    r.home.feed.connections++;
    await r.home.feed.next();
  }

  this.next = async function()
  {
    if(r.home.feed.queue.length < 1){
      console.log("Reached end of queue");
      r.home.update();
      r.home.feed.update_log();
      if (r.home.feed.timer) {
        clearInterval(r.home.feed.timer);
        r.home.feed.timer = null;
      }
      r.home.feed.connections = 0;
      r.home.discover();
      return;
    }

    var entry = r.home.feed.queue[0];
    var url = entry;
    if (entry.url) {
      url = entry.url;
    }

    r.home.feed.queue = r.home.feed.queue.slice(1);

    if (has_hash(r.home.portal, url)) {
      // Our own portal.
      r.home.feed.register(r.home.portal);
      r.home.feed.next();
      return;
    }
    
    if (r.home.feed.get_portal(url)) {
      // Portal already registered.
      r.home.feed.next();
      return;
    }    

    var portal;
    try {
      portal = new Portal(url);
    } catch (err) {
      // Malformed URL or failed connecting? Skip!
      r.home.feed.next();
      return;
    }

    if (entry.name)
      portal.name = entry.name;
    if (entry.oncreate)
      portal.fire(entry.oncreate);
    if (entry.onparse)
      portal.onparse.push(entry.onparse);
    portal.connect();
    r.home.feed.update_log();
  }

  this.register = async function(portal)
  {
    console.info("connected to ",portal.name,this.portals.length+"|"+this.queue.length);

    // Fix the URL of the registered portal.
    var follows = (await r.home.portal.get()).follows;
    for (var id = 0; id < follows.length; id++) {
      var port_url = follows[id].url;
      if (!has_hash(portal, port_url)) continue;
      port_url = "dat://"+to_hash(portal.url)+"/";
      follows[id].name = portal.name;
      follows[id].url = port_url;
      r.db.portals.update(r.home.portal.record_url, {
        follows: follows
      });
      break;
    }

    this.portals.push(portal);

    for (var id in this.portals) {
      this.portals[id].id = id;
    }

    var hashes = portal.hashes();
    for (var id in hashes) {
      this.__get_portal_cache__[hashes[id]] = portal;
    }

    if (!portal.is_remote) {
      portal.load_remotes();
    }

    // Invalidate the collected network cache and recollect.
    r.home.collect_network(true);

    r.home.update();
    await r.home.feed.refresh(portal.name+" registered");
  }

  this.__get_portal_cache__ = {};
  this.get_portal = function(hash, discovered = false) {
    hash = to_hash(hash);

    // I wish JS had weak references...
    // WeakMap stores weak keys, which isn't what we want here.
    // WeakSet isn't enumerable, which means we can't get its value(s).

    var portal = this.__get_portal_cache__[hash];
    if (portal)
      return (portal.is_discovered && !discovered) ? null : portal;

    if (has_hash(r.home.portal, hash))
      return this.__get_portal_cache__[hash] = r.home.portal;

    for (var id in r.home.feed.portals) {
      portal = r.home.feed.portals[id];
      if (has_hash(portal, hash))
        return this.__get_portal_cache__[hash] = portal;
    }

    if (discovered) {
      for (var id in r.home.discovered) {
        portal = r.home.discovered[id];
        if (has_hash(portal, hash))
          return this.__get_portal_cache__[hash] = portal;
      }
    }

    return null;
  }

  this.update_log = async function()
  {
    if(r.home.feed.queue.length == 0){
      r.home.log("Idle.");
      clearInterval(r.home.feed.timer)
    }
    else{
      var progress = (r.home.feed.portals.length/parseFloat(r.home.portal.follows.length)) * 100;
      r.home.log("Connecting to "+r.home.feed.portals.length+"/"+r.home.portal.follows.length+" portals.. "+parseInt(progress)+"%");
    }
  }

  this.page_prev = async function(refresh = true)
  {
    r.home.feed.page--;
    r.home.update();
    if (refresh) await r.home.feed.refresh('page prev');
  }

  this.page_next = async function(refresh = true)
  {
    r.home.feed.page++;
    r.home.update();
    if (refresh) await r.home.feed.refresh('page next');
  }

  this.page_jump = async function(page, refresh = true)
  {
    r.home.feed.page = page;
    r.home.update();
    if (refresh) await r.home.feed.refresh('page jump ' + r.home.feed.page);
    setTimeout(function(){window.scrollTo(0, 0);},1000)
  }

  this.__refresh_lazy__ = null;
  this.refresh_lazy = function(why)
  {
    if (this.__refresh_lazy__)
      clearTimeout(this.__refresh_lazy__);
    this.__refresh_lazy__ = setTimeout(() => this.refresh("lazy: " + why), 100);
  }
  this.refresh = async function(why)
  {
    clearTimeout(this.__refresh_lazy__);
    this.__refresh_lazy__ = null;
    if(!why) { console.error("unjustified refresh"); }
    console.log("refreshing feed..", "#" + r.home.feed.target, "→"+why);

    if (this.page_target != r.home.feed.target ||
        this.page_filter != r.home.feed.filter) {
      // Jumping between tabs? Switching filters? Jump to first page!
      this.page = 0;
    }
    this.page_target = r.home.feed.target;
    this.page_filter = r.home.feed.filter;

    this.mentions = 0;
    this.whispers = 0;

    var count_timeline = 0;
    var count_discovery = 0;
    var entries_all = [];

    // Collect all timeline entries.
    for(var id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      var entries = await portal.entries();
      count_timeline += entries.length;
      entries_all.push.apply(entries_all, entries);
    }

    // Collect all network entries.
    for(var id in r.home.discovered){
      var portal = r.home.discovered[id];

      // Hide portals that turn out to be known after discovery (f.e. added afterwards).
      if (portal.is_known())
        continue;

      var entries = await portal.entries();
      count_discovery += entries.length;
      entries_all.push.apply(entries_all, entries);
    }

    // Count all mentions and whispers
    for (var id in entries_all) {
      var entry = entries_all[id];
      if (entry.is_visible("", "mentions"))
        this.mentions++;
      else if (entry.is_visible("", "whispers"))
        this.whispers++;
    }

    var timeline = r.home.feed.wr_timeline_el;

    var ca = 0;
    var cmin = this.page * this.page_size;
    var cmax = cmin + this.page_size;
    var coffset = 0;

    // Reset culling.
    rdom_cull(timeline, cmin, cmax, 0);

    if (this.page > 0) {
      // Create page_prev_el if missing.
      if (!this.page_prev_el) {
        this.page_prev_el = document.createElement('div');
        this.page_prev_el.className = 'entry paginator page-prev';
        this.page_prev_el.setAttribute('data-operation', 'page:--');
        this.page_prev_el.setAttribute('data-validate', 'true');
        this.page_prev_el.innerHTML = "<t class='message' dir='auto'>↑</t>";
        timeline.appendChild(this.page_prev_el);
      }
      // Add 1 to the child offset.
      coffset++;
      rdom_cull(timeline, cmin, cmax, coffset);
    } else {
      // Remove page_prev_el.
      if (this.page_prev_el) {
        timeline.removeChild(this.page_prev_el);
        this.page_prev_el = null;
      }
    }

    var now = new Date();

    if (r.home.feed.entry_discovery_intro && r.home.feed.target == "discovery") {
      var entry = r.home.feed.entry_discovery_intro;
      entry.timestamp = now + 0x0ade * 42;
      rdom_add(timeline, entry.timestamp, 0, entry.to_html.bind(entry));
      coffset++; // Shift all other entries down by 1 to prevent this pinned entry from moving.
      rdom_cull(timeline, cmin, cmax, coffset); 
    }

    if (r.home.pinned_entry) {
      var entry = r.home.pinned_entry;
      if (entry.timestamp <= now && entry.is_visible(r.home.feed.filter, r.home.feed.target)) {
        rdom_add(timeline, entry.timestamp, 0, entry.to_html.bind(entry));
        coffset++; // Shift all other entries down by 1 to prevent this pinned entry from moving.
        rdom_cull(timeline, cmin, cmax, coffset); 
      }
    }

    var sorted_entries = entries_all.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });

    for (var id in sorted_entries){
      var entry = sorted_entries[id];

      if (!entry || entry.timestamp > now || !entry.is_visible(r.home.feed.filter, r.home.feed.target))
        continue;
      rdom_add(timeline, entry.timestamp, ca, entry.to_html.bind(entry));
      ca++;
    }

    var pages = Math.ceil(ca / this.page_size);

    if (ca >= cmax) {
      // Create page_next_el if missing.
      if (!this.page_next_el) {
        this.page_next_el = document.createElement('div');
        this.page_next_el.className = 'entry paginator page-next';
        this.page_next_el.setAttribute('data-operation', 'page:++');
        this.page_next_el.setAttribute('data-validate', 'true');
        this.page_next_el.innerHTML = "<t class='message' dir='auto'>↓</t>";
        timeline.appendChild(this.page_next_el);
      }
    } else {
      // Remove page_next_el.
      if (this.page_next_el) {
        timeline.removeChild(this.page_next_el);
        this.page_next_el = null;
      }
    }

    // Reposition paginators.
    rdom_move(this.page_prev_el, 0);
    rdom_move(this.page_next_el, timeline.childElementCount - 1);

    // Remove zombies.
    rdom_cleanup(timeline);

    r.home.feed.tab_timeline_el.innerHTML = count_timeline+" Entr"+(count_timeline == 1 ? "y" : "ies")+"";
    r.home.feed.tab_mentions_el.innerHTML = this.mentions+" Mention"+(this.mentions == 1 ? "" : "s")+"";
    r.home.feed.tab_whispers_el.innerHTML = this.whispers+" Whisper"+(this.whispers == 1 ? "" : "s")+"";
    r.home.feed.tab_portals_el.innerHTML = r.home.feed.portals.length+" Portal"+(r.home.feed.portals.length == 1 ? "" : "s")+"";
    r.home.feed.tab_discovery_el.innerHTML = count_discovery+" Discover"+(count_discovery == 1 ? "y" : "ies")+"";

    r.home.feed.tab_mentions_el.className = r.home.feed.target == "mentions" ? "active" : "";
    r.home.feed.tab_whispers_el.className = r.home.feed.target == "whispers" ? "active" : "";
    r.home.feed.tab_portals_el.className = r.home.feed.target == "portals" ? "active" : "";
    r.home.feed.tab_discovery_el.className = r.home.feed.target == "discovery" ? "active" : "";
    r.home.feed.tab_timeline_el.className = r.home.feed.target == "" ? "active" : "";

    this.bigpicture_refresh();
  }

  this.bigpicture_toggle = function(html)
  {
    if (this.is_bigpicture) {
      this.bigpicture_hide();
    } else {
      this.bigpicture_show(html);
    }
  }
  this.bigpicture_refresh = function() {
    if (this.is_bigpicture && this.__bigpicture_htmlgen__) {
      this.bigpicture_show(this.__bigpicture_htmlgen__, true);
    }
  }
  this.bigpicture_show = function(html, refreshing)
  {
    if (this.__bigpicture_clear__)
      clearTimeout(this.__bigpicture_clear__);
    this.__bigpicture_clear__ = null;

    if (!this.is_bigpicture) {
      this.bigpicture_el.classList.remove("hidden");
      this.bigpicture_el.classList.remove("fade-out-die");
      this.bigpicture_el.classList.add("fade-in");
      document.body.classList.add("in-bigpicture");

      this.__bigpicture_y__ = window.scrollY;

      position_fixed(this.tabs_el, this.wr_timeline_el, this.wr_portals_el);
    }

    position_unfixed(this.bigpicture_el);

    var htmlgen = null;
    if (typeof(html) === "function") {
      htmlgen = html;
      html = htmlgen();
    }
    if (html != this.__bigpicture_html__)
      this.bigpicture_el.innerHTML = html;
    this.__bigpicture_html__ = html;
    this.__bigpicture_htmlgen__ = htmlgen;

    this.bigpicture_el.setAttribute("data-operation", "big");
    this.bigpicture_el.setAttribute("data-validate", "true");

    if (!refreshing)
      window.scrollTo(0, 0);
    this.is_bigpicture = true;
  }

  this.bigpicture_hide = function()
  {
    if (!this.is_bigpicture)
      return;

    this.bigpicture_el.classList.add("fade-out-die");
    document.body.classList.remove("in-bigpicture");
    position_fixed(this.bigpicture_el); // bigpicture stays at the same position while fading out.
    if (this.__bigpicture_clear__) clearTimeout(this.__bigpicture_clear__);
    this.__bigpicture_clear__ = setTimeout(() => this.bigpicture_el.innerHTML = "", 300);
    this.__bigpicture_html__ = null;
    this.__bigpicture_htmlgen__ = null;

    position_unfixed(this.tabs_el, this.wr_timeline_el, this.wr_portals_el);

    window.scrollTo(0, this.__bigpicture_y__);
    this.is_bigpicture = false;
  }

}

r.confirm("script","feed");
