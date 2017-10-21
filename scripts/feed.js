function Feed(feed_urls)
{
  this.feed_urls = feed_urls;
  this.el = document.createElement('div'); this.el.id = "feed";

  this.urls = {};
  this.filter = "";

  this.install = function(el)
  {
    el.appendChild(this.el);
    this.update();
  }

  this.refresh = function()
  {
    var feed_html = "";
    var entries = [];
    var portals = [];
    for(id in feed_urls){
      var portal = r.index.lookup_url(feed_urls[id]);
      if(!portal) { continue; }
      portals.push(portal);
      entries = entries.concat(this.entries_for_portal(portal));
    }
    if(feed_urls.length > 0 && portals.length === 0){
      this.el.innerHTML = "Fetching "+this.feed_urls.length+" feeds..";
      return;
    }
    var owner_portal = r.index.make_portal(r.portal.data, r.portal.data.dat, r.portal.archive);
    portals.push(owner_portal);
    entries = entries.concat(this.entries_for_portal(owner_portal));
    var sorted_entries = entries.sort(function (a, b) {
      return a.timestamp < b.timestamp ? 1 : -1;
    });

    for(id in portals) {
      var portal = portals[id];
      var url = portal.url;
      var last_entry = portal.feed[portal.feed.length-1];
      var is_active = last_entry ? Math.floor((new Date() - last_entry.timestamp) / 1000) : 999999;
      var rune = portal.port.indexOf(r.portal.data.dat) > -1 || portal.dat === r.portal.data.dat ? "@" : "~";

      if(!last_entry){ continue; }
      if(is_active > 190000 && portal.name != r.portal.data.name){
        feed_html += "<ln title='"+(timeSince(last_entry.timestamp))+"' class='dead' data-operation='un"+url+"'>"+rune+""+portal.name+"</ln>";
      }
      else{
        feed_html+= "<ln title='"+(timeSince(last_entry.timestamp))+"' class='"+(is_active < 150000 ? "active" : "inactive")+"'><a href='"+url+"'>"+rune+""+portal.name+"</a></ln>";
      }
    }
    r.portal.port_list_el.innerHTML = feed_html;

    var html = this.filter ? "<c class='clear_filter' data-operation='clear_filter' data-validate='validate'>Filtering by "+this.filter+"</c>" : "";
    var c = 0;
    for(id in sorted_entries){
      var entry = sorted_entries[id];
      if(!entry || entry.timestamp > new Date()) { continue; }
      if(!entry.is_visible()){ continue; }
      html += entry.to_html();
      if(c > 40){ break; }
      c += 1;
    }
    html += "<div class='entry'><t class='portal'>$rotonde</t><t class='timestamp'>Just now</t><hr/><t class='message' style='font-style:italic'>Welcome to #rotonde, a decentralized social network. Share your dat:// url with others and add theirs into the input bar to get started.</t></div>"
    this.el.innerHTML = html;
  }

  this.entries_for_portal = function(portal)
  {
    return portal.feed
      .filter((entry) => {
        if (!this.filter) return true;
        if ("@"+portal.name === this.filter) return true;
        return entry.message.toLowerCase().includes(this.filter.toLowerCase());
      }).map((entry, entry_id) => new Entry(
        Object.assign({}, entry, {
          portal: portal.name,
          dat: portal.archive.url,
          id: entry_id,
          seed: portal.port.indexOf(r.portal.data.dat) > -1 || portal.dat === r.portal.data.dat
        })
      ));
  }

  this.debounced_refresh = debounce(() => this.refresh(), 1000, false);

  this.update = function()
  {
    this.refresh();
  }

  this.portal_changed = function(key)
  {
    this.debounced_refresh();
  }
}

// See https://davidwalsh.name/javascript-debounce-function
function debounce(func, wait, immediate)
{
  var timeout;
  return function() {
    var context = this, args = arguments;
    var later = function() {
      timeout = null;
      // if (!immediate) func.apply(context, args);
      func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

function portal_from_hash(hash)
{
  var portal = r.index.lookup_url(hash);
  if(portal){ return "@"+portal.name; }
  return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
}

r.confirm("script","feed");
