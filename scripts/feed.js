// @ts-check

import { r } from "./rotonde.js";
import { sherlock, queuelock } from "./locks.js";
import { toOperatorArg, toKey, hasKey, RDOMListHelper, stylePositionFixed, stylePositionUnfixed } from "./util.js";
import { rd$, rdom } from "./rdom.js";

import { Entry } from "./entry.js";

export class Feed {
  constructor() {
    this.ready = false;

    this.entryMap = {};
    this.entryMetas = new Set();
    this.entries = [];

    this.entryLast = null;
    this.entryLastBounds = null;

    this.pinnedPrev = null;

    this._fetching = {};
    this._fetchingQueue = [];
    this._fetchingCount = 0;
    this._fetchingFeed = null;
    
    this._fetchesWithoutUpdates = 0;
    this._fetchFeedLastMetas = [];
    this._fetchFeedLastMetasSorted = [];

    this._bigpictureEntry = false;
    this._bigpictureY = 0;
    this._bigpictureClear = null;
    this._bigpictureHTML = null;
    this._bigpictureHTMLGen = null;

    this.helpProfile = {
      url: "$rotonde",
      avatar: r.url.replace(/\/$/, "") + "/media/logo.svg",
      name: "rotonde"
    };
  
    this.filter = "";
    this.target = window.location.hash ? window.location.hash.slice(1) : "";

    this.el = rd$`
      <div id="feed">

        <div id="tabs" rdom-get="tabs">
          <t id="tab_timeline" data-validate="true" data-operation="filter:">Feed</t>
          <t id="tab_mentions" data-validate="true" data-operation="filter:mentions">Mentions</t>
          <t id="tab_whispers" data-validate="true" data-operation="filter:whispers">Whispers</t>
          <t id="tab_discovery" data-validate="true" data-operation="filter:discovery">Discovery</t>
        </div>

        <div id="tabs_wrapper" rdom-get="tabsWrapper">
          <div id="wr_timeline" rdom-get="wrTimeline"></div>
          <div id="bigpicture" rdom-get="wrBigpicture" class="hidden"></div>
        </div>

      </div>`;
    this.tabs = this.tabsWrapper = this.wrTimeline = this.wrBigpicture = null;
    this.preloader = null; // Set on render.
    rdom.get(this.el, this);

    r.operator.el.appendChild(this.tabs);

    r.root.appendChild(this.el);
  }

  get bigpictureEntry() {
    return this._bigpictureEntry;
  }
  set bigpictureEntry(value) {
    if (this._bigpictureClear)
      clearTimeout(this._bigpictureClear);
    this._bigpictureClear = null;

    let last = this._bigpictureEntry;
    this._bigpictureEntry = value;

    if (!last && value) {  
      this.wrBigpicture.classList.remove("hidden");
      this.wrBigpicture.classList.remove("fade-out-die");
      this.wrBigpicture.classList.add("fade-in");
      document.body.classList.add("in-bigpicture");

      this._bigpictureY = window.scrollY;

      stylePositionFixed(this.wrTimeline);
      stylePositionUnfixed(this.wrBigpicture);
  
      this.wrBigpicture.setAttribute("data-operation", "big");
      this.wrBigpicture.setAttribute("data-validate", "true");
  
      window.scrollTo(0, 0);

    } else if (last && !value) {
      this.wrBigpicture.classList.add("fade-out-die");
      document.body.classList.remove("in-bigpicture");
  
      stylePositionFixed(this.wrBigpicture);
      stylePositionUnfixed(this.wrTimeline);
  
      window.scrollTo(0, this._bigpictureY);
    }

    if (value) {
      document.body.classList.add("hide-tabs");
      if (last !== value)
        this.renderBigpicture();
    } else {
      document.body.classList.remove("hide-tabs");
      this._bigpictureClear = setTimeout(() => this.renderBigpicture(), 500);
    }

  }

  async start() {
    this.helpIntro = new Entry({
      text:
`Welcome to {*Rotonde*}, a decentralized social network.

To get started, share your portal's {#dat://#} URL with others and paste theirs into the operator above.

The operator is where you can post messages from, but it's also where you can add new feeds or perform many other commands. Type {#/help#} into the operator to see a list of all commands.
To show and hide your sidebar, press on your icon up above.
To change your icon, {replace media/content/icon.svg|beaker://library/dat://${window.location.host}/media/content} and refresh your portal.

To hide / show this intro message, type {#/intro#} into the operator.

{*Note:*} {_This is the in-development rewrite / refactor._}
The core Rotonde experience has been restored, but there are still a few bugs, unimplemented features and a few enhancements which I'd like to implement before shipping 0.5.0
`
    }, this.helpProfile);

    let follows = r.home.profile.follows;
    queuelock(4, follows.map(p => (function connectQueueStep(queue, results) {
      r.home.log(`Connecting to ${follows.length - queue.length}/${follows.length} portals, ${Math.round((results.length / follows.length) * 100)}%`);
      return this.register(p.url);
    }).bind(this))).then((function connectQueueEnd() {
      this.ready = true;
      r.home.log("Ready");
      r.render("feed ready");
    }).bind(this));

    // FIXME: Citizen: Detect updates!
    // r.db.on("indexes-updated", this.onIndexesUpdated.bind(this));
  }

  async onIndexesUpdated(url) {
    this.fetchFeed(true, false).then(() => r.render(`updated: ${url}`));
  }

  async register(url) {
    await r.index.crawlSite(url);
    let profile = await r.index.getProfile(url);
    if (r.home.profile) {
      await this.fetchFeed(true, false);
      r.render(`registered: ${profile.name}`);
    }
  }

  fetchEntry(meta, ref) {
    return sherlock(meta, (async function fetchEntryLocked() {
      let raw;
      try {
        raw = await r.index.microblog.getPost(meta.url || meta);
      } catch (e) {
        // Ignore any entry fetching errors silently.
      }
      if (!raw)
        return;
  
      let entry = this.entryMap[raw.createdAt];
      if (!entry)
        entry = this.entryMap[raw.createdAt] = new Entry();
  
      let updated = entry.update(raw, toKey(raw.url || meta.url || meta), true);
  
      if (ref) {
        ref.fetches++;
        if (updated)
          ref.updates++;
      }
  
      this.entryMetas.add(entry.url);
  
      this.entryMap[entry.id] = entry;
      return entry;
    }).bind(this));
  }

  async fetchEntries(entryMetas, offset, count) {
    let ref = { fetches: 0, updates: 0, end: offset };
    if (!entryMetas || !count)
      return ref;

    entryMetas = entryMetas.slice(offset, offset + count);
    if (entryMetas.length === 0)
      return ref;
    ref.end += entryMetas.length;
    
    /** @type {any[]} */
    let entries = await Promise.all(entryMetas.map(meta => this.fetchEntry(meta, ref)));
    
    entries = [...new Set(this.entries.concat(...entries))].filter(e => e);
    entries = entries.sort((a, b) => b.createdAt - a.createdAt);

    this.entries = entries;
    return ref;
  }

  fetchFeed(refetch = true, rerender = false) {
    return sherlock("rotonde.feed", (async function fetchFeedLocked() {
      let updatesTotal = 0;

      let entryLast = this.entryLast;
      let entryMetas;

      if (this.target || this.filter) {
        let targetName = toOperatorArg(this.target);
        let targetPortal = r.index.listProfiles().find(p => toOperatorArg(p.name) === targetName);
        if (targetPortal) {
          entryMetas = r.index.microblog.listFeed({ author: toKey(targetPortal) });
        } else {
          entryLast = this.entries[this.entries.length - 1];
        }
      }

      if (!entryMetas)
        entryMetas = r.index.microblog.listFeed();

      let entryMetasCachedSort = false;
      if (entryMetas.length === this._fetchFeedLastMetas.length) {
        entryMetasCachedSort = true;
        for (let i = entryMetas.length - 1; i > -1; --i) {
          if (entryMetas[i] !== this._fetchFeedLastMetas[i]) {
            entryMetasCachedSort = false;
            break;
          }
        }
      }

      if (entryMetasCachedSort) {
        entryMetas = this._fetchFeedLastMetasSorted;
      } else {
        this._fetchFeedLastMetas = [...entryMetas];
        entryMetas.sort((a, b) => b.numid - a.numid);
        this._fetchFeedLastMetasSorted = entryMetas;
      }

      if (entryMetas.length !== 0) {
        if (refetch && entryLast) {
          // Refetch everything visible, filling any "gaps" caused by inserts.
          let { updates } = await this.fetchEntries(entryMetas, 0, entryMetas.findIndex(meta => meta.url === entryLast.url) + 1);
          updatesTotal += updates;
        }

        // Only fetch anything additional if we haven't fetched the entirety of entryMetas yet.
        if (!this.entryMetas.has(entryMetas[entryMetas.length - 1])) {
          if (!this.entryLast) {
            // No last visible entry - fetch past the last entry, or the first few entries.
            let { updates } = await this.fetchEntries(entryMetas, (entryLast ? entryMetas.findIndex(meta => meta.url === entryLast.url) : -1) + 1, 5);
            updatesTotal += updates;

          } else {
            // Fetch the feed "tail" if it's missing.
            let bounds = this.entryLastBounds;
            if (bounds && bounds.bottom > (window.innerHeight + 512)) {
              // Tail hidden below screen - there might still be elements left, but don't fetch them.
              updatesTotal = -1;
              
            } else {
              // Tail missing - fetch past the last visible entry.
              let offset = entryMetas.findIndex(meta => meta.url === entryLast.url) + 1;
              let { updates, end } = await this.fetchEntries(entryMetas, offset, 5);
              updatesTotal += updates;

              // If there are still entries left after fetching no tail update, fetch them.
              if (!updates && end < entryMetas.length) {
                for (let i = this.entries.length - 1; i > -1; --i) {
                  let entry = this.entries[i];
                  if (entryMetas.findIndex(meta => meta.url === entry.url) !== -1) {
                    entryLast = entry;
                    break;
                  }
                }
                let { updates } = await this.fetchEntries(entryMetas, entryMetas.findIndex(meta => meta.url === entryLast.url) + 1, 5);
                updatesTotal += updates;
              }
            }
          }
        }
      }

      if (updatesTotal <= 0) {
        this._fetchesWithoutUpdates++;
      } else {
        this._fetchesWithoutUpdates = 0;
      }

      if (rerender) {
        setTimeout(() => {
          this.render(true);
          if (updatesTotal === 0)
            this.preloader.classList.add("done");
          else
            this.preloader.classList.remove("done");
        }, 0);
      }
      return updatesTotal;
    }).bind(this));
  }

  render(fetched = false) {
    if (!r.ready)
      return;

    let timeStart = performance.now();

    let me = r.home.profile;

    let timeline = this.wrTimeline;
    let ctx = new RDOMListHelper(timeline, true);

    let entitiesSkip = new Set();

    let now = new Date();

    this.entryLast = null;
    this.entryLastBounds = null;

    let pinned = me.get("pinned", "string", "");
    if (pinned !== this.pinnedPrev) {
      this.pinnedPrev = pinned;
      if (pinned && !this.entryMap[pinned]) {
        // If the pinned entry hasn't been fetched yet, fetch it lazily and rerender afterwards.
        r.home.feed.fetchEntry(r.profileURL + "/posts/" + pinned + ".json").then(() => this.render(true));
      }
    }

    let pinnedEntry = this.entryMap[pinned];
    if (pinnedEntry && (!this.target || this.target === r.home.profile.name || hasKey(r.home.profile, this.target)) && !this.filter) {
      let entry = pinnedEntry;
      if (entry && entry.ready && entry.createdAt <= now && entry.isVisible(this.filter, this.target)) {
        entry.pinned = true;
        entry.big = false;
        entry.parent = null;
        entry.el = ctx.add("pinned", entry);
        entitiesSkip.add(entry.id);
      }
    }

    if (r.isOwner && !this.target && !this.filter && localStorage.getItem("intro_hidden") !== "true") {
      let entry = this.helpIntro;
      entry.el = ctx.add("intro", entry);
    }

    for (let entry of this.entries) {
      if (!entry || !entry.ready || entry.createdAt > now || !entry.isVisible(this.filter, this.target))
        continue;
      
      for (let quote = entry.quote; quote && quote.host.url === entry.host.url; quote = quote.quote)
        entitiesSkip.add(quote.id);
      if (entitiesSkip.has(entry.id))
        continue;
      
      entry.pinned = false;
      entry.big = false;
      entry.parent = null;
      entry.el = ctx.add(entry.url, this.entryLast = entry);
      let bounds = this.entryLastBounds = entry.el.getBoundingClientRect();
      if (bounds.bottom > (window.innerHeight + 1024))
        break;
    }

    this.preloader = ctx.add("preloader", el => rd$(el)`
      <div class="entry pseudo preloader-wrap">
        <div class="preloader"></div>
        <div class="preloader b"></div>
      </div>`);
    // TODO: Fetch feed tail outside of feed render!
    if (!fetched || this._fetchesWithoutUpdates < 2) {    
      this.fetchFeed(false, true);
    }

    ctx.end();

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

    // Render the bigpicture entry, but not if we're possibly fading out.
    if (this.bigpictureEntry)
      this.renderBigpicture();

    let timeEnd = performance.now();
    console.debug("[perf]", "Feed.render", timeEnd - timeStart);
  }

  renderBigpicture() {
    let elPrev = this.wrBigpicture.firstElementChild;
    let el = null;
    
    let entry = this.bigpictureEntry;
    if (entry) {
      entry = entry.parent || entry;
      entry.big = true;
      el = entry.render(el);
    }

    if (!el && elPrev)
      this.wrBigpicture.removeChild(elPrev);
    else if (el && !elPrev)
      this.wrBigpicture.appendChild(el);
    else if (el !== elPrev)
      this.wrBigpicture.replaceChild(el, elPrev);
  }

}
