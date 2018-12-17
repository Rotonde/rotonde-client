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

    // Workaround for dat-fox.
    if (window.location.protocol === "http:" && this.url.startsWith("http:")) {
      this.url = "https:" + this.url.slice(5);
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
      el.addEventListener("error", (...args) => {
        console.error(...args);
        reject(args);
      }, false);
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

// URL dat:// hostname fix for non-Beaker envs.
if (new URL("dat://test").hostname !== "test") {
  let prop = Object.getOwnPropertyDescriptor(window.URL.prototype, "hostname");
  
  prop.get = ((orig) => function() {
      let hostname = orig.apply(this);
    if (!hostname && this.protocol === "dat:") {
      /** @type {string} */
      hostname = this.pathname.substr(2);
      let end = hostname.indexOf("/");
      if (end !== -1)
        hostname = hostname.substr(0, end - 1);
    }
    return hostname;
  })(prop.get);
  
  Object.defineProperty(window.URL.prototype, "hostname", prop);
}

// fetch() dat:// fix for non-Beaker envs. 
fetch("dat://").catch(e => {
  // Beaker complains about parsing a broken URL.
  // Chrome and Firefox complain about a network / fetch failure. 
  if (e.message.indexOf("URL") !== -1)
    return;

  window.fetch = ((orig) => function(input, init) {
    let url = input;
    if (typeof(input) === "object") {
      url = input instanceof URL ? input.toString() : input.url;
    }

    if (url.startsWith("dat:")) {
      // Let's use DatArchive, as it either uses dat-fox's or our own DatArchive.
      return (async function __fetch_dat(resolve, reject) {
        let archive = new DatArchive(url);
        let path = url;
        path = path.slice(path.indexOf("/", 6));

        /** @type {ArrayBuffer} */
        //@ts-ignore
        let data = await archive.readFile(path, { "encoding": "binary" });
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(data));
            controller.close();
          }
        }));
      })();
    }

    return orig(input, init);
  })(window.fetch);
});

// DatArchive shim for both VS Code @ts-check and for non-Beaker envs.
var DatArchive = DatArchive || class DatArchive extends EventTarget {
  /**
   * Create a Dat archive instance from an existing archive.
   * @param {string} url The URL of the archive to instantiate.
   */
  constructor(url) {
    super();

    let _url;
    try {
      _url = new URL(url);
    } catch (e) {
      if (url.startsWith("//")) {
        url = "dat:" + url;
      } else {
        url = "dat://" + url;
      }
      _url = new URL(url);
    }
    
    this.url = "dat://" + _url.hostname;
    this._url = "//" + _url.hostname;

    console.warn(`[shim:DatArchive] Constructed: ${url}`);    
  }

  /**
   * Create a Dat archive instance from an existing archive. This has the same effect as using the constructor, but allows you to await until load is successful.
   * @param {string} url The URL of the archive to instantiate.
   * @returns {Promise<DatArchive>}
   */
  static async load(url) {
    return new DatArchive(url);
  }

  static async create(opts) {
    throw new Error("Not supported!");
  }

  static async fork(url, opts) {
    throw new Error("Not supported!");
  }

  static async unlink(url) {
    throw new Error("Not supported!");
  }

  static async selectArchive(opts) {
    throw new Error("Not supported!");
  }

  static async resolveName(url) {
    let _url;
    try {
      _url = new URL(url);
    } catch (e) {
      if (url.startsWith("//")) {
        url = "dat:" + url;
      } else {
        url = "dat://" + url;
      }
      _url = new URL(url);
    }
    return _url.hostname;
  }

  async getInfo(opts) {
    return {
      key: "",
      url: this.url,
      isOwner: false,

      version: 0,
      peers: 0,
      mtime: 0,
      size: 0,

      title: "",
      description: "",
      type: [],
      links: ""
    };
  }

  async configure(opts) {
    throw new Error("Not supported!");
  }

  async stat(path, opts) {
    throw new Error("Not supported!");
  }

  async readFile(path, opts) {
    if (path && path[0] !== "/")
      path = "/" + path;

    let {
      encoding = ""
    } = opts || {};

    let r = await fetch(this._url + path);
    switch (encoding) {
      case "utf8":
      case "utf-8":
      default:
        return await r.text();
      
      case "base64":
      case "hex":
        throw new Error("Not supported!");
      
      case "binary":
        return await r.arrayBuffer();
    }
  }

  async readdir(path, opts) {
    // THANKS, HASHBASE!
    // @ts-ignore
    let data = JSON.parse(await this.readFile(path, !opts ? undefined : {
      timeout: opts.timeout
    }));
    
    if (!opts || !opts.stat)
      data = data.map(entry => entry.path);
    return data;
  }

  async writeFile(path, data, opts) {
    throw new Error("Not supported!");
  }

  async mkdir(path) {
    throw new Error("Not supported!");
  }

  async unlink(path) {
    throw new Error("Not supported!");
  }

  async rmdir(path, opts) {
    throw new Error("Not supported!");
  }

  async copy(path, dstPath, opts) {
    throw new Error("Not supported!");
  }

  async rename(oldPath, newPath, opts) {
    throw new Error("Not supported!");
  }

  async history(opts) {
    throw new Error("Not supported!");
  }

  checkout(version) {
    throw new Error("Not supported!");
  }

  async download(path, opts) {
    throw new Error("Not supported!");
  }

  watch(path, onInvalidated) {
    throw new Error("Not supported!");
  }

}
