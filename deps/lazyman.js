//@ts-check

/* LazyMan
 * 0x0ade's quick and dirty dependency manager.
 * Best explained with the following code example:
 */
/*
// Set the default prefixes.
lazyman.prefixes[""] = "./";
lazyman.prefixes["css"] = "./css/";
lazyman.prefixes["js"] = "./js/";

// Core (critical) dependencies.
await lazyman.all([
    // Located inside ./js/
    "rdom.js",
    "js-yaml.min.js",

    // Located outside of ./css/ and ./js/
    "https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-beta/css/materialize.min.css",
    "https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-beta/js/materialize.min.js",

    // Located inside ./css/
    "main.css",
    // Located inside ./js/
    "utils.js",
]);

// main.js and other "weak" dependencies.
await lazyman.all([
    // Located inside ./js/
    "main.js",
]);

// Do something after everything finished loading, f.e. hiding the preloader / splash.
document.getElementById("splash").classList.add("hidden");
*/

class LazyMan {
    constructor() {
        /** @type {any} */
        this._loading = {};
        /** @type {Set<string>} */
        this._loaded = new Set();
        /** @type {any} */
        this._cache = {};

        /**
         * The default prefixes for the resource types.
         * @type {any}
         */
        this.prefixes = {
            "": "./",
            "css": "/css/",
            "js": "/js/",
        };

        this.logResolve = false;
        this.logReject = true;

        /**
         * The default loaders for the resource types.
         * The loader functions share their params with LazyMan's load function.
         * @type {any}
         */
        this.loaders = {
            "DOM": (id, url) => {
                if (typeof(document) === "undefined")
                    throw new Error("No DOM!")
                if (document.readyState === "complete")
                    this.resolve(id, document);
            },

            "css": (id, url) => {
                let style = document.createElement("link");
                style.type = "text/css";
                style.rel = "stylesheet";
                style.href = url;
                style.addEventListener("load", () => this.resolve(id, style), false);
                style.addEventListener("error", () => this.reject(id), false);
                document.head.appendChild(style);
            },

            "js": (id, url) => {
                let script = document.createElement("script");
                script.type = "text/javascript";
                script.src = url;
                script.addEventListener("load", () => this.resolve(id, script), false);
                script.addEventListener("error", () => this.reject(id), false);
                document.head.appendChild(script);
            },

            "txt": (id, url) => {
                let eFix = new Error();
                fetch(url).then(response => {
                    if (!response.ok && !response.redirected)
                        throw (eFix.message = response.statusText, eFix);
                    return response;
                }).then(response => response.text()).then(text => {
                    this.resolve(id, text);
                }).catch(reason => this.reject(id, reason));
            },

            "yaml": (id, url) => {
                let eFix = new Error();
                fetch(url).then(response => {
                    if (!response.ok && !response.redirected)
                        throw (eFix.message = response.statusText, eFix);
                    return response;
                }).then(response => response.text()).then(text => {
                    if (window["jsyaml"])
                        this.resolve(id, window["jsyaml"].load(text));
                    else
                        this.resolve(id, text);
                }).catch(reason => this.reject(id, reason));
            },
        };
    }

    /**
     * Lazy-load the given resource.
     * @param {string} id The resource ID.
     * @param {string} [url] The resource URL. Can be undefined if the resource URL is located at prefix + id.
     * @param {string} [type] The type, f.e. "js", if it doesn't match the URL ending.
     * @returns {Promise<any>} A promise returning the dependency if applicable.
     */
    load(id, url, type) {
        if (!url)
            url = id;
        
        if (!type) {
            let indexOfEnding = id.lastIndexOf(".");
            type = id.slice(indexOfEnding + 1);
        }

        let indexOfProtocol = url.indexOf("://");
        if (indexOfProtocol === -1 || indexOfProtocol >= 8) {
            if (this.prefixes[type])
                url = this.prefixes[type] + url;
            else if (this.prefixes[""])
                url = this.prefixes[""] + url;
        }

        if (this._loaded.has(id))
            return Promise.resolve(this._cache[id]);

        if (this._loading[id])
            return this._loading[id].promise;
        
        this._loading[id] = {};
        return this._loading[id].promise = new Promise((resolve, reject) => {
            this._loading[id].resolve = resolve;
            this._loading[id].reject = reject;

            let loader = this.loaders[type];
            if (!loader) {
                this.reject(id, new Error(`No loader for type ${type}`));
                return;
            }
            try {
                loader(id, url, type);
            } catch (e) {
                this.reject(id, e);
            }
        });
    }

    /**
     * Lazy-load all resources (dependencies).
     * @param {any[]} deps The dependency list, accepting either the IDs / URLs or the parameters when calling load.
     * @param {boolean} ordered Should the dependencies be loaded in order? Defaults to false.
     * @param {function(string)} [onfulfilled] The optional per-dependency resolve callback.
     * @param {function(string)} [onrejected] The optional per-dependency reject callback.
     * @returns {Promise<any[]>} A promise.
     */
    all(deps, ordered, onfulfilled, onrejected) {
        let all = [];
        let pPrev = Promise.resolve();
        for (let dep of deps) {
            let p;
            if (typeof(dep) === "string") {
                p = ordered ? pPrev.then(() => this.load(dep)) : this.load(dep);
                p.then(() => onfulfilled(dep), () => onrejected(dep));

            } else {
                // Arguments for load.
                p = ordered ? pPrev.then(() => this.load.apply(this, dep)) : this.load.apply(this, dep);
                p.then(() => onfulfilled(dep[0]), () => onrejected(dep[0]));
            }
            pPrev = p;
            all.push(p);
        }
        return Promise.all(all);
    }

    /**
     * Register the ID as "loaded", resolving all promises waiting for it.
     * @param {string} id The ID to register as "loaded".
     * @param {any} [data] The optional data related to the resource. 
     */
    resolve(id, data) {
        if (this._loaded.has(id))
            return;
        let loading = this._loading[id];

        if (this.logResolve)
            console.log("[lazyman]", "Resolved:", id);

        this._loaded.add(id);
        this._loading[id] = undefined;
        this._cache[id] = data;

        if (loading)
            loading.resolve(data);
    }

    /**
     * Register the ID as "failed loading", rejecting all promises waiting for it.
     * @param {string} id The ID to register as "failed loading".
     * @param {any} [reason] The optional reason.
     */
    reject(id, reason) {
        let loading = this._loading[id];
        if (!loading)
            return;

        if (this.logReject)
            console.error("[lazyman]", "Rejected:", id, reason);

        this._loading[id] = undefined;

        loading.reject(reason);
    }

}

const lazyman = window["lazyman"] = new LazyMan();
lazyman.resolve("lazyman.js");
// @ts-ignore
if (typeof(document) != "undefined") {
// @ts-ignore
    document.addEventListener("DOMContentLoaded", () => lazyman.resolve("DOM"), false);
}
