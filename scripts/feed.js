function Feed(feed_urls)
{
  this.feed_urls = feed_urls;
  this.el = document.createElement('div'); this.el.id = "feed";

  this.queue = [];
  this.portals = [];

  this.urls = {};
  this.filter = "";

  this.install = function()
  {
    r.el.appendChild(r.home.feed.el);
    r.home.feed.start();
  }

  this.start = function()
  {
    console.log(r.home.portal)

    this.queue.push(r.home.portal.url);
    for(id in r.home.portal.json.port){
      var url = r.home.portal.json.port[id];
      this.queue.push(url)
    }
    this.next();
  }

  this.next = async function()
  {
    if(r.home.feed.queue.length < 1){ console.log("Reached end of queue"); return; }

    var url = r.home.feed.queue[0];

    r.home.feed.queue = r.home.feed.queue.splice(1);

    var portal = new Portal(url);
    portal.connect()
    r.home.feed.update_log();
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
    // Progress
    var online = r.home.feed.portals.length
    var progress = (r.home.feed.portals.length + r.home.feed.queue.length)/parseFloat(r.home.portal.json.port.length) * 100;
    r.home.log("Connecting.. "+(100 - parseInt(progress))+"%");
  }

  this.refresh = function()
  {
    console.log("refreshing feed..");

    var entries = [];

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      entries = entries.concat(portal.entries())
    }

    var sorted_entries = entries.sort(function (a, b) {
      return a.timestamp < b.timestamp ? 1 : -1;
    });

    var feed_html = r.home.feed.filter ? "<c class='clear_filter' data-operation='clear_filter' data-validate='validate'>Filtering by <b>"+r.home.feed.filter+"</b></c>" : "";
    var c = 0;
    for(id in sorted_entries){
      var entry = sorted_entries[id];
      if(!entry || entry.timestamp > new Date()) { continue; }
      if(!entry.is_visible(r.home.feed.filter)){ continue; }
      feed_html += entry.to_html();
      if(c > 40){ break; }
      c += 1;
    }

    feed_html += "<div class='entry'><t class='portal'>$rotonde</t><t class='timestamp'>Just now</t><hr/><t class='message' style='font-style:italic'>Welcome to #rotonde, a decentralized social network. Share your dat:// url with others and add theirs into the input bar to get started.</t></div>"
    r.home.feed.el.innerHTML = feed_html;
  }
}

function portal_from_hash(hash)
{
  for(id in r.home.feed.portals){
    if(hash == r.home.feed.portals[id].url){ return r.home.feed.portals[id].json.name; }
  }
  return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
}

r.confirm("script","feed");
