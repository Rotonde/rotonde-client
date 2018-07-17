//@ts-check
class Feed {
  constructor() {
    this.connectQueue = [];
    this.portals = [];
    this.portalsExtra = {};
    this._portalsCache = {};
    this.entryMap = {};
    this.entries = [];
    this.pinnedPrev = null;
    this.pinnedEntry = null;
    this._fetching = {};
    this._fetchingQueue = [];
    this._fetchingCount = 0;
    this._fetchingFeed = null;
    this._rendering = null;
    this._fetchesWithoutUpdates = 0;

    this.helpPortal = {
      url: "$rotonde",
      icon: r.url.replace(/\/$/, "") + "/media/logo.svg",
      name: "rotonde",
      relationship: "rotonde"
    };

    this.ready = false;
  
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
            <t id="tab_timeline" data-validate="true" data-operation="filter:">Feed</t>
            <t id="tab_mentions" data-validate="true" data-operation="filter:mentions">Mentions</t>
            <t id="tab_whispers" data-validate="true" data-operation="filter:whispers">Whispers</t>
            <t id="tab_discovery" data-validate="true" data-operation="filter:discovery">Discovery</t>
            <t id="tab_services"></t>
          </div>

          <div !?${"tabsWrapper"}>
            <div !?${"wrPinnedPost"}></div>
            <div !?${"wrTimeline"}></div>
            <div !?${"wrPortals"}></div>
            <div !?${"bigpicture"} class="bigpicture hidden"></div>
          </div>

        </div>`;
    this.tabs = this.tabsWrapper = this.wrPinnedPost = this.wrTimeline = this.wrPortals = this.bigpicture = null;
    this.preloader = null; // Set on render.
    this.el.rdomGet(this);
    r.root.appendChild(this.el);
  }

  async start() {
    this.connectQueue = (await r.home.portal.getRecord()).follows;

    this.helpIntro = new Entry({
      message:
`Welcome to {*Rotonde!*}
{#TODO: Intro text.#}

{*Note:*} {_Many features haven't been reimplemented yet._}
Some features aren't planned to return (f.e. the dedicated portal page).
Right now, restoring and improving the core experience is the top priority.
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
      await this.fetchFeed(true, false);
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
    this.fetchFeed(true, false).then(() => r.render(`updated: ${url}`));
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

    await this.fetchFeed(true, false);
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

  fetchEntry(url, ref) {
    let fetch = this._fetching[url];
    if (fetch)
      return fetch;
    fetch = this._fetching[url] = this._fetchEntry(url, ref);
    fetch.then(() => this._fetching[url] = null, () => this._fetching[url] = null);
    return fetch;
  }
  async _fetchEntry(url, ref) {
    let raw = await r.db.feed.get(url);
    if (!raw)
      return;

    let entry = this.entryMap[raw.createdAt];
    if (!entry)
      entry = this.entryMap[raw.createdAt] = new Entry();

    if (entry.update(raw, toHash(raw.url || (raw.getRecordURL ? raw.getRecordURL() : null) || url), true) && ref)
      ref.updates++;

    this.entryMap[entry.id] = entry;
    return entry;
  }

  async fetchEntries(entryURLs, offset, count) {
    if (!entryURLs || !count)
      return 0;

    entryURLs = entryURLs.slice(offset, offset + count);
    if (entryURLs.length === 0)
      return 0;
    
    let ref = { updates: 0 };
    /** @type {any[]} */
    let entries = await Promise.all(entryURLs.map(url => this.fetchEntry(url, ref)));
    
    entries = [...new Set(this.entries.concat(...entries))].filter(e => e);
    entries = entries.sort((a, b) => b.timestamp - a.timestamp);

    this.entries = entries;
    return ref.updates;
  }

  fetchFeed(refetch = true, rerender = false) {
    if (this._fetchingFeed)
      return this._fetchingFeed;
    this._fetchingFeed = this._fetchFeed(refetch, rerender);
    this._fetchingFeed.then(() => this._fetchingFeed = null, () => this._fetchingFeed = null);
    return this._fetchingFeed;
  }
  async _fetchFeed(refetch = true, rerender = false) {
    let updatesTotal = 0;
    let updates = 0;

    let entryURLsAll = await r.db.feed.listRecordFiles();
    entryURLsAll.sort((a, b) => {
      a = a.slice(a.lastIndexOf("/") + 1, -5);
      b = b.slice(b.lastIndexOf("/") + 1, -5);

      a = parseInt(a) || parseInt(a, 36);
      b = parseInt(b) || parseInt(b, 36);

      return parseInt(b) - parseInt(a);
    });

    let entryLast = this.entryLast;
    let entryURLs = entryURLsAll;

    if (this.target || this.filter) {
      let targetName = toOperatorArg(this.target);
      let targetPortal = this.portals.find(p => toOperatorArg(p.name) === targetName);
      if (targetPortal)
        entryURLs = entryURLs.filter(url => hasHash(targetPortal, url));
      else
        entryLast = this.entries[this.entries.length - 1];
    }

    if (refetch && entryLast) {
      // Refetch everything visible, filling any "gaps" caused by inserts.
      updatesTotal += updates = await this.fetchEntries(entryURLs, 0, entryURLs.indexOf(entryLast.url) + 1);
    }

    if (!this.entryLast) {
      // No last visible entry - fetch the first 10 entries.
      updatesTotal += updates = await this.fetchEntries(entryURLs, 0, 10);

    } else {
      // Fetch the feed "tail" if it's missing.
      let bounds = this.entryLast.el.getBoundingClientRect();
      if (bounds && bounds.bottom > (window.innerHeight + 512)) {
        // Tail hidden below screen - there might still be elements left, but don't fetch them.
        updatesTotal = -1;
        
      } else {
        // Tail missing - fetch 5 entries past the last entry.
        let offset = entryURLs.indexOf(entryLast.url) + 1;
        updatesTotal += updates = await this.fetchEntries(entryURLs, offset, 5);
      }
    }

    if (updatesTotal <= 0) {
      this._fetchesWithoutUpdates++;
    } else {
      this._fetchesWithoutUpdates = 0;
    }

    if (rerender) {
      setTimeout(async () => {
        await this.render(true);
        this.preloader.rdomSet({"done": updatesTotal === 0});      
      }, 0);
    }
    return updatesTotal;
  }

  async render(fetched = false) {
    if (!r.ready)
      return;

    let me = await r.home.portal.getRecord();

    let timeline = this.wrTimeline;
    let ctx = new RDOMCtx(timeline);

    let now = new Date();

    let eli = -1;
    this.entryLast = null;

    if (me.pinned !== this.pinnedPrev) {
      this.pinnedPrev = me.pinned;
      if (me.pinned) {
        this.pinnedEntry = this.entryMap[me.pinned];
        if (!this.pinnedEntry)
          this.pinnedEntry = await r.home.feed.fetchEntry(me.pinned);
      } else {
        this.pinnedEntry = null;
      }
    }

    if (this.pinnedEntry) {
      let entry = this.pinnedEntry;
      if (entry && entry.ready && entry.timestamp <= now && entry.isVisible(this.filter, this.target)) {
        entry.pinned = true;
        let elPrev = entry.el;
        entry.el = null;
        entry.el = ctx.add("pinned", ++eli, entry);
        entry.el = elPrev;
        entry.pinned = false;
      }
    }

    if (r.isOwner && !this.target && !this.filter) {
      let entry = this.helpIntro;
      entry.el = ctx.add("intro", ++eli, entry);
    }

    let renderedThread = new Set();

    for (let entry of this.entries) {
      if (!entry || !entry.ready || entry.timestamp > now || !entry.isVisible(this.filter, this.target))
        continue;
      
      if (renderedThread.has(entry.id))
        continue;
      if (entry.quote)
        renderedThread.add(entry.quote.id);
      
      entry.el = ctx.add(entry.url, ++eli, this.entryLast = entry);
      let bounds = entry.el.getBoundingClientRect();
      if (bounds.bottom > (window.innerHeight + 1024))
        break;
    }

    this.preloader = ctx.add("preloader", ++eli, el => el || rd$`<div class="entry pseudo"  *?${rdh.toggleClass("done")}><div class="preloader"></div><div class="preloader b"></div></div>`);
    // TODO: Fetch feed tail outside of feed render!
    if (!fetched || this._fetchesWithoutUpdates < 2) {    
      this.fetchFeed(false, true);
    }

    ctx.cleanup();

    for (let el of this.tabs.childNodes) {
      if (!el.classList)
        continue;
      el.classList.remove("active");
    }
    try {
      let elTab = this.tabs.querySelector(`[data-operation="filter:${this.target}"]`);
      if (elTab && elTab.classList)
        elTab.classList.add("active");
    } catch (e) {
      if (!(e instanceof DOMException))
        throw e;
    }

    this.renderLog();
  }

  renderLog() {
    if (this.connectQueue.length === 0) {
      r.home.log("Ready");
      this.ready = true;
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
