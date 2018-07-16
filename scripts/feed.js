//@ts-check
class Feed {
  constructor() {
    this.connectQueue = [];
    this.portals = [];
    this.portalsExtra = {};
    this._portalsCache = {};
    this.entries = {};
    this._refreshLazy = null;
    this._fetching = {};
    this._fetchingQueue = [];
    this._fetchingCount = 0;

    this.helpPortal = {
      url: "$rotonde",
      icon: r.url.replace(/\/$/, "") + "/media/logo.svg",
      name: "rotonde",
      relationship: "rotonde"
    };

  
    this.filter = "";
    this.target = window.location.hash ? window.location.hash.slice(1) : "";
    this.timer = null;

    // TODO: Move this into a per-user global "configuration" once the Beaker app:// protocol ships.
    this.connectionsMin = 2;
    this.connectionsMax = 4;
    this.connectionDelay = 0;
    this.connectionTimeout = 2500;
    this.fetchingMax = 2;
  
    this.connections = 0;

    this.el =
    rd$`<div id="feed">

          <div !?${"tabs"}>
            <t !?${"tabTimeline"} data-validate="true" data-operation="filter:">Feed</t>
            <t !?${"tabMentions"} data-validate="true" data-operation="filter:mentions">Mentions</t>
            <t !?${"tabWhispers"} data-validate="true" data-operation="filter:whispers">Whispers</t>
            <t !?${"tabDiscovery"} data-validate="true" data-operation="filter:discovery">Discovery</t>
            <t !?${"tabServices"}></t>
          </div>

          <div !?${"tabsWrapper"}>
            <div !?${"wrPinnedPost"}></div>
            <div !?${"wrTimeline"}></div>
            <div !?${"wrPortals"}></div>
            <div !?${"bigpicture"} class="bigpicture hidden"></div>
          </div>

        </div>`;
    this.tabs = this.tabTimeline = this.tabMentions = this.tabWhispers = this.tabPortals = this.tabDiscovery = this.tabServices = null;
    this.tabsWrapper = this.wrPinnedPost = this.wrTimeline = this.wrPortals = this.bigpicture = null;
    this.el.rdomGet(this);
    r.root.appendChild(this.el);
  }

  async start() {
    this.connectQueue = (await r.home.portal.getRecord()).follows;

    this.helpIntro = new Entry({
      message:
`Welcome to {_Rotonde!_}
{#TODO: Intro text.#}
`
    }, this.helpPortal);

    this.connect();

    r.db.on("indexes-updated", this.onIndexesUpdated.bind(this));
  }

  connect() {
    if (this.timer || this.connections > 0) {
      // Already connecting to the queued portals.
      return;
    }

    // Connection loop:
    // Feed.next() -> Portal.connect() ->
    // wait for connection -> delay -> Feed.next();

    // Kick off initial connection loop(s).
    for (let i = 0; i < this.connectionsMin; i++) {
      setTimeout(this.connectLoop.bind(this), i * (this.connectionDelay / this.connectionsMin));
    }

    // Start a new loop every new_delay.
    // This allows us to start connecting to multiple portals at once.
    // It's helpful when loop A keeps locking up due to timeouts:
    // We just spawn another loop whenever the process is taking too long.
    this.timer = setInterval(this.connectLoop.bind(this), this.connectionTimeout);
  }

  connectLoop() {
    // Have we hit the concurrent loop limit?
    if (this.connections >= this.connectionsMax) {
      // Remove the interval - we don't want to spawn any more loops.
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }

    this.connections++;
    this.connectNext();
  }

  async connectNext() {
    if (this.connectQueue.length === 0) {
      console.log("[feed]", "Reached end of connection queue.");
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.connections = 0;
      await r.render("finished connecting");
      return;
    }

    let entry = this.connectQueue[0];
    let url = entry;
    if (entry.url) {
      url = entry.url;
    }

    this.connectQueue = this.connectQueue.slice(1);
    
    if (!this.getPortal(url)) {
      let portal;
      try {
        portal = new Portal(url);
        if (entry.name)
          portal.name = entry.name;
        if (entry.oncreate)
          portal.fire(entry.oncreate);
        if (entry.onparse)
          portal.onparse.push(entry.onparse);
        await portal.connect();
        await r.home.feed.register(portal);
      } catch (el) {
        // Malformed URL or failed connecting? Skip!
      }
    }

    this.renderLog();
    setTimeout(this.connectNext.bind(this), 0);
  }

  onIndexesUpdated(url) {
    // Invalidate matching portal.
    for (let portal of r.home.feed.portals) {
      if (!hasHash(portal, url))
        continue;
      portal.invalidate();
      break;
    }
    r.render(`updated: ${url}`);
  }

  fetchPortalExtra(url) {
    url = "dat://"+toHash(url);
    return this._fetching[url] || (this._fetching[url] = this._fetchPortalExtra(url));
  }
  async _fetchPortalExtra(url) {
    if (++this._fetchingCount >= this.fetchingMax)
      await new Promise(r => this._fetchingQueue.push(r));

    let portal = new Portal(url);
    try {
      if (!(await portal.fetch())) {
        portal = null;
      }
    } catch (e) {
      portal = null;
    }

    if (this._fetchingQueue.length)
      this._fetchingQueue.splice(0, 1)[0]();
    this._fetchingCount--;

    return this.portalsExtra[toHash(url)] = portal;
  }

  async register(portal) {
    console.info("[feed]", "Registering", portal.name, this.portals.length, "|", this.connectQueue.length);

    // Fix the URL of the registered portal.
    let follows = (await r.home.portal.getRecord()).follows;
    for (let i = 0; i < follows.length; i++) {
      let url = follows[i].url;
      if (!hasHash(portal, url))
        continue;
      url = "dat://"+toHash(portal.url);
      follows[i].name = portal.name;
      follows[i].url = url;
      r.db.portals.update(r.home.portal.recordURL, {
        follows: follows
      });
      break;
    }

    this.portals.push(portal);

    for (let i in this.portals) {
      this.portals[i].i = i;
    }

    for (let hash of portal.hashes) {
      this._portalsCache[hash] = portal;
    }

    if (!portal.isRemote) {
      // portal.load_remotes();
    }

    // Invalidate the collected network cache and recollect.
    // r.home.collect_network(true);

    await r.render(`registered: ${portal.name}`);
  }

  getPortal(hash) {
    hash = toHash(hash);

    // I wish JS had weak references...
    // WeakMap stores weak keys, which isn't what we want here.
    // WeakSet isn't enumerable, which means we can't get its value(s).

    let portal = this._portalsCache[hash];
    if (portal)
      return r.home.feed.portals.indexOf(portal) === -1 ? null : portal;

    if (hasHash(r.home.portal, hash))
      return this._portalsCache[hash] = r.home.portal;

    for (let portal of r.home.feed.portals) {
      if (hasHash(portal, hash))
        return this._portalsCache[hash] = portal;
    }

    portal = this.portalsExtra[hash];
    if (portal)
      return portal;

    return null;
  }

  async render(reason) {
    if (this._refreshLazy)
      clearTimeout(this._refreshLazy);
    this._refreshLazy = null;

    if (!r.ready)
      return;

    if (reason)
      console.error("[feed]", "JUSTIFIED FEED REFRESH, which should probably be changed into a HOME RENDER!", reason);

    let timeline = this.wrTimeline;
    let ctx = new RDOMCtx(timeline);

    let now = new Date();

    let ca = -1;

    if (!this.target) {
      let entry = this.helpIntro;
      entry.el = ctx.add(entry.timestamp, ++ca, entry);
    }

    let entryURLs = await r.db.feed.listRecordFiles();
    entryURLs.sort((a, b) => {
      a = a.slice(a.lastIndexOf("/") + 1, -5);
      b = b.slice(b.lastIndexOf("/") + 1, -5);

      a = parseInt(a) || parseInt(a, 36);
      b = parseInt(b) || parseInt(b, 36);

      return parseInt(b) - parseInt(a);
    });
    // TODO: Show more than the newest 40 posts.
    entryURLs = entryURLs.slice(0, 40);
    /** @type {any[]} */
    let entries = await Promise.all(entryURLs.map(url => r.db.feed.get(url)));

    entries = entries.map(raw => {
      let entry = this.entries[raw.createdAt];
      if (!entry)
        entry = this.entries[raw.createdAt] = new Entry();

      let url = raw.url || (raw.getRecordURL ? raw.getRecordURL() : null);
      let portalHash = toHash(url);
      entry.update(raw, portalHash, true);

      this.entries[entry.id] = entry;
      
      return entry;
    });

    entries = entries.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });

    // TODO: Filter entries.

    for (let entry of entries) {
      if (!entry || entry.timestamp > now || !entry.isVisible(this.filter, this.target))
        continue;
      entry.el = ctx.add(entry.timestamp, ++ca, entry);
    }

    ctx.cleanup();

    this.renderLog();
  }

  renderLog() {
    if (this.connectQueue.length == 0) {
      r.home.log("Ready");
      return;
    }
    r.home.log(`Connecting to ${this.portals.length}/${r.home.portal.follows.length} portals, ${Math.round((this.portals.length / r.home.portal.follows.length) * 100)}%`);
  }
}

function FeedLegacy(feed_urls)
{
  this.feed_urls = feed_urls;

  this.__bigpicture_y__ = 0;
  this.__bigpicture_clear__ = null;
  this.__bigpicture_html__ = null;
  this.__bigpicture_htmlgen__ = null;
  
  this.update_log = async function()
  {
    if(r.home.feed.connectQueue.length == 0){
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
    await r.home.update();
    if (refresh) await r.home.feed.refresh('page prev');
  }

  this.page_next = async function(refresh = true)
  {
    r.home.feed.page++;
    await r.home.update();
    if (refresh) await r.home.feed.refresh('page next');
  }

  this.page_jump = async function(page, refresh = true)
  {
    r.home.feed.page = page;
    await r.home.update();
    if (refresh) await r.home.feed.refresh('page jump ' + r.home.feed.page);
    setTimeout(function(){window.scrollTo(0, 0);},1000)
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
