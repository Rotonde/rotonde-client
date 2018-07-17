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
  }

  // The original install function isn't async.
  async install() {
    // Load lazyman itself. Old Rotonde portals only depend on rotonde.js
    if (!window["lazyman"]) {
      console.log("[install]", "Loading lazyman.");
      await new Promise((resolve, reject) => {
        let script = document.createElement("script");
        script.type = "text/javascript";
        script.src = this.url + "/deps/lazyman.js";
        script.addEventListener("load", () => resolve(), false);
        script.addEventListener("error", () => reject(), false);
        document.head.appendChild(script);
      });
    }

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

    // Wrapper around lazyman.all which runs updateProgress.
    let load = (deps, ordered) => lazyman.all(
      deps, ordered,
      id => updateProgress(id, true),
      id => updateProgress(id, false),
    );

    console.log("[install]", "Loading styles.");
    await load(this.requirements.style.map(name => `${this.url}/links/${name}.css`));
    lazyman.load(`${window.location.origin}/links/custom.css`).then(() => {}, () => {});
    console.log("[install]", "Loading deps.");
    await load(this.requirements.dep.map(name => `${this.url}/deps/${name}.js`));
    console.log("[install]", "Loading scripts.");
    await load(this.requirements.script.map(name => `${this.url}/scripts/${name}.js`));
    console.log("[install]", "Loading core.");
    await load(this.requirements.core.map(name => `${this.url}/scripts/${name}.js`), true);
    lazyman.load(`${window.location.origin}/links/custom.js`).then(() => {}, () => {});

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
