// @ts-check

class RotondeBoot {
  constructor(urlFallback) {
    // Old Rotonde portals passed the client URL here,
    // but it could be easily retrieved from the <script> loading rotonde.js
    
    // Looking for <script src="*/rotonde.js"> and use it for the clientUrl instead,
    // as that prevents users from accidentally mix-and-matching clients.
    this.url = urlFallback;
    for (let script of document.getElementsByTagName("script")) {
      let src = script.src;
      if (!src.endsWith("/rotonde.js"))
        continue;
      // Remove the trailing /rotonde.js from the script source and use it as the client URL.
      this.url = src.slice(0, -("/rotonde.js".length));
      break;
    }

    // Note: This is the "boot version". For the client version, check rotonde-neu.js
    // It will still map to r.version after bootup.
    this.version = "0.5.0-dev";

    this.profileURL = localStorage.getItem("profile_archive") || window.location.origin;
  }

  load(dep) {
    return new Promise((resolve, reject) => {
      let el;
      if (dep.endsWith(".js")) {
        el = document.createElement("script");
        // el.type = "text/javascript";
        el.type = "module";
        el.src = dep;
      } else if (dep.endsWith(".css")) {
        el = document.createElement("link");
        el.type = "text/css";
        el.rel = "stylesheet";
        el.href = dep;
      }
      el.addEventListener("load", () => resolve(), false);
      el.addEventListener("error", () => reject(), false);
      document.head.appendChild(el);
    });
  }

  // The original install function isn't async.
  async install() {
    console.log("[install]", "Loading styles.");
    await Promise.all([ "reset", "fonts", "main" ].map(name => this.load(`${this.url}/links/${name}.css`)));

    if (localStorage.getItem("night") === "true") {
      document.body.parentElement.classList.add("night");
    }

    console.log("[install]", "Loading core.");
    await this.load(`${this.url}/scripts/rotonde.js`);

    // @ts-ignore
    console.log("[install]", "Booting rotonde.");    
    // @ts-ignore
    await r.init(this);
    // @ts-ignore
    await r.start();
  }
}

// Temporarily expose RotondeBoot as Rotonde to maintain compatibility with old portals.
window["Rotonde"] = RotondeBoot;

// Expose classes / objects without .ts typings available here.
var DatArchive = DatArchive || class DatArchive extends EventTarget {
  constructor(...args) {
    super();
    this.url = "";
  }
  /** @returns {any} */
  readdir(...args) {}
  /** @returns {any} */
  readFile(...args) {}
  /** @returns {any} */
  writeFile(...args) {}
  /** @returns {any} */
  stat(...args) {}
  /** @returns {any} */
  getInfo(...args) {}
  /** @returns {any} */
  mkdir(...args) {}
  /** @returns {any} */
  static selectArchive(...args) {}
  /** @returns {any} */
  static resolveName(...args) {}
}
