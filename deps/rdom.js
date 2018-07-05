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
        el["rdomFieldHandlers"] = {};
        
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
        this.rdomFieldHandlers = {};
    }

    /**
     * Fill all rdom-field elements with the provided elements.
     * @param {any} data
     * @returns {RDOMElement}
     */
    rdomSet(data) {
        for (let key in data) {
            let value = data[key];
            let field = this.querySelectorWithSelf(`[rdom-field=${key}]`);
            if (field) {
                if (value && !(value instanceof HTMLElement)) {
                    // Ignore true-ish non-HTMLElement values.
                    continue;
                }
                if (!value) {
                    // Value is false-ish, clear the field.
                    field.parentElement.replaceChild(rd$`?${key}`, field);
                    continue;
                }
    
                // Replace (fill) the field.
                if (field != value)
                    field.parentElement.replaceChild(value, field);
                new RDOMElement(value).setAttribute("rdom-field", key);
                continue;
            }

            let fieldEl = this.querySelectorWithSelf(`[rdom-fieldattrib-${key}]`);
            if (fieldEl) {
                //@ts-ignore
                fieldEl.setAttribute(
                    fieldEl.getAttribute(`rdom-fieldattrib-${key}`),
                    value
                );
                continue;
            }

            fieldEl = this.querySelectorWithSelf(`[rdom-fieldhandler-${key}]`);
            if (fieldEl) {
                //@ts-ignore
                new RDOMElement(fieldEl).rdomFieldHandlers[fieldEl.getAttribute(`rdom-fieldhandler-${key}`)].set(fieldEl, value,);
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
            let field = this.querySelectorWithSelf(`[rdom-field=${keyOrObj}]`);
            if (field)
                //@ts-ignore
                return field.tagName.toLowerCase() === "rdom-field" ? null : new RDOMElement(field);
            
            let fieldEl = this.querySelectorWithSelf(`[rdom-fieldattrib-${keyOrObj}]`);
            if (fieldEl) {
                //@ts-ignore
                return fieldEl.getAttribute(fieldEl.getAttribute(`rdom-fieldattrib-${keyOrObj}`));
            }

            fieldEl = this.querySelectorWithSelf(`[rdom-fieldhandler-${keyOrObj}]`);
            if (fieldEl) {
                //@ts-ignore
                return fieldEl.rdomFieldHandlers[fieldEl.getAttribute(`rdom-fieldhandler-${keyOrObj}`)].get(fieldEl);
            }
            
            return null;
        }

        let fields = this.querySelectorWithSelfAll(`[rdom-field]`);
        for (let field of fields) {
            let key = field.getAttribute("rdom-field");
            if (keyOrObj[key] !== null && typeof(keyOrObj[key]) !== "undefined" &&
                !(keyOrObj[key] instanceof HTMLElement))
                continue;
            // @ts-ignore
            keyOrObj[key] = field.tagName.toLowerCase() === "rdom-field" ? null : new RDOMElement(field);
        }

        let fieldEls = this.querySelectorWithSelfAll(`[rdom-fieldattribs]`);
        for (let fieldEl of fieldEls) {
            let keys = fieldEl.getAttribute("rdom-fieldattribs").split(" ");
            for (let key of keys) {
                // @ts-ignore
                keyOrObj[key] = fieldEl.getAttribute(fieldEl.getAttribute(`rdom-fieldattrib-${key}`));
            }
        }

        fieldEls = this.querySelectorWithSelfAll(`[rdom-fieldhandlers]`);
        for (let fieldEl of fieldEls) {
            let keys = fieldEl.getAttribute("rdom-fieldhandlers").split(" ");
            for (let key of keys) {
                // @ts-ignore
                keyOrObj[key] = fieldEl.rdomFieldHandlers[fieldEl.getAttribute(`rdom-fieldhandler-${key}`)].get(fieldEl);
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
  * RDOM helper for RDOMCtx.
  */
 class RDOMContainer extends HTMLElement {
    /**
     * @param {HTMLElement} el
     */
    constructor(el) {
        // Prevent VS Code from complaining about the lack of super()
        if (false) super();

        if (el["isRDOMCtx"])
            // @ts-ignore
            return el;
        el["isRDOMCtx"] = true;
        
        // @ts-ignore
        el["rdomCtx"] = new RDOMCtx(el);

        // Return the modified HTMLElement.
        if (el)
            // @ts-ignore
            return el;

        // Fields.
        /** @type {RDOMCtx} */
        this.rdomCtx = null;
    }
}

/**
 * A RDOM context.
 */
class RDOMCtx {
    /**
     * @param {RDOMContainer} container 
     */
    constructor(container) {
        if (!container["isRDOMCtx"])
            container = new RDOMContainer(container);
        if (container.rdomCtx)
            return container.rdomCtx;
        
        this.container = container;
        this.container.rdomCtx = this;

        /**
         * Culling setup.
         */
        this._cull = {
            active: false,
            min: -1,
            max: -1,
            offset: 0,
        };

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
     * Sets up a culling context with the given parameters.
     * @param {number} min Minimum index, inclusive.
     * @param {number} max Maximum index, exclusive.
     * @param {number} offset Offset, which will be used when calculating the actual index.
     */
    cull(min, max, offset) {
        this._cull.active = true;
        if (min === -1 || max === -1 ||
            min === undefined || max === undefined) {
            this._cull.active = false;
            min = max = -1;
        }
        this._cull.min = min;
        this._cull.max = max;

        this._cull.offset = offset !== undefined ? offset : 0;
    }

    /**
     * Adds or updates an element at the given index.
     * This function needs a reference object so that it can find and update existing elements for any given object.
     * @param {any} ref The reference object belonging to the element.
     * @param {number | string} index The index at which the element will be added. Set to undefined, "" or -1 for unordered containers.
     * @param {any} render The element renderer. Either function(RDOMCtx, RDOMElement, ...any) : RDOMElement, or an object with a property "render" with such a function.
     * @returns {RDOMElement} The created / updated wrapper element.
     */
    /*{function(RDOMCtx, RDOMElement, ...any) : RDOMElement}*/
    add(ref, index, render, ...args) {
        if (this._cull.active && (index < this._cull.min || this._cull.max <= index)) {
            // Out of bounds - remove if existing, don't add.
            this.removeRef(ref);
            return null;
        }

        // Check if we already added an element for ref.
        // If so, update it. Otherwise create and add a new element.
        let el = this.elements.get(ref);
        let elOld = el;
        // @ts-ignore
        el = render.render ? render.render(this, el, ...args) : render(this, el, ...args);

        if (elOld) {
            if (elOld !== el)
                this.container.replaceChild(el, elOld);
        } else {
            this.container.appendChild(el);
        }

        if ((typeof(index) === "number" || (typeof(index) === "string" && index)) &&
            index > -1) {
            // Move the element to the given index.
            rdom.move(el, parseInt("" + index) + this._cull.offset);
        }

        // Register the element as "added:" - It's not a zombie and won't be removed on cleanup.
        this.added.push(el);
        // Register the element as the element of ref.
        this.references.set(el, ref);
        this.elements.set(ref, el);
        return el;
    }

    /**
     * Removes an object's element from this context, both the element in the DOM and all references in RDOM.
     * @param {any} ref The reference object of the element to remove.
     */
    removeRef(ref) {
        if (!ref)
            return;
        var el = this.elements.get(ref);
        if (!el)
            return; // The ref object doesn't belong to this context - no element found.
        // Remove the element and all related object references from the context.
        this.elements.delete(ref);
        this.references.delete(el);
        // Remove the element from the DOM.
        el.remove();
    }

    /**
     * Remove an element from this context, both the element in the DOM and all references in RDOM.
     * @param {RDOMElement} el The element to remove.
     */
    removeElement(el) {
        if (!el)
            return;
        var ref = this.references.get(el);
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
        for (var el of this.prev) {
            if (this.added.indexOf(el) > -1)
                continue;
            this.removeElement(el);
        }
        this.prev = this.added;
        this.added = [];
    }

}

class RDOM {
    constructor() {
        this._genID = 0;
        this.rd$ = this.rd$.bind(this);
        this.escape$ = this.escape$.bind(this);
    }

    /**
     * Move an element to a given index non-destructively.
     * @param {ChildNode} el The element to move.
     * @param {number} index The target index.
     */
    move(el, index) {
        if (!el)
            return;

        var offset = index;
        var tmp = el;
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
            var swap;
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
            var swap;
            tmp = el;
            // @ts-ignore previousElementSibling is too new?
            while ((swap = tmp) && (tmp = tmp.nextElementSibling) && offset > 0)
                offset--;
            // @ts-ignore after is too new?
            swap.after(el);
        }
    }

    /** Escapes the string into a HTML - safe format. */
    escapeHTML(m) {
        if (!m)
            return m;

        var n = "";
        for (var i = 0; i < m.length; i++) {
            var c = m[i];

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
    }

    /** Escapes the string into a HTML attribute - safe format. */
    escapeAttr(m) {
        if (!m)
            return m;

        var n = "";
        for (var i = 0; i < m.length; i++) {
            var c = m[i];
            if (c === "\"")
                n += "&quot;";
            else if (c === "'")
                n += "&#039;";
            else
                n += c;
        }
        
        return n;
    }

    /** Generates an unique ID. */
    genID() {
        return `rdom-id-${++this._genID}`;
    }

    /**
     * Parse a template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {RDOMElement}
     */
    rd$(template, ...values) {
        try {
            /** @type {function(RDOMElement)} */
            let postprocessor = undefined;

            let placeheld = [];
            let ids = {};
            let fieldAttribs = [];
            let fieldHandlers = [];
            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];

                if (prev[prev.length - 1] === "$") {
                    // Keep value as-is.
                    prev = prev.slice(0, -1);
                    return prev + val + next;
                }

                if (prev[prev.length - 1] === ":") {
                    // Command.
                    prev = prev.slice(0, -1);
                    if (val.startsWith("id:")) {
                        let idKey = val.slice(3);
                        val = ids[idKey];
                        if (!val)
                            val = ids[idKey] = rdom.genID();
                    }
                }
                
                if (prev[prev.length - 1] === ">" && val instanceof Function) {
                    // Postprocessor.
                    prev = prev.slice(0, -1);
                    postprocessor = val;
                    val = "";

                } else if (prev[prev.length - 1] === "?") {
                    // Settable / gettable field.
                    prev = prev.slice(0, -1);
                    let key = val;
                    if (prev[prev.length - 1] === "=") {
                        // Attribute-field.
                        fieldAttribs.push(val);
                        val = `"" rdom-fieldattrib-${this.escapeAttr(key)}="${this.escapeAttr(prev.slice(prev.lastIndexOf(" ") + 1, -1))}"`;

                    } else if (prev[prev.length - 1] === "*") {
                        // Handler-field.
                        prev = prev.slice(0, -1);
                        let indexOfSpace = prev.lastIndexOf(" ");
                        key = val.name;
                        if (!key) {
                            key = prev.slice(indexOfSpace + 1, -1);
                            val.name = key;
                        }
                        prev = prev.slice(0, indexOfSpace + 1);
                        fieldHandlers.push(val);
                        val = `rdom-fieldhandler-${this.escapeAttr(key)}="${this.escapeAttr(key)}"`;

                    } else if (prev[prev.length - 1] === ".") {
                        // Existing element.
                        prev = prev.slice(0, -1);
                        val = `rdom-field="${this.escapeAttr(key)}"`;

                    } else if (prev[prev.length - 1] === "!") {
                        // Existing element + same ID.
                        prev = prev.slice(0, -1);
                        let id = "";
                        // Convert the ID from lowerCamelCase to snake_case
                        for (var i = 0; i < key.length; i++) {
                            var c = key[i];
                            if (c !== c.toLowerCase()) {
                                id += "_";
                                c = c.toLowerCase();
                            }
                            id += c;
                        }

                        val = `rdom-field="${this.escapeAttr(key)}" id="${this.escapeAttr(id)}"`;

                    } else {
                        // Insert rdom-field, which will be replaced later.
                        val = `<rdom-field rdom-field="${this.escapeAttr(key)}"></rdom-field>`;
                    }

                } else if (val instanceof Node) {
                    // Replace elements with placeholders, which will be replaced later on.
                    placeheld[placeheld.length] = val;
                    val = "<rdom-placeholder></rdom-placeholder>";
                
                } else if (prev[prev.length - 1] === "=") {
                    // Escape attributes.
                    if (val instanceof Array)
                        val = val.join(" ");
                    val = `"${this.escapeAttr(val)}"`;

                } else {
                    // Escape HTML.
                    val = this.escapeHTML(val);
                }
                return prev + val + next;
            });

            /** @type {HTMLElement} */
            var tmp = document.createElement("template");
            tmp.innerHTML = html.trim();
            /** @type {RDOMElement} */
            // @ts-ignore
            let el = tmp.content.firstElementChild;
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

            // "Collect" fieldattribs.
            for (let key of fieldAttribs) {
                let fieldEl = new RDOMElement(el.querySelectorWithSelf(`[rdom-fieldattrib-${key}]`));
                fieldEl.setAttribute(
                    "rdom-fieldattribs",
                    `${fieldEl.getAttribute("rdom-fieldattribs") || ""} ${key}`.trim()
                );
            }

            // "Collect" fieldhandlers.
            for (let handler of fieldHandlers) {
                let key = handler.name;
                let fieldEl = new RDOMElement(el.querySelectorWithSelf(`[rdom-fieldhandler-${key}]`));
                fieldEl.setAttribute(
                    "rdom-fieldhandlers",
                    `${fieldEl.getAttribute("rdom-fieldhandlers") || ""} ${key}`.trim()
                );
                fieldEl.rdomFieldHandlers[key] = handler;
                if (handler.init)
                    handler.init(fieldEl);
            }

            return postprocessor ? postprocessor(el) || el : el;
        } catch (e) {
            console.warn("[rdom]", "rd$ failed parsing", String.raw(template, values), "\n", e);
            throw e;
        }
    }

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
                    val = `"${this.escapeAttr(val)}"`;

                } else {
                    // Escape HTML.
                    val = this.escapeHTML(val);
                }
                return prev + val + next;
            });

            return html.trim();
        } catch (e) {
            console.warn("[rdom]", "escape$ failed parsing", String.raw(template, values), "\n", e);
            throw e;
        }
    }

}

var rdom = window["rdom"] = new RDOM();
var rd$ = window["rd$"] = rdom.rd$;
var escape$ = window["escape$"] = rdom.escape$;

/** Sample RDOM field handlers. */
var rdh = {
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
            set: (el, value) => el.textContent = value
        };
    }
}
