//@ts-check

/* RDOM (rotonde dom)
 * 0x0ade's collection of DOM manipulation functions because updating innerHTML every time a single thing changes isn't cool.
 * This started out as a mini framework for Rotonde.
 * Mostly oriented towards manipulating paginated / culled ordered collections, f.e. feeds.
 */

 /**
  * RDOM helper for rd$-generated elements.
  */
 class RDOMElement extends HTMLElement {
     /**
      * @param {HTMLElement} el
      */
    constructor(el) {
        // Prevent VS Code from complaining about the lack of super()
        if (false) super();

        if (el["isRDOM"])
            // @ts-ignore
            return el;
        el["isRDOM"] = true;
        el["rdomFields"] = {};
        
        // Bind all functions from RDOMElement to the HTMLElement.
        for (let name of Object.getOwnPropertyNames(RDOMElement.prototype)) {
            if (name === "constructor")
                continue;
            el[name] = RDOMElement.prototype[name].bind(el);
        }

        // Return the modified HTMLElement.
        if (el)
            // @ts-ignore
            return el;

        // Property definitions.
        this.isRDOM = true;
        /** @type {Object.<string, {name: string, init?: function(RDOMElement) : void, get: function(RDOMElement) : string, set: function(RDOMElement, string) : void}>} */
        this.rdomFields = {};
    }

    /**
     * Fill all rdom-field elements with the provided elements.
     * @param {any} data
     * @returns {RDOMElement}
     */
    rdomSet(data) {
        for (let key in data) {
            let value = data[key];
            let field = this.querySelectorWithSelf(`[rdom-field-${key}]`);
            if (field) {
                //@ts-ignore
                new RDOMElement(field).rdomFields[field.getAttribute(`rdom-field-${key}`)].set(field, value);
                continue;
            }

            // Field doesn't exist, warn the user.
            console.error("[rdom]", "rdom-field not found:", key, "in", this);
            continue;
        }

        return this;
    }

    /**
     * Get the value of the rdom-field with the given key, or all fields into the given object.
     * @param {string | any} keyOrObj
     * @returns {RDOMElement | any | void}
     */
    rdomGet(keyOrObj) {
        if (typeof(keyOrObj) === "string") {
            let field = this.querySelectorWithSelf(`[rdom-field-${keyOrObj}]`);
            if (field) {
                //@ts-ignore
                return field.rdomFields[field.getAttribute(`rdom-field-${keyOrObj}`)].get(field);
            }
            
            return null;
        }

        let fields = this.querySelectorWithSelfAll(`[rdom-fields]`);
        for (let field of fields) {
            let keys = field.getAttribute("rdom-fields").split(" ");
            for (let key of keys) {
                // @ts-ignore
                keyOrObj[key] = field.rdomFields[field.getAttribute(`rdom-field-${key}`)].get(field);
            }
        }
    }

    /**
     * Get all fields in an object.
     * @returns {Object.<string, RDOMElement | any>}
     */
    rdomGetAll() {
        let all = {};
        this.rdomGet(all);
        return all;
    }

    querySelectorWithSelf(...args) {
        // @ts-ignore
        if (this.matches(...args))
            return this;
        // @ts-ignore
        return this.querySelector(...args);
    }

    querySelectorWithSelfAll(...args) {
        // @ts-ignore
        let found = this.querySelectorAll(...args);
        // @ts-ignore
        if (this.matches(...args))
            return [this, ...found];
        return found;
    }
 }

/**
 * A RDOM context.
 */
class RDOMCtx {
    /**
     * @param {HTMLElement} container 
     */
    constructor(container) {
        if (container["rdomCtx"])
            return container["rdomCtx"];
        
        this.container = container;
        this.container["rdomCtx"] = this;

        /** 
         * List of previously added elements.
         * This list will be checked against [added] on cleanup, ensuring that any zombies will be removed properly.
         * @type {RDOMElement[]}
         */
        this.prev = [];
        /**
         * List of [rdom.add]ed elements.
         * This list will be used and reset in [rdom.cleanup].
         * @type {RDOMElement[]}
         */
        this.added = [];

        /**
         * All current element -> object mappings.
         * @type {Map<RDOMElement, any>}
         */
        this.references = new Map();
        /**
         * All current object -> element mappings.
         * @type {Map<any, RDOMElement>}
         */
        this.elements = new Map();
    }

    /**
     * Adds or updates an element at the given index.
     * This function needs a reference object so that it can find and update existing elements for any given object.
     * @param {any} ref The reference object belonging to the element.
     * @param {number | string} index The index at which the element will be added. Set to undefined, "" or -1 for unordered containers.
     * @param {any} render The element renderer. Either function(RDOMElement, ...any) : RDOMElement, or an object with a property "render" with such a function.
     * @returns {RDOMElement} The created / updated wrapper element.
     */
    /*{function(RDOMCtx, RDOMElement, ...any) : RDOMElement}*/
    add(ref, index, render, ...args) {
        // Check if we already added an element for ref.
        // If so, update it. Otherwise create and add a new element.
        let el = this.elements.get(ref);
        let elOld = el;
        // @ts-ignore
        el = render.render ? render.render(el, ...args) : render(el, ...args);

        if (elOld) {
            if (elOld !== el)
                this.container.replaceChild(el, elOld);
        } else {
            this.container.appendChild(el);
        }

        if ((typeof(index) === "number" || (typeof(index) === "string" && index)) &&
            index > -1) {
            // Move the element to the given index.
            rdom.move(el, parseInt("" + index));
        }

        // Register the element as "added:" - It's not a zombie and won't be removed on cleanup.
        this.added.push(el);
        // Register the element as the element of ref.
        this.references.set(el, ref);
        this.elements.set(ref, el);
        return el;
    }

    /**
     * Remove an element from this context, both the element in the DOM and all references in RDOM.
     * @param {RDOMElement} el The element to remove.
     */
    remove(el) {
        if (!el)
            return;
        let ref = this.references.get(el);
        if (!ref)
            return; // The element doesn't belong to this context - no ref object found.
        // Remove the element and all related object references from the context.
        this.references.delete(el);
        this.elements.delete(ref);
        // Remove the element from the DOM.
        el.remove();
    }

    /**
     * Remove zombie elements.
     * Call this after the last [add].
     */
    cleanup() {
        for (let el of this.prev) {
            if (this.added.indexOf(el) > -1)
                continue;
            this.remove(el);
        }
        this.prev = this.added;
        this.added = [];
    }

}

var rdom = window["rdom"] = {
    _genUID: 0,

    /**
     * Move an element to a given index non-destructively.
     * @param {ChildNode} el The element to move.
     * @param {number} index The target index.
     */
    move(el, index) {
        if (!el)
            return;

        let offset = index;
        let tmp = el;
        // @ts-ignore previousElementSibling is too new?
        while (tmp = tmp.previousElementSibling)
            offset--;

        // offset == 0: We're fine.
        if (offset == 0)
            return;

        if (offset < 0) {
            // offset < 0: Element needs to be pushed "left" / "up".
            // -offset is the "# of elements we expected there not to be",
            // thus how many places we need to shift to the left.
            let swap;
            tmp = el;
            // @ts-ignore previousElementSibling is too new?
            while ((swap = tmp) && (tmp = tmp.previousElementSibling) && offset < 0)
                offset++;
            // @ts-ignore before is too new?
            swap.before(el);
            
        } else {
            // offset > 0: Element needs to be pushed "right" / "down".
            // offset is the "# of elements we expected before us but weren't there",
            // thus how many places we need to shift to the right.
            let swap;
            tmp = el;
            // @ts-ignore previousElementSibling is too new?
            while ((swap = tmp) && (tmp = tmp.nextElementSibling) && offset > 0)
                offset--;
            // @ts-ignore after is too new?
            swap.after(el);
        }
    },

    /** Escapes the string into a HTML - safe format. */
    escapeHTML(m) {
        if (!m)
            return m;

        let n = "";
        for (let i = 0; i < m.length; i++) {
            let c = m[i];

            if (c === "&")
                n += "&amp;";
            else if (c === "<")
                n += "&lt;";
            else if (c === ">")
                n += "&gt;";
            else if (c === "\"")
                n += "&quot;";
            else if (c === "'")
                n += "&#039;";
            else
                n += c;
        }
        
        return n;
    },

    /** Escapes the string into a HTML attribute - safe format. */
    escapeAttr(m) {
        if (!m)
            return m;

        let n = "";
        for (let i = 0; i < m.length; i++) {
            let c = m[i];
            if (c === "\"")
                n += "&quot;";
            else if (c === "'")
                n += "&#039;";
            else
                n += c;
        }
        
        return n;
    },

    /** Generates an unique ID. */
    genUID() {
        return `rdom-uid-${++rdom._genUID}`;
    },

    /**
     * Parse a template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {RDOMElement}
     */
    rd$(template, ...values) {
        try {
            let placeheld = [];
            let ids = {};
            let fields = [];
            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];

                if (prev[prev.length - 1] === "$") {
                    // Keep value as-is.
                    prev = prev.slice(0, -1);
                    return prev + val + next;
                }

                if (prev[prev.length - 1] === ":") {
                    // Unique string ID (UID) for given key.
                    prev = prev.slice(0, -1);
                    let key = val;
                    val = ids[key];
                    if (!val)
                        val = ids[key] = rdom.genUID();
                
                } else if (prev[prev.length - 1] === "!") {
                    // Existing element + same ID.
                    prev = prev.slice(0, -1);
                    let id = "";
                    // Convert the ID from lowerCamelCase to snake_case
                    for (var i = 0; i < val.length; i++) {
                        var c = val[i];
                        if (c !== c.toLowerCase()) {
                            id += "_";
                            c = c.toLowerCase();
                        }
                        id += c;
                    }

                    fields.push(rdh.elem(val));
                    val = `rdom-field-${rdom.escapeAttr(val)}="${rdom.escapeAttr(val)}" id="${rdom.escapeAttr(id)}"`;

                } else if (prev[prev.length - 1] === "?") {
                    // Settable / gettable field.
                    prev = prev.slice(0, -1);
                    let key = val;
                    if (prev[prev.length - 1] === "." || prev[prev.length - 1] === "*" || prev[prev.length - 1] === "=") {
                        // Field.
                        let indexOfSpace = prev.lastIndexOf(" ", prev.length - 1);
                        let prefix = prev.slice(indexOfSpace + 1, -1) || key;

                        if (prev[prev.length - 1] === ".") {
                            // Self-field.
                            val = rdh.elem(key);

                        } else if (prev[prev.length - 1] === "=") {
                            // Proxy handler for attribute.
                            val = rdh.attr(key, prefix, val);

                            if (prev[prev.length - 2] === "=") {
                                prefix = prefix.slice(0, -1) || key;
                                val = rdh.attrCached(key, prefix, val);
                                prev = prev.slice(0, -1);
                            }
                        } else 

                        prev = prev.slice(0, -1);
                        key = val.name;
                        if (!key) {
                            key = prefix;
                            val.name = key;
                        }
                        prev = prev.slice(0, indexOfSpace + 1);
                        fields.push(val);
                        val = `rdom-field-${rdom.escapeAttr(key)}="${rdom.escapeAttr(key)}"`;

                    } else {
                        // Insert rdom-empty, which will be replaced later.
                        val = rd$`<rdom-empty .?${val}></rdom-empty>`;
                    }

                } else if (prev[prev.length - 1] === "=") {
                    // Escape attributes.
                    if (val instanceof Array)
                        val = val.join(" ");
                    val = `"${rdom.escapeAttr(val)}"`;

                } else if (!(val instanceof Node)) {
                    // Escape HTML.
                    val = rdom.escapeHTML(val);
                }

                if (val instanceof Node) {
                    // Replace elements with placeholders, which will be replaced later on.
                    placeheld.push(val);
                    val = "<rdom-placeholder></rdom-placeholder>";
                }

                return prev + val + next;
            });

            /** @type {RDOMElement} */
            let el;

            if (placeheld.length === 1 && html === "<rdom-placeholder></rdom-placeholder>") {
                // Special case: The element itself is being placeheld.
                el = new RDOMElement(placeheld[0]);

            } else {
                /** @type {HTMLElement} */
                var tmp = document.createElement("template");
                tmp.innerHTML = html.trim();
                // @ts-ignore
                el = tmp.content.firstElementChild;
                if (!el) {
                    // Workaround for MS Edge from 2016 spitting out null for spans, among other things.
                    tmp = document.createElement("div");
                    tmp.innerHTML = html.trim();
                    // @ts-ignore
                    el = tmp.firstChild;
                }
                el = new RDOMElement(el);

                // Fill placeholders.
                let placeholders = el.getElementsByTagName("rdom-placeholder");
                for (let i in placeheld) {
                    let placeholder = placeholders.item(0);
                    placeholder.parentNode.replaceChild(placeheld[i], placeholder);
                }
            }

            // "Collect" fields.
            for (let h of fields) {
                let key = h.name;
                let field = new RDOMElement(el.querySelectorWithSelf(`[rdom-field-${key}]`));
                field.setAttribute(
                    "rdom-fields",
                    `${field.getAttribute("rdom-fields") || ""} ${key}`.trim()
                );
                field.rdomFields[key] = h;
                if (h.init)
                    h.init(field);
            }

            return el;
        } catch (e) {
            console.warn("[rdom]", "rd$ failed parsing", String.raw(template, values), "\n", e);
            throw e;
        }
    },

    /**
     * Parse a template string, escaping expressions unprefixed with $.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {string}
     */
    escape$(template, ...values) {
        try {
            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];

                if (prev[prev.length - 1] === "$") {
                    // Keep value as-is.
                    prev = prev.slice(0, -1);
                    return prev + val + next;
                }

                if (prev[prev.length - 1] === "=") {
                    // Escape attributes.
                    if (val instanceof Array)
                        val = val.join(" ");
                    val = `"${rdom.escapeAttr(val)}"`;

                } else {
                    // Escape HTML.
                    val = rdom.escapeHTML(val);
                }
                return prev + val + next;
            });

            return html.trim();
        } catch (e) {
            console.warn("[rdom]", "escape$ failed parsing", String.raw(template, values), "\n", e);
            throw e;
        }
    },

}

var rd$ = window["rd$"] = rdom.rd$;
var escape$ = window["escape$"] = rdom.escape$;

/** Sample RDOM field handlers. */
var rdh = {
    elem: function(key) {
        let h = {
            name: key,
            get: (el) => el,
            set: (el, value) => {
                if (value && value instanceof Function)
                    value = value(el.tagName.toLowerCase() === "rdom-empty" ? null : new RDOMElement(el));
                if (value && !(value instanceof HTMLElement)) {
                    // Ignore true-ish non-HTMLElement values.
                    return;
                }
                if (!value) {
                    // Value is false-ish, clear the field.
                    el.parentElement.replaceChild(rd$`?${key}`, el);
                    return;
                }

                // Replace (fill) the field.
                if (el !== value) {
                    el.parentElement.replaceChild(value, el);
                    value = new RDOMElement(value);
                    if (!value.getAttribute("rdom-field-"+key)) {
                        value.setAttribute("rdom-field-"+key, key);
                        value.setAttribute(
                            "rdom-fields",
                            `${value.getAttribute("rdom-fields") || ""} ${key}`.trim()
                        );
                        value.rdomFields[key] = h;
                    }
                }
            }
        };
        return h;
    },

    attr: function(key, attribute, start) {
        attribute = attribute || key;
        let h = {
            name: key,
            init: (el) => h.set(el, start),
            get: (el) => el.getAttribute(attribute),
            set: (el, value) => {
                el.setAttribute(attribute, value);
            }
        };
        return h;
    },

    attrCached: function(key, attribute, start) {
        let h = rdh.attr(key, attribute, start);
        h.get = () => h.value;
        h.set = ((set) => (el, value) => {
            if (value === h.value)
                return;
            h.value = value;
            set(el, value);
        })(h.set);
        return h;
    },

    toggleClass: function(key, className, start) {
        className = className || key;
        let h = {
            value: false,

            name: key,
            init: (el) => {
                h.set(el, start);
            },
            get: () => h.value,
            set: (el, value) => {
                h.value = value;
                if (value)
                    el.classList.add(className);
                else
                    el.classList.remove(className);
            }
        };
        return h;
    },

    toggleClasses: function(key, classNameTrue, classNameFalse, start) {
        let h = {
            value: false,

            name: key,
            init: (el) => {
                h.set(el, start);
            },
            get: () => h.value,
            set: (el, value) => {
                h.value = value;
                if (value) {
                    el.classList.add(classNameTrue);
                    el.classList.remove(classNameFalse);
                } else {
                    el.classList.add(classNameFalse);
                    el.classList.remove(classNameTrue);
                }
            }
        };
        return h;
    },
      
    toggleEl: function(key, start) {
        let h = {
            elOrig: null,
            elPseudo: null,

            name: key,
            init: (el) => {
                h.elOrig = el;
                h.elPseudo = rd$`<rdom-empty *?${{
                    name: h.name,
                    get: h.get,
                    set: h.set
                }}></rdom-empty>`;
                h.set(el, start);
            },
            get: () => h.elOrig.parentNode !== null,
            set: (el, value) => {
                if (value && h.elPseudo.parentNode)
                    h.elPseudo.parentNode.replaceChild(h.elOrig, h.elPseudo);
                else if (!value && h.elOrig.parentNode)
                    h.elOrig.parentNode.replaceChild(h.elPseudo, h.elOrig);
            }
        };
        return h;
    },

    textContent: function(key) {
        return {
            name: key,
            get: (el) => el.textContent,
            set: (el, value) => {
                if (el.textContent !== value)
                    el.textContent = value
            }
        };
    },
}
