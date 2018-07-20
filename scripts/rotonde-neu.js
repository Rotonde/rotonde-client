//@ts-check
class Rotonde {
  /**
   * @param {RotondeBoot} boot
   */
  constructor(boot) {
    this._isOwner = false;

    this.boot = boot;
    // Everything has been built on the assumption that r is Rotonde.
    window["r"] = r = this;

    this.version = "0.5.0-dev";
    this.url = boot.url;
    
    this.root = rd$`<div class="rotonde"></div>`;
    document.body.appendChild(this.root);

    this.operator = new Operator();
    this.status = new Status();
    this.home = new Home();

    /** @type {RotonDB | any} */
    this.db = null;

    this.ready = false;
  }

  async initDB() {
    let db = this.db = new RotonDB("rotonde");

    // The portals and feed definitions are based on Fritter.
    db.define("portals", {
      filePattern: ["/portal.json", "/profile.json"],
      index: [":origin", "name"],
      validate(record) {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return false;
        }

        if (record["@schema"]) {
          // JSON-LZ

          if (jlz.detectSupport(record, [
            // Profile "features" (vocabs) we support
            "fritter-profile", // fritter-based
            "rotonde-profile-version",
            "rotonde-profile-site",
            "rotonde-profile-pinned",
            "rotonde-profile-sameas",
            "rotonde-profile-discoverable",
            "rotonde-profile-legacy", // deprecated
          ]).incompatible)
            return false;

        }

        // TODO: Set up profile.json validation.
        // This will become more important in the future.
        return true;
      },
      preprocess(record) {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return;
        }
        
        if (record["@schema"]) {
          // JSON-LZ

          // rotonde-profile-* natively supported.
          record.version = record.rotonde_version;

          return;
        }

        // Legacy / unknown data.

        // Assuming no other dat social network than rotonde used client_version...
        record.version = record.rotonde_version || record.client_version;

        record.bio = record.bio || record.desc || "";

        if (record.follows) {
          record.followUrls = record.followUrls || record.follows.map(f => f.url); // Fritter format.

        } else if (record.port || record.followUrls) {
          record.followUrls = record.followUrls || record.port; // Rotonde legacy format.

          record.follows = record.followUrls.map(url => { //Names of portals we follow will be resolved on maintenance.
            return { name: r.getName(url), url: url };
          });

        } else {
          record.follows = [];
          record.followUrls = [];
        }

        record.avatar = record.avatar || "media/content/icon.svg";
        record.sameAs = record.sameAs || record.sameAs;
        record.pinned = record.pinned || record.pinned_entry;

      },
      serialize(record) {

        // This previously was in home.save
        if (record.follows) {
          let portals_updated = {};
          for (let id in r.home.feed.portals){
            let portal = r.home.feed.portals[id];
            portals_updated[toHash(portal.archive ? portal.archive.url : portal.url)] = portal.last_timestamp;
          }
          record.follows = record.follows.sort((a, b) => {
            a = portals_updated[toHash(a.url)] || 0;
            b = portals_updated[toHash(b.url)] || 0;
            return b - a;
          });
        }

        return {
          "@schema": [
            "rotonde-profile",
            {
              "name": "rotonde-profile-version",
              "attrs": ["rotonde_version"],
              "required": false
            },
            {
              "name": "rotonde-profile-site",
              "attrs": ["site"],
              "required": false
            },
            {
              "name": "rotonde-profile-pinned",
              "attrs": ["pinned"],
              "required": false
            },
            {
              "name": "rotonde-profile-sameas",
              "attrs": ["sameAs"],
              "required": false
            },
            {
              "name": "rotonde-profile-discoverable",
              "attrs": ["discoverable"],
              "required": false
            },
            {
              "name": "rotonde-profile-legacy",
              "attrs": ["feed"],
              "required": false
            },
          ],

          // fritter-profile
          name: record.name,
          bio: record.bio,
          avatar: record.avatar,
          follows: record.follows,

          // rotonde-profile-version
          rotonde_version: record.version,

          // rotonde-profile-site
          site: record.site,

          // rotonde-profile-pinned
          pinned: record.pinned,

          // rotonde-profile-sameas
          sameAs: record.sameAs || record.sameas,

          // rotonde-profile-discoverable
          discoverable: record.discoverable !== false,

          // rotonde-profile-legacy
          feed: record.feed // Preserve legacy feed.
        };
      }
    });

    db.define("feed", {
      filePattern: "/posts/*.json",
      index: ["createdAt", ":origin+createdAt", "threadRoot"],
      validate(record) {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return false;
        }

        if (record["@schema"]) {
          // JSON-LZ

          if (jlz.detectSupport(record, [
            // Post "features" (vocabs) we support
            "rotonde-post", // fritter-based
            "rotonde-post-media",
            "rotonde-post-target", // deprecated
            "rotonde-post-mentions", // fritter-based
            "rotonde-post-quotechain",
            "rotonde-post-whisper",
          ]).incompatible)
            return false;

        }

        // TODO: Set up post .json validation.
        // This will become more important in the future.        
        return true;
      },
      preprocess(record) {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return;
        }
        
        if (record["@schema"]) {
          // JSON-LZ

          // rotonde-post-* natively supported.

          return;
        }

        // rotonde legacy -> rotonde-post
        record.text = record.text || record.message;
        record.createdAt = record.createdAt || record.timestamp;
        record.editedAt = record.editedAt || record.editstamp;
      },
      serialize(record) {
        return {
          "@schema": [
            "rotonde-post",
            {
              "name": "rotonde-post-media",
              "attrs": ["media"],
              "required": false
            },
            {
              "name": "rotonde-post-target",
              "attrs": ["target"],
              "required": false
            },
            {
              "name": "rotonde-post-mentions",
              "attrs": ["mentions"],
              "required": false
            },
            {
              "name": "rotonde-post-quotechain",
              "attrs": ["quote"],
              "required": false
            },
            {
              "name": "rotonde-post-whisper",
              "attrs": ["whisper"],
              "required": record.whisper // Require only if this is a whisper.
            }
          ],

          // rotonde-post
          text: record.text || record.message || "",
          createdAt: record.createdAt || record.timestamp,
          editedAt: record.editedAt || record.editstamp,
          threadRoot: record.threadRoot,
          threadParent: record.threadParent || (record.quote ? record.quote.url : null),

          // rotonde-post-media
          media: record.media,

          // rotonde-post-target
          target: record.target,

          // rotonde-post-mentions
          mentions: record.mentions,

          // rotonde-post-quotechain
          quote: record.quote ? (record.quote.toJSON ? record.quote.toJSON() : record.quote) : null,

          // rotonde-post-whisper
          whisper: record.whisper,
        };
      }
    });

    await db.open();
  }

  async start() {
    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("scroll", this.onScroll.bind(this), false);

    await this.initDB();

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
      // this.home.feed.bigpicture_hide();
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

    if (!r.home.feed.entryLast)
      return;
    
    // The feed shrinks and grows as you scroll.
    let bounds = r.home.feed.entryLast.el.getBoundingClientRect();
    if (bounds.bottom < (window.innerHeight + 512)) {
      // Grow - fetch tail.
      setTimeout(() => this.home.feed.fetchFeed(false, true), 0);
    } else if (bounds.bottom > (window.innerHeight + 1024)) {
      // Shrink - render, trimming tail.
      this.home.feed.render(true);
    }
  }
}
