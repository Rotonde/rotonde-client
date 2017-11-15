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
  this.wr_discovery_el = document.createElement('div'); this.wr_discovery_el.id = "wr_discovery";

  this.el.appendChild(this.wr_el);
  this.wr_el.appendChild(this.wr_timeline_el);
  this.wr_el.appendChild(this.wr_portals_el);
  this.wr_el.appendChild(this.wr_discovery_el);
  
  this.queue = [];
  this.portals = [];

  this.urls = {};
  this.filter = "";
  this.target = window.location.hash ? window.location.hash.replace("#","") : "";
  this.timer = null;
  this.mentions = 0;

  this.page = 0;
  this.page_size = 20;
  this.page_target = null;
  this.page_filter = null;

  this.install = function()
  {
    r.el.appendChild(r.home.feed.el);
    r.home.feed.start();
  }

  this.start = function()
  {
    this.queue.push(r.home.portal.url);
    for(id in r.home.portal.json.port){
      var url = r.home.portal.json.port[id];
      this.queue.push(url)
    }
    this.next();

    this.timer = setInterval(r.home.feed.next, 500);
  }

  this.next = async function()
  {
    if(r.home.feed.queue.length < 1){ console.log("Reached end of queue"); r.home.feed.update_log(); return; }

    var url = r.home.feed.queue[0];

    r.home.feed.queue = r.home.feed.queue.splice(1);

    var portal = new Portal(url);
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
      if (!port_url.replace("dat://", "").indexOf("/") > -1)
        port_url = port_url + "/";
      r.home.portal.json.port[id] = port_url;
      break;
    }

    this.portals.push(portal);
    var activity = portal.archive.createFileActivityStream();
    activity.addEventListener("invalidated", e => {
      r.home.feed.refresh(portal.json.name+" invalidated");
      portal.refresh().then(() => {
        r.home.update();
        r.home.feed.refresh(portal.json.name+" refreshed");
      });
    });
    r.home.update();
    r.home.feed.refresh(portal.json.name+" registered");
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

  this.page_prev = async function()
  {
    r.home.feed.page--;
    r.home.update();
    await r.home.feed.refresh('page prev');
    window.scrollTo(0, document.body.scrollHeight);
  }

  this.page_next = async function()
  {
    r.home.feed.page++;
    r.home.update();
    await r.home.feed.refresh('page next');
    window.scrollTo(0, 0);
  }

  this.page_jump = async function(page)
  {
    r.home.feed.page = page;
    r.home.update();
    await r.home.feed.refresh('page jump ' + r.home.feed.page);
  }

  this.refresh = function(why)
  {
    if (why && why.startsWith("delay: ")) {
      why = why.replace("delay: ", "");
      // Delay the refresh to occur again after all portals refreshed.
      setTimeout(async function() {
        for (var id in r.home.feed.portals) {
          var portal = r.home.feed.portals[id];
          await portal.refresh();
        }
        r.home.feed.refresh('delayed: ' + why);
      }, 250);
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

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      entries = entries.concat(portal.entries())
    }

    this.mentions = entries.filter(function (e) { return e.is_visible("", "mentions") }).length
    this.whispers = entries.filter(function (e) { return e.is_visible("", "whispers") }).length

    var sorted_entries = entries.sort(function (a, b) {
      return a.timestamp < b.timestamp ? 1 : -1;
    });

    var timeline = r.home.feed.wr_timeline_el;
    
    var ca = 0;
    var cmin = this.page * this.page_size;
    var cmax = cmin + this.page_size;

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
    } else {
      // Remove page_prev_el.
      if (this.page_prev_el) {
        timeline.removeChild(this.page_prev_el);
        this.page_prev_el = null;
      }
    }

    var now = new Date();
    for (id in sorted_entries){
      var entry = sorted_entries[id];
      var c = ca;
      if (!entry || entry.timestamp > now)
        c = -1;
      else if (!entry.is_visible(r.home.feed.filter, r.home.feed.target))
        c = -2;
      var elem = !entry ? null : entry.to_element(timeline, c, cmin, cmax);
      if (c >= 0)
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
      }
      // Always append as last.
      timeline.appendChild(this.page_next_el);
    } else {
      // Remove page_next_el.
      if (this.page_next_el) {
        timeline.removeChild(this.page_next_el);
        this.page_next_el = null;
      }
    }

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
  }
}

function to_hash(url)
{
  if (!url)
    return null;

  if (url.startsWith("//"))
    url = url.substring(2);

  url = url.replace("dat://", "");

  var index = url.indexOf("/");
  url = index == -1 ? url : url.substring(0, index);

  url = url.toLowerCase().trim();
  return url;
}

function has_hash(hashes_a, hashes_b)
{
  // Passed a portal (or something giving hashes) as hashes_a or hashes_b.
  if (hashes_a && typeof(hashes_a.hashes) == "function")
    hashes_a = hashes_a.hashes();
  if (hashes_b && typeof(hashes_b.hashes) == "function")
    hashes_b = hashes_b.hashes();

  // Passed a single url or hash as hashes_b. Let's support it for convenience.
  if (typeof(hashes_b) == "string")
    return hashes_a.findIndex(hash_a => to_hash(hash_a) == to_hash(hashes_b)) > -1;
  
  for (var a in hashes_a) {
    var hash_a = to_hash(hashes_a[a]);
    if (!hash_a)
      continue;

    for (var b in hashes_b) {
      var hash_b = to_hash(hashes_b[b]);
      if (!hash_b)
        continue;

      if (hash_a == hash_b)
        return true;
    }

  }

  return false;
}

function portal_from_hash(url)
{
  var hash = to_hash(url);

  for(id in r.home.feed.portals){
    if(has_hash(r.home.feed.portals[id], hash)){ return "@"+r.home.feed.portals[id].json.name; }
  }
  if(has_hash(r.home.portal, hash)){
    return "@"+r.home.portal.json.name;
  }
  return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
}

function create_rune(context, type)
{
  context = r.escape_attr(context);
  type = r.escape_attr(type);
  return `<i class='rune rune-${context} rune-${context}-${type}'></i>`;
}

r.confirm("script","feed");
