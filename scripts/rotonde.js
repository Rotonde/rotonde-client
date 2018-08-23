//@ts-check

import { toHash } from "./util.js";
import { rd$ } from "./rdom.js";
import { RotonDB } from "./rotondb.js";

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
    this._isOwner = false;

    this.boot = boot;

    this.version = "0.5.0-dev";
    this.url = boot.url;
    
    this.root = rd$`<div class="rotonde"></div>`;
    document.body.appendChild(this.root);

    this.operator = new Operator();
    this.status = new Status();
    this.home = new Home();

    /** @type {RotonDB | any} */
    this.db = null;

    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("scroll", this.onScroll.bind(this), false);

    await this.initDB();

    let clientURL = localStorage.getItem("profile_archive") || window.location.origin;
    boot.load(`${clientURL}/links/custom.css`).then(() => {}, () => {});
    try {
      await boot.load(`${clientURL}/links/custom.js`).then(() => {}, () => {});
    } catch (e) {
      // no-op - broken custom.js shouldn't stop the rest of Rotonde from loading.
    }
  }

  async initDB() {
    let db = this.db = new RotonDB("rotonde");

    // The portals and feed definitions are based on Fritter.
    db.define("portals", {
      filePattern: ["/portal.json", "/profile.json"],
      index: [":origin", "name"],
      validate(record) {
        // TODO: Set up profile.json validation.
        // This will become more important in the future.
        return true;
      },
      preprocess(record) {
        // Assuming no other dat social network than rotonde used client_version...
        record.version = record.version || record.rotonde_version || record.client_version;

        record.bio = record.bio || record.desc || "";

        if (record.follows) {
          // No-op.

        } else if (record.port || record.followUrls) {
          // Rotonde legacy format.
          record.follows = record.followUrls.map(url => { // Names of portals we follow will be resolved later on.
            return { name: r.getName(url), url: url };
          });

        } else {
          record.follows = [];
        }

        record.avatar = record.avatar || "media/content/icon.svg";
        record.sameAs = record.sameAs || record.sameas || [];
        record.pinned = record.pinned || record.pinned_entry;

      },
      serialize(record) {
        // This previously was in home.save
        if (record.follows) {
          let portals_updated = {};
          for (let portal of r.home.feed.portals) {
            portals_updated[toHash(portal.archive ? portal.archive.url : portal.url)] = portal.last_timestamp;
          }
          record.follows = record.follows.sort((a, b) => {
            a = portals_updated[toHash(a.url)] || 0;
            b = portals_updated[toHash(b.url)] || 0;
            return b - a;
          });
        }

        return {
          // Citizen
          name: record.name,
          bio: record.bio,
          follows: record.follows,

          // Fritter
          avatar: record.avatar,

          // Rotonde
          rotonde_version: record.version,
          site: record.site,
          pinned: record.pinned,
          sameAs: record.sameAs,
          discoverable: record.discoverable !== false,
        };
      }
    });

    db.define("feed", {
      filePattern: "/posts/*.json",
      index: ["createdAt", ":origin+createdAt", "threadRoot"],
      validate(record) {
        // TODO: Set up post .json validation.
        // This will become more important in the future.        
        return true;
      },
      serialize(record) {
        return {
          // Citizen
          text: record.text,
          createdAt: record.createdAt,
          threadRoot: record.threadRoot,
          threadParent: record.threadParent || (record.quote ? record.quote.url : null),
          mentions: record.mentions,

          // Rotonde
          editedAt: record.editedAt,
          media: record.media,
          target: record.target,
          quote: record.quote ? (record.quote.toJSON ? record.quote.toJSON() : record.quote) : null,
          whisper: record.whisper,
        };
      }
    });

    await db.open();
  }

  async start() {
    this.operator.start();
    this.status.start();
    await this.home.start();

    r.ready = true;

    await this.render("init");
  }

  async render(reason) {
    if (reason)
      console.log("[rotonde]", "Rerendering everything,", reason);
    else
      console.error("[rotonde]", "Unreasoned render!");
    this.operator.render();
    this.status.render();
    await this.home.render();
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

  fetchPortalExtra(url) {
    return this.home.feed.fetchPortalExtra(url);
  }

  /**
   * Try to get the portal from the given URL.
   * Returns early with URLs starting with $ (f.e. $rotonde).
   * If no matching portal can be found, it returns null.
   */
  getPortal(url, getExtra = true) {
    if (url.length > 0 && url[0] == "$")
      return {
      url: url,
      icon: r.url.replace(/\/$/, "") + "/media/logo.svg",
      name: url.slice(1),
      relationship: "rotonde"
    };
    
    let hash = toHash(url);

    if (!hash)
      return null;

    return this.home.feed.getPortal(hash, getExtra);
  }

  /**
   * Try to get the portal name from the given URL.
   * Returns early with URLs starting with $ (f.e. $rotonde).
   * If no matching portal can be found, it shortens the URL.
   */
  getName(url) {
    let hash = toHash(url);

    if (!hash)
      return "NULL!";

    let portal = this.getPortal(hash, true);
    if (portal)
      return portal.name;
    
    if (hash.length > 16)
      return hash.substr(0, 8) + ".." + hash.substr(hash.length - 4);
    return hash;
  }

  /**
   * Try to get the relationship between the client and the portal at the given URL.
   * Returns early with URLs starting with $ (f.e. $rotonde).
   * If no matching portal can be found, it returns "unknown".
   */
  getRelationship(url) {
    let hash = toHash(url);

    if (!hash)
      return "unknown";

    let portal = this.getPortal(hash, true);
    if (portal && portal.relationship)
      return portal.relationship;
    
    return "unknown";
  }

  /**
   * Try to get a dummy portal for the given URL.
   */
  getPortalDummy(url) {
    return {
      url: url,
      icon: r.url.replace(/\/$/, "") + "/media/logo.svg",
      name: this.getName(url),
      relationship: "unknown"
    };
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
      let bounds = r.home.feed.entryLast.el.getBoundingClientRect();
      if (bounds.bottom < (window.innerHeight + 512)) {
        // Grow - fetch tail.
        setTimeout(async () => {
          await this.home.feed.fetchFeed(false, true);
          this._onScrollRendering = false;
        }, 0);

      } else if (bounds.bottom > (window.innerHeight + 1024)) {
        // Shrink - render, trimming tail.
        setTimeout(async () => {
          await this.home.feed.render(true);
          this._onScrollRendering = false;
        }, 0);

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
