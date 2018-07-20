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

        if (el["rdbuild"])
            // @ts-ignore
            el = el.rdbuild();

        if (el["isRDOM"])
            // @ts-ignore
            return el;
        el["isRDOM"] = true;
        el["rdomFields"] = {};
        el["rdomStates"] = {};
        
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
        /** @type {Object.<string, {key: string, init?: function(RDOMElement) : void, get: function(RDOMElement) : string, set: function(RDOMElement, string) : void}>} */
        this.rdomFields = {};
        /** @type {Object.<string, any>} */
        this.rdomStates = {};
    }

    /**
     * Fill all rdom-field elements with the provided elements.
     * @param {any} data
     * @returns {RDOMElement}
     */
    rdomSet(data) {
        for (let key in data) {
            let field = this.querySelectorWithSelf(`[rdom-field-${key}]`);
            if (!field) {
                // Field doesn't exist, warn the user.
                console.error("[rdom]", "rdom-field not found:", key, "in", this);
                continue;
            }

            let k = field.getAttribute(`rdom-field-${key}`);
            //@ts-ignore
            field.rdomFields[k].set(field.rdomStates[k], field, data[key]);
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
            if (!field)
                return null;
            let k = field.getAttribute(`rdom-field-${keyOrObj}`);
            //@ts-ignore
            return field.rdomFields[k].get(field.rdomStates[k], field);
        }

        for (let field of this.querySelectorWithSelfAll(`[rdom-fields]`)) {
            for (let key of field.getAttribute("rdom-fields").split(" ")) {
                let k = field.getAttribute(`rdom-field-${key}`);
                // @ts-ignore
                keyOrObj[key] = field.rdomFields[k].get(field.rdomStates[k], field);
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
    _cachedTemplates: new Map(),

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
        if (!offset)
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

    /** Escapes a string into a HTML - safe format. */
    escapeHTML(m) {
        let n = "";
        for (let c of m) {
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

    /** Escapes a string into a HTML attribute - safe format. */
    escapeAttr(m) {
        let n = "";
        for (let c of m) {
            if (c === "\"")
                n += "&quot;";
            else if (c === "'")
                n += "&#039;";
            else
                n += c;
        }
        return n;
    },

    /**
     * Parse a template string into a HTML string + extra data, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {{dummies: any[], fields: any[], html: string, template: HTMLTemplateElement, rdbuild: Function}}}
     */
    rdparse$(template, ...values) {
        try {
            let dummies = [];
            let fields = [];
            let ignored = new Set();
            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];
                let t = (i = 1, c = 1) => prev.slice(-i, (-i + c) || undefined);

                if (!next && ignored.has(i)) {
                    // Ignore val.
                    return prev + next;
                }

                if (t() === "$") {
                    // Keep value as-is.
                    return prev.slice(0, -1) + val + next;
                }

                if (t() === "!" || t() === ".") {
                    // Existing element.
                    let type = t();
                    prev = prev.slice(0, -1);
                    let key = val;

                    let h = rdh.elem(key);
                    fields.push({ h: h, key: key, state: h.state });
                    val = `rdom-field-${rdom.escapeAttr(key)}="${rdom.escapeAttr(key)}"`;

                    if (type === "!") {
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
                        val += ` id="${rdom.escapeAttr(id)}"`;
                    }

                } else if (t() === "*") {
                    // Settable / gettable field.
                    prev = prev.slice(0, -1);
                    let h = val;
                    if (h instanceof Function) {
                        let args = [];
                        if (!next && values[i] instanceof Array) {
                            args = values[i];
                            ignored.add(i);
                        }
                        h = h(...args);
                    }

                    let prefix = prev.slice(prev.lastIndexOf(" ") + 1, -1);
                    let key = typeof(h) === "string" ? h : h.key;

                    if (t() === "=") {
                        // Proxy handler for attribute.
                        if (t(2) === "=") {
                            prev = prev.slice(0, -1);
                            prefix = prefix.slice(0, -1) || key;
                            h = rdh.attrCached(key, prefix);
                        } else {
                            h = rdh.attr(key, prefix);
                        }
                        h.init = (s, el) => h.set(0, el, val);
                    }

                    key = key || prefix;
                    prev = prev.slice(0, prev.lastIndexOf(" ") + 1);
                    fields.push({ h: h, key: key, state: h.state });
                    val = `rdom-field-${rdom.escapeAttr(key)}="${rdom.escapeAttr(key)}"`;

                } else if (t() === "?") {
                    // Insert a fielded rdom-empty, which will be replaced later.
                    prev = prev.slice(0, -1);
                    val = rdparse$`<rdom-empty .${val}></rdom-empty>`;

                } else if (t() === "=") {
                    // Escape attributes.
                    if (val instanceof Array)
                        val = val.join(" ");
                    val = `"${rdom.escapeAttr(val)}"`;

                } else if (!(val instanceof Node)) {
                    // Escape HTML.
                    val = rdom.escapeHTML(val);
                }

                if (val instanceof Node || (val["dummies"] && val["fields"] && val["html"])) {
                    // Replace elements with placeholders, which will be replaced later on.
                    dummies.push(val);
                    val = "<rdom-dummy></rdom-dummy>";
                }

                return prev + val + next;
            });
            
            if (dummies.length === 1 && html === "<rdom-dummy></rdom-dummy>") {
                // Special case: The element itself is being placeheld.
                //@ts-ignore
                return dummies[0];
            }

            html = html.trim();
            /** @type {HTMLTemplateElement} */
            var tmp = rdom._cachedTemplates.get(html);
            if (!tmp) {
                tmp = document.createElement("template");
                tmp.innerHTML = html;
                rdom._cachedTemplates.set(html, tmp);
            }

            let data = {
                dummies: dummies,
                fields: fields,
                html: html,
                template: tmp,
                rdbuild: () => rdbuild(data)
            };
            return data;
        } catch (e) {
            console.warn("[rdom]", "rd$ failed parsing:", String.raw(template, values), "\n", e);
            throw e;
        }
    },

    /**
     * Build the result of rdparse$ into a HTML element.
     * @param {{dummies: any[], fields: any[], html: string, template: HTMLTemplateElement}} data 
     * @returns {RDOMElement}
     */
    rdbuild(data) {
        let { dummies, fields, template: tmp } = data;
        /** @type {RDOMElement} */
        let el;
        
        // @ts-ignore
        el = new RDOMElement(document.importNode(tmp.content, true).firstElementChild);

        // Fill placeholders.
        let dummyEls = el.getElementsByTagName("rdom-dummy");
        for (let i in dummies) {
            let dummyEl = dummyEls.item(0);
            dummyEl.parentNode.replaceChild(new RDOMElement(dummies[i]), dummyEl);
        }

        // "Collect" fields.
        for (let wrap of fields) {
            let { h, key, state } = wrap;
            h = h || wrap;
            let field = new RDOMElement(el.querySelectorWithSelf(`[rdom-field-${key}]`));
            field.setAttribute(
                "rdom-fields",
                `${field.getAttribute("rdom-fields") || ""} ${key}`.trim()
            );
            field.rdomFields[key] = h;
            field.rdomStates[key] = state;
            if (h.init)
                h.init(state, field, key);
        }

        return el;
    },

    /**
     * Parse a template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {RDOMElement}
     */
    rd$(template, ...values) {
        return rdbuild(rdparse$(template, ...values));
    },

    /**
     * Parse a template string, escaping expressions unprefixed with $.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {string}
     */
    escape$(template, ...values) {
        return rdparse$(template, ...values).html;
    },

}

var rdparse$ = window["rdparse$"] = rdom.rdparse$;
var rdbuild = window["rdbuild"] = rdom.rdbuild;
var rd$ = window["rd$"] = rdom.rd$;
var escape$ = window["escape$"] = rdom.escape$;

/** Sample RDOM field handlers. */
var rdh = {
    _prepare: (h, key, state) => {
        h.key = key;
        h.state = state;
        return h;
    },

    _elem: {
        get: (s, el) => el,
        set: (s, el, value) => {
            if (value && value instanceof Function)
                value = value(el.tagName.toLowerCase() === "rdom-empty" ? null : el);
            if (value && !(value instanceof HTMLElement)) {
                // Ignore true-ish non-HTMLElement values.
                return;
            }
            if (!value) {
                // Value is false-ish, clear the field.
                el.parentElement.replaceChild(rd$`?${s.key}`, el);
                return;
            }

            // Replace (fill) the field.
            if (el !== value) {
                el.parentElement.replaceChild(value, el);
                value = new RDOMElement(value);
                if (!value.getAttribute("rdom-field-"+s.key)) {
                    value.setAttribute("rdom-field-"+s.key, s.key);
                    value.setAttribute(
                        "rdom-fields",
                        `${value.getAttribute("rdom-fields") || ""} ${s.key}`.trim()
                    );
                    value.rdomFields[s.key] = rdh._elem;
                }
            }
        }
    },
    elem: (key) => rdh._prepare(rdh._elem, key, {
        key: key,
    }),

    _attr: {
        get: (s, el) => el.getAttribute(s.name),
        set: (s, el, value) => el.setAttribute(s.name, value)
    },
    attr: (key, name) => rdh._prepare(rdh._attr, key, {
        name: name || key,
    }),

    _attrCached: {
        get: (s, el) => s.value,
        set: (s, el, value) => {
            if (value === s.value)
                return;
            s.value = value;
            el.setAttribute(s.name, value);
        }
    },
    attrCached: (key, name) => rdh._prepare(rdh._attrCached, key, {
        name: name || key,
        value: undefined,
    }),

    _toggleClass: {
        get: (s) => s.value,
        set: (s, el, value) => {
            s.value = value;
            if (value)
                el.classList.add(s.name);
            else
                el.classList.remove(s.name);
        }
    },
    toggleClass: (key, name) => rdh._prepare(rdh._toggleClass, key, {
        name: name || key,
        value: undefined,
    }),

    _toggleClasses: {
        get: (s) => s.value,
        set: (s, el, value) => {
            s.value = value;
            if (value) {
                el.classList.add(s.nameTrue);
                el.classList.remove(s.nameFalse);
            } else {
                el.classList.add(s.nameFalse);
                el.classList.remove(s.nameTrue);
            }
        }
    },
    toggleClasses: (key, nameTrue, nameFalse) => rdh._prepare(rdh._toggleClasses, key, {
        nameTrue: nameTrue,
        nameFalse: nameFalse,
        value: undefined,
    }),

    _toggleEl: {
        init: (s, el, key) => {
            s.elOrig = el;
            s.elPseudo = rd$`<rdom-empty *${rdh._prepare(rdh._toggleElPseudo, key, s)}></rdom-empty>`;
            s.elParent = el.parentElement;
        },
        get: (s) => s.elOrig.parentElement === s.elParent,
        set: (s, el, value) => {
            if (value && s.elPseudo.parentNode === s.elParent)
                s.elPseudo.parentNode.replaceChild(s.elOrig, s.elPseudo);
            else if (!value && s.elOrig.parentNode === s.elParent)
                s.elOrig.parentNode.replaceChild(s.elPseudo, s.elOrig);
        }
    },
    _toggleElPseudo: {
        get: (s) => rdh._toggleEl.get(s),
        set: (s, el, value) => rdh._toggleEl.set(s, el, value),
    },
    toggleEl: (key) => rdh._prepare(rdh._toggleEl, key, {
        elOrig: null,
        elPseudo: null,
        elParent: null,
    }),

    _textContent: {
        get: (s, el) => el.textContent,
        set: (s, el, value) => {
            if (el.textContent !== value)
                el.textContent = value
        }
    },
    textContent: (key) => rdh._prepare(rdh._textContent, key),
}
