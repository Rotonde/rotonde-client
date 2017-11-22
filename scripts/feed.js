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

  this.el.appendChild(this.wr_el);
  this.wr_el.appendChild(this.wr_timeline_el);
  this.wr_el.appendChild(this.wr_portals_el);

  this.is_bigpicture = false;
  this.bigpicture_el = document.createElement("div");
  this.bigpicture_el.classList.add("bigpicture");
  this.bigpicture_el.classList.add("hidden");
  this.wr_el.appendChild(this.bigpicture_el);
  this.__bigpicture_y__ = 0;
  this.__bigpicture_clear__ = null;
  this.__bigpicture_htmlgen__ = null;
  
  this.queue = [];
  this.portals = [];
  this.portal_rotonde = null;

  this.urls = {};
  this.filter = "";
  this.target = window.location.hash ? window.location.hash.substring(1) : "";
  this.timer = null;
  this.mentions = 0;

  this.page = 0;
  this.page_size = 20;
  this.page_target = null;
  this.page_filter = null;

  this.entries_prev = [];

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

  this.start = function()
  {
    this.queue = [r.home.portal.url].concat(r.home.portal.json.port);
    
    new Portal(r.client_url).connect_service();

    this.connect();
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
      this.connections = 0;
      return;
    }

    var url = r.home.feed.queue[0];

    r.home.feed.queue = r.home.feed.queue.slice(1);

    var portal;
    try {
      portal = new Portal(url);
    } catch (err) {
      // Malformed URL or failed connecting? Skip!
      r.home.feed.next();
      return;
    }
    portal.connect()
    r.home.feed.update_log();
  }

  this.register = async function(portal)
  {
    console.info("connected to ",portal.json.name,this.portals.length+"|"+this.queue.length);

    // Fix the URL of the registered portal.
    for (var id = 0; id < r.home.portal.json.port.length; id++) {
      var port_url = r.home.portal.json.port[id];
      if (port_url != portal.url) continue;
      port_url = portal.archive.url || portal.url;
      if (!port_url.endsWith("/"))
        port_url = port_url + "/";
      r.home.portal.json.port[id] = port_url;
      break;
    }

    portal.id = this.portals.length;
    this.portals.push(portal);
    var hashes = portal.hashes();
    for (var id in hashes) {
      this.__get_portal_cache__[hashes[id]] = portal;      
    }

    // Invalidate the collected network cache and recollect.
    r.home.collect_network(true);

    var activity = portal.archive.createFileActivityStream();
    activity.addEventListener("invalidated", e => {
      if (e.path != '/portal.json')
        return;
      portal.refresh().then(() => {
        r.home.update();
        r.home.feed.refresh(portal.json.name+" updated");
      });
    });

    r.home.update();
    r.home.feed.refresh(portal.json.name+" registered");
  }

  this.__get_portal_cache__ = {};
  this.get_portal = function(hash) {
    hash = to_hash(hash);

    // I wish JS had weak references...
    // WeakMap stores weak keys, which isn't what we want here.
    // WeakSet isn't enumerable, which means we can't get its value(s).

    var portal = this.__get_portal_cache__[hash];
    if (portal)
      return portal;

    if (has_hash(r.home.portal, hash))
      return this.__get_portal_cache__[hash] = r.home.portal;

    for (var id in r.home.feed.portals) {
      portal = r.home.feed.portals[id];
      if (has_hash(portal, hash))
        return this.__get_portal_cache__[hash] = portal;
    }
    
    return null;
  }

  this.update_log = function()
  {
    if(r.home.feed.queue.length == 0){
      r.home.log("Idle.");
      clearInterval(r.home.feed.timer)
    }
    else{
      var progress = (r.home.feed.portals.length/parseFloat(r.home.portal.json.port.length)) * 100;
      r.home.log("Connecting to "+r.home.feed.portals.length+"/"+r.home.portal.json.port.length+" portals.. "+parseInt(progress)+"%");
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

  this.refresh = function(why)
  {
    if (why && why.startsWith("delay: ")) {
      why = why.substring(7 /* "delay: ".length */);
      // Delay the refresh to occur again after all portals refreshed.
      setTimeout(async function() {
        for (var id in r.home.feed.portals) {
          var portal = r.home.feed.portals[id];
          await portal.refresh();
        }
        r.home.feed.refresh('delayed: ' + why);
      }, 750);
      return;
    }    
    if(!why) { console.error("unjustified refresh"); }
    console.log("refreshing feed..", "#" + r.home.feed.target, "→"+why);

    if (this.page_target != r.home.feed.target ||
        this.page_filter != r.home.feed.filter) {
      // Jumping between tabs? Switching filters? Reset!
      this.page = 0;
    }
    this.page_target = r.home.feed.target;
    this.page_filter = r.home.feed.filter;

    var entries = [];

    for(var id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      entries.push.apply(entries, portal.entries());
    }

    this.mentions = 0;
    this.whispers = 0;

    var sorted_entries = entries.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });

    var timeline = r.home.feed.wr_timeline_el;
    
    var ca = 0;
    var cmin = this.page * this.page_size;
    var cmax = cmin + this.page_size;
    var coffset = 0;

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
    } else {
      // Remove page_prev_el.
      if (this.page_prev_el) {
        timeline.removeChild(this.page_prev_el);
        this.page_prev_el = null;
      }
    }

    var now = new Date();
    var entries_now = new Set();
    for (id in sorted_entries){
      var entry = sorted_entries[id];

      // We iterate through entries anyway - let's just fill this.mentions & this.whispers here.
      // This is faster than filtering twice + iterating through the entries manually,
      // as the iteration overhead is shared and we don't depend on the filter result.
      if (entry.is_visible("", "mentions"))
        this.mentions++;
      else if (entry.is_visible("", "whispers"))
        this.whispers++;

      var c = ca;
      if (!entry || entry.timestamp > now)
        c = -1;
      else if (!entry.is_visible(r.home.feed.filter, r.home.feed.target))
        c = -2;
      var elem = !entry ? null : entry.to_element(timeline, c, cmin, cmax, coffset);
      if (elem != null) {
        entries_now.add(entry);
      }
      if (c >= 0)
        ca++;
    }

    // Remove any "zombie" entries - removed entries not belonging to any portal.
    for (id in this.entries_prev) {
      var entry = this.entries_prev[id];
      if (entries_now.has(entry))
        continue;
      entry.remove_element();
    }
    this.entries_prev = entries_now;

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
    move_element(this.page_prev_el, 0);
    move_element(this.page_next_el, timeline.childElementCount - 1);

    r.home.feed.tab_timeline_el.innerHTML = entries.length+" Entries";
    r.home.feed.tab_mentions_el.innerHTML = this.mentions+" Mention"+(this.mentions == 1 ? '' : 's')+"";
    r.home.feed.tab_whispers_el.innerHTML = this.whispers+" Whisper"+(this.whispers == 1 ? '' : 's')+"";
    r.home.feed.tab_portals_el.innerHTML = r.home.feed.portals.length+" Portal"+(r.home.feed.portals.length == 1 ? '' : 's')+"";
    r.home.feed.tab_discovery_el.innerHTML = (r.home.discovery_enabled?r.home.discovered_count+"/":"")+r.home.network.length+" Network"+(r.home.network.length == 1 ? '' : 's')+"";

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
    if (typeof(html) === "function") {
      this.bigpicture_el.innerHTML = html();
      this.__bigpicture_htmlgen__ = html;
    } else {
      this.bigpicture_el.innerHTML = html;
      this.__bigpicture_htmlgen__ = null;
    }
    
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
    this.__bigpicture_htmlgen__ = null;
    
    position_unfixed(this.tabs_el, this.wr_timeline_el, this.wr_portals_el);

    window.scrollTo(0, this.__bigpicture_y__);
    this.is_bigpicture = false;
  }

}

function to_hash(url)
{
  if (!url)
    return null;

  // This is microoptimized heavily because it's called often.
  // "Make slow things fast" applies here, but not literally:
  // "Make medium-fast things being called very often even faster."
  
  if (
    url.length > 6 &&
    url[0] == 'd' && url[1] == 'a' && url[2] == 't' && url[3] == ':'
  )
    // We check if length > 6 but remove 4.
    // The other 2 will be removed below.
    url = url.substring(4);
  
  if (
    url.length > 2 &&
    url[0] == '/' && url[1] == '/'
  )
    url = url.substring(2);

  var index = url.indexOf("/");
  url = index == -1 ? url : url.substring(0, index);

  url = url.toLowerCase().trim();
  return url;
}

function has_hash(hashes_a, hashes_b)
{
  // Passed a portal (or something giving hashes) as hashes_a or hashes_b.
  var set_a = hashes_a instanceof Set ? hashes_a : null;
  if (hashes_a) {
    if (typeof(hashes_a.hashes_set) === "function")
      set_a = hashes_a.hashes_set();
    if (typeof(hashes_a.hashes) === "function")
      hashes_a = hashes_a.hashes();
  }

  var set_b = hashes_b instanceof Set ? hashes_b : null;
  if (hashes_b) {
    if (typeof(hashes_b.hashes_set) === "function")
      set_b = hashes_b.hashes_set();
    if (typeof(hashes_b.hashes) === "function")
      hashes_b = hashes_b.hashes();
  }

  // Passed a single url or hash as hashes_b. Let's support it for convenience.
  if (typeof(hashes_b) === "string") {
    var hash_b = to_hash(hashes_b);

    if (set_a)
       // Assuming that set_a is already filled with pure hashes...
      return set_a.has(hash_b);

    for (var a in hashes_a) {
      var hash_a = to_hash(hashes_a[a]);
      if (!hash_a)
        continue;
  
      if (hash_a === hash_b)
        return true;
    }
  }

  if (set_a) {
    // Fast path: set x iterator
    for (var b in hashes_b) {
      var hash_b = to_hash(hashes_b[b]);
      if (!hash_b)
        continue;

      // Assuming that set_a is already filled with pure hashes...
      if (set_a.has(hash_b))
        return true;
    }
    return false;
  }

  if (set_b) {
    // Fast path: iterator x set
    for (var a in hashes_a) {
      var hash_a = to_hash(hashes_a[a]);
      if (!hash_a)
        continue;

      // Assuming that set_b is already filled with pure hashes...
      if (set_b.has(hash_a))
        return true;
    }
    return false;
  }
  
  // Slow path: iterator x iterator
  for (var a in hashes_a) {
    var hash_a = to_hash(hashes_a[a]);
    if (!hash_a)
      continue;

    for (var b in hashes_b) {
      var hash_b = to_hash(hashes_b[b]);
      if (!hash_b)
        continue;

      if (hash_a === hash_b)
        return true;
    }
  }

  return false;
}

function portal_from_hash(url)
{
  if (url.length > 0 && url[0] == "$") return url;
  
  var hash = to_hash(url);

  var portal = r.home.feed.get_portal(hash);
  if (portal)
    return "@" + portal.json.name;
  
  return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
}

function create_rune(context, type)
{
  context = r.escape_attr(context);
  type = r.escape_attr(type);
  return `<i class='rune rune-${context} rune-${context}-${type}'></i>`;
}

function position_fixed(...elements)
{
  var all_bounds = [];
  // Store all current bounds before manipulating the layout.
  for (var id in elements) {
    var el = elements[id];
    var bounds = el.getBoundingClientRect();
    bounds = { top: bounds.top, left: bounds.left, width: bounds.width };
    // Workaround for Chromium (Beaker): sticky elements have wrong position.
    // With the tabs element, bounds.top is 0, not 40, except when debugging...
    if (window.getComputedStyle(el).getPropertyValue("position") === "sticky") {
      el.style.position = "fixed";
      bounds.top = el.getBoundingClientRect().top;
      el.style.position = "";      
    }
    all_bounds[id] = bounds;
  }
  // Update the layout.
  for (var id in elements) {
    var el = elements[id];
    var bounds = all_bounds[id];
    el.style.position = "fixed";
    el.style.top = bounds.top + "px";
    el.style.left = bounds.left + "px";
    el.style.width = bounds.width + "px";
  }
}

function position_unfixed(...elements)
{
  for (var id in elements) {
    var el = elements[id];
    el.style.top = "";
    el.style.left = "";
    el.style.width = "";
    el.style.position = "";
  }
}

r.confirm("script","feed");
