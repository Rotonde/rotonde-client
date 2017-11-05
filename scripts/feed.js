function Feed(feed_urls)
{
  this.feed_urls = feed_urls;
  this.el = document.createElement('div'); this.el.id = "feed";
  this.tabs_el = document.createElement('div'); this.tabs_el.id = "tabs";
  this.wr_el = document.createElement('div'); this.wr_el.id = "tabs_wrapper";

  this.tab_timeline_el = document.createElement('t'); this.tab_timeline_el.id = "tab_timeline";
  this.tab_mentions_el = document.createElement('t'); this.tab_mentions_el.id = "tab_mentions";
  this.tab_portals_el = document.createElement('t'); this.tab_portals_el.id = "tab_portals";
  this.tab_network_el = document.createElement('t'); this.tab_network_el.id = "tab_network";
  this.tab_services_el = document.createElement('t'); this.tab_services_el.id = "tab_services";

  this.tab_portals_el.setAttribute("data-operation","filter:portals");
  this.tab_mentions_el.setAttribute("data-operation","filter:mentions");
  this.tab_timeline_el.setAttribute("data-operation","clear_filter");
  this.tab_portals_el.setAttribute("data-validate","true");
  this.tab_mentions_el.setAttribute("data-validate","true");
  this.tab_timeline_el.setAttribute("data-validate","true");

  this.el.appendChild(this.tabs_el);
  this.tabs_el.appendChild(this.tab_timeline_el);
  this.tabs_el.appendChild(this.tab_mentions_el);
  this.tabs_el.appendChild(this.tab_portals_el);
  this.tabs_el.appendChild(this.tab_network_el);
  this.tabs_el.appendChild(this.tab_services_el);

  this.wr_timeline_el = document.createElement('div'); this.wr_timeline_el.id = "wr_timeline";
  this.wr_portals_el = document.createElement('div'); this.wr_portals_el.id = "wr_portals";

  this.el.appendChild(this.wr_el);
  this.wr_el.appendChild(this.wr_timeline_el);
  this.wr_el.appendChild(this.wr_portals_el);

  this.queue = [];
  this.portals = [];

  this.urls = {};
  this.filter = "";
  this.target = window.location.hash ? window.location.hash.replace("#","") : "";
  this.timer = null;

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

  this.last_update = Date.now();

  this.next = async function()
  {
    if(r.home.feed.queue.length < 1){ console.log("Reached end of queue"); r.home.feed.update_log(); return; }
    if(Date.now() - r.home.feed.last_update < 250){ return; }

    var url = r.home.feed.queue[0];

    r.home.feed.queue = r.home.feed.queue.splice(1);

    var portal = new Portal(url);
    portal.connect()
    r.home.feed.update_log();
    r.home.feed.last_update = Date.now();
  }

  this.register = async function(portal)
  {
    console.info("connected to ",portal.json.name,this.portals.length+"|"+this.queue.length);

    this.portals.push(portal);
    var activity = portal.archive.createFileActivityStream("portal.json");
    activity.addEventListener('changed', e => {
      r.home.feed.refresh();
    });
    r.home.update();
    r.home.feed.refresh();
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

  this.refresh = function()
  {
    r.home.feed.target = window.location.hash ? window.location.hash.replace("#","") : "";

    console.log("refreshing feed..",r.home.feed.target);

    var entries = [];

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      entries = entries.concat(portal.entries())
    }

    var sorted_entries = entries.sort(function (a, b) {
      return a.timestamp < b.timestamp ? 1 : -1;
    });

    var feed_html = "";

    var mentions = 0;

    var c = 0;
    for(id in sorted_entries){
      var entry = sorted_entries[id];
      var legacy = false;

      // legacy mentions
      if(! (entry.target instanceof Array)){
        entry.target = [entry.target ? entry.target : ""];
        legacy = true;
      }

      if(!entry || entry.timestamp > new Date()) { continue; }
      if(!entry.is_visible(r.home.feed.filter,r.home.feed.target)){ continue; }
      if(legacy && entry.message.toLowerCase().indexOf(r.home.portal.json.name) > -1){
        // backwards-compatible mention
        mentions += 1;
      }
      if(!legacy){
        // multiple-mention
        for(i in entry.target){
          if(to_hash(entry.target[i]) == to_hash(r.home.portal.url)){
            mentions += 1;
            break;
          }
        }
      }
      feed_html += entry.to_html();
      if(c > 40){ break; }
      c += 1;
    }

    r.home.feed.tab_timeline_el.innerHTML = entries.length+" Entries";
    r.home.feed.tab_mentions_el.innerHTML = mentions+" Mention"+(mentions == 1 ? '' : 's')+"";
    r.home.feed.tab_portals_el.innerHTML = r.home.feed.portals.length+" Portal"+(r.home.feed.portals.length == 1 ? '' : 's')+"";
    r.home.feed.tab_network_el.innerHTML = r.home.network.length+" Network"+(r.home.network.length == 1 ? '' : 's')+"";

    r.home.feed.el.className = r.home.feed.target;
    r.home.feed.wr_timeline_el.innerHTML = feed_html;
    feed_html += "<div class='entry'><t class='portal'>$rotonde</t><t class='timestamp'>Just now</t><hr/><t class='message' style='font-style:italic'>Welcome to #rotonde, a decentralized social network. Share your dat:// url with others and add theirs into the input bar to get started.</t></div>"
  }
}

function to_hash(url)
{
  return url && url.replace("dat://","").replace("/","").trim();
}

function portal_from_hash(url)
{
  var hash = to_hash(url);

  for(id in r.home.feed.portals){
    if(hash == to_hash(r.home.feed.portals[id].url)){ return "@"+r.home.feed.portals[id].json.name; }
  }
  if(hash == to_hash(r.home.portal.hash)){
    return "@"+r.home.portal.json.name;
  }
  return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
}

r.confirm("script","feed");
