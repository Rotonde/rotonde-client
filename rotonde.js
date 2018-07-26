//@ts-check
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

    this.requirements = {
      // Stylesheets located in the links directory.
      style: [ "reset", "fonts", "main" ],
      // Base dependencies which don't depend on each other.
      dep: [ "rdom", "rotondb", "jlz-mini" ],
      // Core Rotonde components. Named "script" and located in "scripts" to maintain backwards compatibility.
      script: [ "util", "home", "portal", "feed", "entry", "operator", "embed", "status" ],
      // Load rotonde-neu.js, and any other dependencies which must be loaded in the correct order.
      core: [ "embed", "embed_providers", "rotonde-neu" ]
    };

    // TODO: Make main-neu style optional.
    this.styleNeu = true;
    if (this.styleNeu) {
      this.requirements.style.push("main-neu");
    }
  }

  

  // The original install function isn't async.
  async install() {
    let loaded = new Set();
    let failed = new Set();
    // Dependencies can manipulate the total count after the fact.
    let depsTotal = () => this.requirements.style.length + this.requirements.dep.length + this.requirements.script.length;

    // Update the splash screen's progress bar.
    let updateProgress = (id, success) => {
      console.log("[install]", id, success ? "loaded." : "failed loading!");
      (success ? loaded : failed).add(id);
      if (!success) {
        return;
      }
    }

    let load = (dep) => new Promise((resolve, reject) => {
      let el;
      if (dep.endsWith(".js")) {
        el = document.createElement("script");
        el.type = "text/javascript";
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
    })

    let loadAll = (deps, ordered) => {
      let all = [];
      let pPrev = Promise.resolve();
      for (let dep of deps) {
        let p;
        p = ordered ? pPrev.then(() => load(dep)) : load(dep);
        p.then(() => updateProgress(dep, true), () => updateProgress(dep, false));
        pPrev = p;
        all.push(p);
      }
      return Promise.all(all);
    }

    console.log("[install]", "Loading styles.");
    await loadAll(this.requirements.style.map(name => `${this.url}/links/${name}.css`));
    load(`${window.location.origin}/links/custom.css`).then(() => {}, () => {});

    console.log("[install]", "Loading deps.");
    await loadAll(this.requirements.dep.map(name => `${this.url}/deps/${name}.js`));

    console.log("[install]", "Loading scripts.");
    await loadAll(this.requirements.script.map(name => `${this.url}/scripts/${name}.js`));

    console.log("[install]", "Loading core.");
    await loadAll(this.requirements.core.map(name => `${this.url}/scripts/${name}.js`), true);
    load(`${window.location.origin}/links/custom.js`).then(() => {}, () => {});

    console.log("[install]", "Booting rotonde-neu.");    
    await new Rotonde(this).start();
  }
}

// Temporarily expose RotondeBoot as Rotonde to maintain compatibility with old portals.
window["Rotonde"] = RotondeBoot;
/** @type {Rotonde} */
var r = null;

// Expose classes / objects without .ts typings available here.
var DatArchive = DatArchive || class DatArchive extends EventTarget {
  constructor(...args) {
    super();
    this.url = "";
  }
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
