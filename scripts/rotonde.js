// @ts-check

import { toKey, hasKey } from "./util.js";
import { rd$ } from "./rdom.js";

// @ts-ignore
import * as Citizen from "dat://cityxvii.hashbase.io/dev/api.js"

import { Operator } from "./operator.js";
import { Status } from "./status.js";
import { Home } from "./home.js";

export class Rotonde {
  constructor() {
    this.ready = false;
    // The actual construction occurs in init() as there is one instance of 'r' shared across all modules.
  }

  hook(obj, funcName, hook, bound = false) {
    let orig = obj[funcName];
    if (!bound)
      orig = orig.bind(obj);
    obj[funcName] = (...args) => hook(orig, ...args);
  }

  /**
   * @param {RotondeBoot} boot
   */
  async init(boot) {
    let timeStart = performance.now();

    this._isOwner = false;

    this.boot = boot;

    this.version = "0.5.0-dev";
    this.url = boot.url;
    this.profileURL = boot.profileURL;
    
    this.root = rd$`<div class="rotonde"></div>`;
    document.body.appendChild(this.root);

    this.index = new Citizen.Index(this.profileURL);
    // This should work even in read-only environments.
    await this.index.setup();

    this.operator = new Operator();
    this.home = new Home();
    this.status = new Status();

    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("scroll", this.onScroll.bind(this), false);

    // await this.initDB();

    boot.load(`${this.profileURL}/links/custom.css`).then(() => {}, () => {});
    try {
      await boot.load(`${this.profileURL}/links/custom.js`).then(() => {}, () => {});
    } catch (e) {
      // no-op - broken custom.js shouldn't stop the rest of Rotonde from loading.
    }

    let timeEnd = performance.now();
    console.debug("[perf]", "Rotonde.init", timeEnd - timeStart);
  }

  async start() {
    let timeStart = performance.now();
    
    this.operator.start();
    this.status.start();
    await this.home.start();

    this.ready = true;

    this.render("start");

    let timeEnd = performance.now();
    console.debug("[perf]", "Rotonde.start", timeEnd - timeStart);

    this.index.addEventListener("indexes-live-updated", this.onFeedUpdated.bind(this), false);
  }

  render(reason) {
    if (reason)
      console.log("[rotonde]", "Rerendering everything,", reason);
    else
      console.error("[rotonde]", "Unreasoned render!");
    this.operator.render();
    this.status.render();
    this.home.render();
  }

  /** @returns {boolean} */
  get isOwner() {
    return this._isOwner;
  }
  set isOwner(value) {
    this._isOwner = value;
    if (value) {
      document.body.classList.remove("guest");
      document.body.classList.add("owner");
    } else {
      document.body.classList.remove("owner");
      document.body.classList.add("guest");
    }
  }

  /**
   * Try to get the relationship between the client and the portal at the given URL.
   * Returns early with URLs starting with $ (f.e. $rotonde).
   * If no matching portal can be found, it returns "unknown".
   */
  getRelationship(domain) {
    if (!r.home.profile)
      return "unknown";

    let key = toKey(domain);
    if (key.length > 0 && key[0] == "$")
      return "rotonde";

    if (!key)
      return "unknown";

    let profile = this.index.getProfile(key);
    if (!profile)
      return "unknown";

    let self = toKey(r.home.profile);
    if (self === toKey(profile))
      return "self";
    
    for (let follow of profile.follows)
      if (self === toKey(follow))
        return "both";

    for (let follow of this.home.profile.follows)
      if (key === toKey(follow))
        return "follow";

    return "unknown";
  }

  async onFeedUpdated(e) {
    if (e.url) {
      let url = e.url;
      url = url.slice("dat://".length);
      let indexOfSlash = url.indexOf("/");
      
      let key = indexOfSlash === -1 ? url : url.slice(0, indexOfSlash);
      let filename = indexOfSlash === -1 ? "" : url.slice(indexOfSlash);

      if (filename === "/profile.json" || filename === "/portal.json") {
        // If the portal has been updated, forcibly refetch it manually.
        await this.index.getProfile(key);

      } else if (filename.startsWith("/posts/")) {
        // If the updated file is a post, remove it from the cache.
        // It could've been deleted.
        let id = filename.slice("/posts/".length, filename.length - 5);
        let entry = this.home.feed.entryMap[id];
        if (entry) {
          this.home.feed.entries.splice(this.home.feed.entries.indexOf(entry), 1);
          this.home.feed.entryMap[id] = null;
          this.home.feed.entryMetas.delete(url);
        }
      }
    }
    await this.home.feed.fetchFeed(true, false);
    this.render(`index updated: ${e.url}`);
  }

  onMouseDown(e) {
    if (e.button != 0) // We only care about the main mouse button.
      return;
    
    let target = e.target;
    while (target && !target.getAttribute("data-operation"))
      target = target.parentElement;
    if (!target)
      return;
    
    e.preventDefault();

    let prevText = this.operator.input.value;
    this.operator.inject(this.operator.prefix + target.getAttribute("data-operation"));
    if (!target.getAttribute("data-validate"))
      return;
    // If the operation should be validated immediately, revert the text as well.
    this.operator.validate();
    this.operator.inject(prevText);
  }

  onKeyDown(e) {
    if (e.which === 27) { // ESC
      this.home.feed.bigpictureEntry = null;
      return;
    }

    if ((e.key === "Backspace" || e.key === "Delete") && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      this.home.selectArchive();
      return;
    }
  }

  onScroll(e) {
    if (!this.ready)
      return;

    if (r.home.feed.entryLast) {
      if (this._onScrollRendering)
        return;
      this._onScrollRendering = true;

      // The feed shrinks and grows as you scroll.
      let bounds = this.home.feed.entryLast.el.getBoundingClientRect();
      if (bounds.bottom < (window.innerHeight + 512)) {
        // Grow - fetch tail.
        requestAnimationFrame((async function onScrollGrow() {
          try {
            await this.home.feed.fetchFeed(false, true);
          } finally {
            this._onScrollRendering = false;
          }
        }).bind(this));

      } else if (bounds.bottom > (window.innerHeight + 1024)) {
        // Shrink - render, trimming tail.
        requestAnimationFrame((async function onScrollShrink() {
          try {
            this.home.feed.render(true);
          } finally {
            this._onScrollRendering = false;
          }
        }).bind(this));

      } else {
        this._onScrollRendering = false;
      }
    }
  }
};

export let r = new Rotonde();

if (window && window["Rotonde"]) {
  window["Rotonde"] = Rotonde;
  window["r"] = r;
}
