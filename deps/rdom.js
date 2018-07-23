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

        if (el["render"])
            // @ts-ignore
            el = el.render();

        if (el["isRDOM"])
            // @ts-ignore
            return el;
        el["isRDOM"] = true;
        el["rdomFields"] = {};
        el["rdomStates"] = {};
        
        // Bind all functions from RDOMElement to the HTMLElement.
        for (let name of Object.getOwnPropertyNames(RDOMElement.prototype)) {
            if (name !== "constructor")
                el[name] = RDOMElement.prototype[name].bind(el);
        }

        // Return the modified HTMLElement.
        if (el)
            // @ts-ignore
            return el;

        // Property definitions.
        /** @type {boolean} */
        this.isRDOM =
        /** @type {Object.<string, {key: string, init?: function(RDOMElement) : void, get: function(RDOMElement) : string, set: function(RDOMElement, string) : void}>} */
        this.rdomFields =
        /** @type {Object.<string, any>} */
        this.rdomStates =
        undefined;
    }

    /**
     * Fill all rdom-field elements with the provided elements.
     * @param {any} data
     * @returns {RDOMElement}
     */
    rdomSet(data) {
        for (let key in data) {
            let field = this._rdomFind(key);
            if (!field) {
                // Field doesn't exist, warn the user.
                console.error("[rdom]", "rdom-field not found:", key, "in", this);
                continue;
            }

            //@ts-ignore
            field.rdomFields[key].set(field.rdomStates[key], field, data[key]);
        }

        return this;
    }

    /**
     * Get the value of the rdom-field with the given key, or all fields into the given object.
     * @param {string | any} keyOrObj
     * @returns {any}
     */
    rdomGet(keyOrObj) {
        if (typeof(keyOrObj) === "string") {
            let field = this._rdomFind(keyOrObj);
            if (!field)
                return null;
            //@ts-ignore
            return field.rdomFields[keyOrObj].get(field.rdomStates[keyOrObj], field);
        }

        for (let field of this._rdomFindAll()) {
            for (let key of field.getAttribute("rdom-fields").split(" ")) {
                // @ts-ignore
                keyOrObj[key] = field.rdomFields[key].get(field.rdomStates[key], field);
            }
        }
    }

    /**
     * Get all fields in an object.
     * @returns {Object.<string, any>}
     */
    rdomGetAll() {
        let all = {};
        this.rdomGet(all);
        return all;
    }

    _rdomFind(key, value = "", type = "field", ...args) {
        let sel = rdom._sel(key, value, type);
        // @ts-ignore
        if (this.matches(sel, ...args))
            return this;
        // @ts-ignore
        return this.querySelector(sel, ...args);
    }

    _rdomFindAll(key, value = "", type = "field", ...args) {
        let sel = rdom._sel(key, value, type);
        // @ts-ignore
        let found = this.querySelectorAll(sel, ...args);
        // @ts-ignore
        if (this.matches(sel, ...args))
            return [this, ...found];
        return found;
    }
 }

/**
 * A RDOM container context.
 */
class RDOMCollection {
    /**
     * @param {HTMLElement} container
     */
    constructor(container, ordered) {
        if (container["rdomCollection"]) {
            let ctx = container["rdomCollection"];
            ctx.ordered = ordered;
            return ctx;
        }
        
        this.container = container;
        this.container["rdomCollection"] = this;

        this.ordered = ordered;

        /** 
         * Set of previously added elements.
         * This set will be checked against [added] on cleanup, ensuring that any zombies will be removed properly.
         * @type {Set<RDOMElement>}
         */
        this.prev = new Set();
        /**
         * Set of [rdom.add]ed elements.
         * This set will be used and reset in [rdom.cleanup].
         * @type {Set<RDOMElement>}
         */
        this.added = new Set();

        /**
         * All current element -> object mappings.
         * @type {Map<RDOMElement, any>}
         */
        this.refs = new Map();
        /**
         * All current object -> element mappings.
         * @type {Map<any, RDOMElement>}
         */
        this.elems = new Map();

        this._i = -1;
    }

    /**
     * Adds or updates an element.
     * This function needs a reference object so that it can find and update existing elements for any given object.
     * @param {any} ref The reference object belonging to the element.
     * @param {any} render The element renderer. Either function(RDOMElement) : RDOMElement, or an object with a property "render" with such a function.
     * @returns {RDOMElement} The created / updated wrapper element.
     */
    add(ref, render) {
        // Check if we already added an element for ref.
        // If so, update it. Otherwise create and add a new element.
        let el = this.elems.get(ref);
        let elOld = el;
        // @ts-ignore
        el = render.render ? render.render(el) : render(el);

        if (elOld) {
            if (elOld !== el)
                this.container.replaceChild(el, elOld);
        } else {
            this.container.appendChild(el);
        }

        if (this.ordered) {
            // Move the element to the given index.
            rdom.move(el, ++this._i);
        }

        // Register the element as "added:" - It's not a zombie and won't be removed on cleanup.
        this.added.add(el);
        // Register the element as the element of ref.
        this.refs.set(el, ref);
        this.elems.set(ref, el);
        return el;
    }

    /**
     * Remove an element from this context, both the element in the DOM and all references in RDOM.
     * @param {RDOMElement} el The element to remove.
     */
    remove(el) {
        if (!el)
            return;
        let ref = this.refs.get(el);
        if (!ref)
            return; // The element doesn't belong to this context - no ref object found.
        // Remove the element and all related object references from the context.
        this.refs.delete(el);
        this.elems.delete(ref);
        // Remove the element from the DOM.
        el.remove();
    }

    /**
     * Remove zombie elements and perform any other ending cleanup.
     * Call this after the last [add].
     */
    end() {
        for (let el of this.prev) {
            if (this.added.has(el))
                continue;
            this.remove(el);
        }
        let tmp = this.prev;
        this.prev = this.added;
        this.added = tmp;
        this.added.clear();
        this._i = -1;
    }

}

var rdom = window["rdom"] = {
    _cachedTemplates: new Map(),
    _cachedIDs: new Map(),
    _lastID: -1,

    _sel: (k, v, t) => `[rdom-${t}${k === 1 ? "" : k === undefined ? "s" : "-"+k}${v ? '="'+v+'"' : ""}]`,

    /**
     * Move an element to a given index non-destructively.
     * @param {ChildNode} el The element to move.
     * @param {number} index The target index.
     */
    move(el, index) {
        if (!el)
            return;

        let tmp = el;
        // @ts-ignore previousElementSibling is too new?
        while (tmp = tmp.previousElementSibling)
            index--;

        // offset == 0: We're fine.
        if (!index)
            return;

        let swap;
        tmp = el;
        if (index < 0) {
            // offset < 0: Element needs to be pushed "left" / "up".
            // -offset is the "# of elements we expected there not to be",
            // thus how many places we need to shift to the left.
            // @ts-ignore previousElementSibling is too new?
            while ((swap = tmp) && (tmp = tmp.previousElementSibling) && index < 0)
                index++;
            // @ts-ignore before is too new?
            swap.before(el);
            
        } else {
            // offset > 0: Element needs to be pushed "right" / "down".
            // offset is the "# of elements we expected before us but weren't there",
            // thus how many places we need to shift to the right.
            // @ts-ignore previousElementSibling is too new?
            while ((swap = tmp) && (tmp = tmp.nextElementSibling) && index > 0)
                index--;
            // @ts-ignore after is too new?
            swap.after(el);
        }
    },

    /** Escapes a string into a HTML - safe format. */
    escape(m) {
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

    /**
     * Parse a template string into a HTML string + extra data, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {{dummies: any[], fields: any[], renderers: any[], texts: any[], html: string, template: HTMLTemplateElement, render: Function}}}
     */
    rdparse$(template, ...values) {
        try {
            let dummies = [];
            let fields = [];
            let renderers = [];
            let texts = [];
            
            let ignored = 0;
            let ids = rdom._cachedIDs.get(template);
            if (!ids) {
                ids = [];
                rdom._cachedIDs.set(template, ids);
            }
            let idi = -1;
            let getid = () => ids[++idi] || (ids[idi] = ++rdom._lastID);

            let tag = (tag, attr = "", val = "") => `<rdom-${tag} ${attr}>${val}</rdom-${tag}>`

            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];
                let t = (i = 1, c = 1) => prev.slice(-i, (-i + c) || undefined);

                if (ignored) {
                    // Ignore val.
                    --ignored;
                    return prev + next;
                }

                if (t() === "$") {
                    // Keep value as-is.
                    return prev.slice(0, -1) + val + next;
                }

                if (t() === ":" || t() === ".") {
                    // "Self-field" element.
                    let type = t();
                    prev = prev.slice(0, -1);
                    let key = val;

                    fields.push(rdh.el(key));
                    val = `rdom-field-${rdom.escape(key)}`;

                    if (type === ":") {
                        let id = "";
                        // Convert the ID from lowerCamelCase to snake_case
                        for (let i in key) {
                            var c = key[i];
                            if (c !== c.toLowerCase()) {
                                id += "_";
                                c = c.toLowerCase();
                            }
                            id += c;
                        }
                        val += ` id="${rdom.escape(id)}"`;
                    }

                } else if (val && val.key && next.trim() === "=") {
                    // Settable / gettable field.
                    next = "";
                    fields.push({ h: val, key: val.key, state: val.state, value: values[i] });
                    ++ignored;
                    val = `rdom-field-${rdom.escape(val.key)}="${rdom.escape(val.key)}"`;

                } else if (t() === "?") {
                    // Insert a fielded rdom-empty, which will be replaced later.
                    prev = prev.slice(0, -1);
                    val = rdparse$`<rdom-empty .${val}></rdom-empty>`;

                } else if (t() === "=") {
                    // Proxy attributes using a field.
                    if (val && val.join)
                        val = val.join(" ");
                    else
                        val = ""+val;
                    
                    let split = prev.lastIndexOf(" ") + 1;
                    let key = prev.slice(split, -1);
                    prev = prev.slice(0, split);
                    let h = rdh.attr(key);
                    h.value = val;
                    fields.push(h);
                    val = `rdom-field-${rdom.escape(key)}="${rdom.escape(key)}"`;

                } else if (val instanceof Function || val.render) {
                    // Element rerenderer.
                    let id = getid();
                    renderers.push({ id: id, value: val.render || val });
                    val = tag("empty", "rdom-render="+id);

                } else if (!(val instanceof Node)) {
                    // Proxy text using a text node.
                    let id = getid();
                    texts.push({ id: id, value: val });
                    val = tag("text", "rdom-text="+id);
                    //@ts-ignore
                    prev = prev.trimRight();
                    //@ts-ignore
                    next = next.trimLeft();
                }

                if (val instanceof Node) {
                    // Replace elements with placeholders, which will be replaced later on.
                    dummies.push(val);
                    val = tag("dummy");
                }

                return prev + val + next;
            });
            
            if (dummies.length === 1 && html === tag("dummy")) {
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
                renderers: renderers,
                texts: texts,
                html: html,
                template: tmp,
                render: (el) => rdbuild(el, data)
            };
            return data;
        } catch (e) {
            console.warn("[rdom]", "rd$ failed parsing:", String.raw(template, ...(values.map(v => "${"+v+"}"))), "\n", e);
            throw e;
        }
    },

    /**
     * Build the result of rdparse$ into a HTML element.
     * @param {HTMLElement} el
     * @param {{dummies: any[], fields: any[], renderers: any[], texts: any[], html: string, template: HTMLTemplateElement}} data 
     * @returns {RDOMElement}
     */
    rdbuild(el, data) {
        /** @type {RDOMElement} */
        // @ts-ignore
        let rel = new RDOMElement(el || document.importNode(data.template.content.firstElementChild, true));

        if (!el) {
            // New element - perform initial setup.
            // Fill placeholders.
            let dummyEls = rel.getElementsByTagName("rdom-dummy");
            for (let dummy of data.dummies) {
                let dummyEl = dummyEls.item(0);
                dummyEl.parentNode.replaceChild(new RDOMElement(dummy), dummyEl);
            }
        }

        for (let { id, value } of data.texts) {
            let el = rel._rdomFind(1, id, "text");
            if (el.tagName === "RDOM-TEXT" && el.parentNode.childNodes.length === 1) {
                // Inline rdom-text.
                el = el.parentNode;
                el.removeChild(el.children[0]);
                el.setAttribute("rdom-text", id);
            }
            el.textContent = value;
        }

        // "Collect" fields.
        for (let wrap of data.fields) {
            let { h, key, state, value } = wrap;
            h = h || wrap;
            let field = new RDOMElement(rel._rdomFind(key));

            if (!field.rdomFields[key]) {
                // Initialize the field.
                field.setAttribute(
                    "rdom-fields",
                    `${field.getAttribute("rdom-fields") || ""} ${key}`.trim()
                );
                field.rdomFields[key] = h;
                field.rdomStates[key] = state;
                if (h.init)
                    h.init(state, field, key);
            }

            // Set the value.
            if (value !== undefined)
                h.set(field.rdomStates[key], field, value);
        }

        for (let { id, value } of data.renderers) {
            rdh._el.set(id, rel._rdomFind(1, id, "render"), value);
        }

        return rel;
    },

    /**
     * Parse a template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {RDOMElement}
     */
    rd$(template, ...values) {
        return rdbuild(null, rdparse$(template, ...values));
    },

    /**
     * Return a renderer parsing the given template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {function(RDOMElement) : RDOMElement}
     */
    rf$(template, ...values) {
        let d = rdparse$(template, ...values);
        return Object.assign((el) => rdbuild(el, d), d);
    },

    /**
     * Parse a template string, escaping expressions unprefixed with $.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {string}
     */
    escape$(template, ...values) {
        return template.reduce((prev, next, i) => {
            let val = values[i - 1];
            let t = prev[prev.length - 1];

            if (t === "$") {
                // Keep value as-is.
                return prev.slice(0, -1) + val + next;
            }

            // Escape HTML
            val = rdom.escape(val);
            if (t === "=") {
                // Escape attributes.
                if (val && val.join)
                    val = val.join(" ");
                val = `"${val}"`;
            }

            return prev + val + next;
        }).trim();
    },

}

var rdparse$ = window["rdparse$"] = rdom.rdparse$;
var rdbuild = window["rdbuild"] = rdom.rdbuild;
var rd$ = window["rd$"] = rdom.rd$;
var rf$ = window["rf$"] = rdom.rf$;
var escape$ = window["escape$"] = rdom.escape$;

/** Sample RDOM field handlers. */
var rdh = {
    _prepare: (h, key, state) => {
        return {
            key: key,
            state: state,
            init: h.init,
            get: h.get,
            set: h.set,
        };
    },

    _el: {
        get: (s, el) => el,
        set: (s, el, v) => {
            let p = el.parentNode;

            if (v && v instanceof Function)
                v = v(el.tagName === "RDOM-EMPTY" ? null : el);
            if (!v) {
                // v is false-ish, clear the field.
                p.replaceChild(rd$`?${s.key}`, el);
            } else if (el !== v) {
                // Replace (fill) the field.
                p.replaceChild(v, el);
                v = new RDOMElement(v);
                if (s.key && !v.getAttribute("rdom-field-"+s.key)) {
                    v.setAttribute("rdom-field-"+s.key, s.key);
                    v.setAttribute(
                        "rdom-fields",
                        `${v.getAttribute("rdom-fields") || ""} ${s.key}`.trim()
                    );
                    v.rdomFields[s.key] = rdh._elem;
                } else {
                    v.setAttribute("rdom-render", s);
                }
            }
        }
    },
    el: (key) => rdh._prepare(rdh._el, key, {
        key: key,
    }),

    _attr: {
        get: (s, el) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            el.setAttribute(s.name, v);
        }
    },
    attr: (key, name) => rdh._prepare(rdh._attr, key, {
        name: name || key,
        v: undefined,
    }),

    _toggleClass: {
        get: (s) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            if (v)
                el.classList.add(s.nameTrue);
            else
                el.classList.remove(s.nameTrue);
        }
    },
    _toggleClasses: {
        get: (s) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            if (v) {
                el.classList.add(s.nameTrue);
                el.classList.remove(s.nameFalse);
            } else {
                el.classList.add(s.nameFalse);
                el.classList.remove(s.nameTrue);
            }
        }
    },
    toggleClass: (key, nameTrue, nameFalse) => rdh._prepare(nameFalse ? rdh._toggleClasses : rdh._toggleClass, key, {
        nameTrue: nameTrue || key,
        nameFalse: nameFalse,
        v: undefined,
    }),

    _toggleEl: {
        init: (s, el, key) => {
            s.elOrig = el;
            s.elPseudo = rd$`<rdom-empty ${rdh._prepare(rdh._toggleElPseudo, key, s)}=${undefined}></rdom-empty>`;
            s.elParent = el.parentNode;
        },
        get: (s) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            if (v && s.elPseudo.parentNode === s.elParent)
                s.elPseudo.parentNode.replaceChild(s.elOrig, s.elPseudo);
            else if (!v && s.elOrig.parentNode === s.elParent)
                s.elOrig.parentNode.replaceChild(s.elPseudo, s.elOrig);
        }
    },
    _toggleElPseudo: {
        get: (s) => rdh._toggleEl.get(s),
        set: (s, el, v) => rdh._toggleEl.set(s, el, v),
    },
    toggleEl: (key) => rdh._prepare(rdh._toggleEl, key, {
        elOrig: null,
        elPseudo: null,
        elParent: null,
        v: true,
    }),
}
