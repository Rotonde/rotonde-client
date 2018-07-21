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

            //@ts-ignore
            field.rdomFields[key].set(field.rdomStates[key], field, data[key]);
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
            //@ts-ignore
            return field.rdomFields[keyOrObj].get(field.rdomStates[keyOrObj], field);
        }

        for (let field of this.querySelectorWithSelfAll(`[rdom-fields]`)) {
            for (let key of field.getAttribute("rdom-fields").split(" ")) {
                // @ts-ignore
                keyOrObj[key] = field.rdomFields[key].get(field.rdomStates[key], field);
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
     * @param {any} render The element renderer. Either function(RDOMElement) : RDOMElement, or an object with a property "render" with such a function.
     * @returns {RDOMElement} The created / updated wrapper element.
     */
    add(ref, index, render) {
        // Check if we already added an element for ref.
        // If so, update it. Otherwise create and add a new element.
        let el = this.elements.get(ref);
        let elOld = el;
        // @ts-ignore
        el = render.render ? render.render(el) : render(el);

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
        this.added.add(el);
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
            if (this.added.has(el))
                continue;
            this.remove(el);
        }
        let tmp = this.prev;
        this.prev = this.added;
        this.added = tmp;
        this.added.clear();
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
     * @returns {{dummies: any[], fields: any[], renderers: any[], texts: any[], html: string, template: HTMLTemplateElement, render: Function}}}
     */
    rdparse$(template, ...values) {
        try {
            let dummies = [];
            let fields = [];
            let renderers = [];
            let texts = [];
            let ignored = new Set();
            let html = template.reduce((prev, next, i) => {
                let val = values[i - 1];
                let t = (i = 1, c = 1) => prev.slice(-i, (-i + c) || undefined);

                if (ignored.has(i - 1)) {
                    // Ignore val.
                    return prev + next;
                }

                if (t() === "$") {
                    // Keep value as-is.
                    return prev.slice(0, -1) + val + next;
                }

                if (t() === "!" || t() === ".") {
                    // "Self-field" element.
                    let type = t();
                    prev = prev.slice(0, -1);
                    let key = val;

                    fields.push(rdh.el(key));
                    val = `rdom-field-${rdom.escapeAttr(key)}="${rdom.escapeAttr(key)}"`;

                    if (type === "!") {
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
                        val += ` id="${rdom.escapeAttr(id)}"`;
                    }

                } else if (val && val.key && next.trim() === "=") {
                    // Settable / gettable field.
                    next = "";
                                        
                    fields.push({ h: val, key: val.key, state: val.state, value: values[i] });
                    ignored.add(i);
                    val = `rdom-field-${rdom.escapeAttr(val.key)}="${rdom.escapeAttr(val.key)}"`;

                } else if (t() === "?") {
                    // Insert a fielded rdom-empty, which will be replaced later.
                    prev = prev.slice(0, -1);
                    val = rdparse$`<rdom-empty .${val}></rdom-empty>`;

                } else if (t() === "=") {
                    // Proxy attributes using a field.
                    if (val instanceof Array)
                        val = val.join(" ");
                    else if (typeof(val) !== "string")
                        val = ""+val;
                    
                    let key = prev.slice(prev.lastIndexOf(" ") + 1, -1);
                    prev = prev.slice(0, prev.lastIndexOf(" ") + 1);
                    let h = rdh.attr(key);
                    h.value = val;
                    fields.push(h);
                    val = `rdom-field-${rdom.escapeAttr(key)}="${rdom.escapeAttr(key)}"`;

                } else if (val instanceof Function) {
                    // Element rerenderer.
                    renderers.push(val);
                    val = rdparse$`<rdom-empty rdom-render-$${renderers.length - 1}></rdom-empty>`;

                } else if (!(val instanceof Node)) {
                    // Proxy text using a text node.
                    texts.push(val);
                    val = `<rdom-text rdom-text-${texts.length - 1}></rdom-text>`;
                }

                if (val instanceof Node || (val["render"])) {
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
        let { dummies, fields, template: tmp, renderers, texts } = data;
        /** @type {RDOMElement} */
        // @ts-ignore
        let rel = new RDOMElement(el || document.importNode(tmp.content, true).firstElementChild);

        if (!el) {
            // New element - perform initial setup.
            // Fill placeholders.
            let dummyEls = rel.getElementsByTagName("rdom-dummy");
            for (let i in dummies) {
                let dummyEl = dummyEls.item(0);
                dummyEl.parentNode.replaceChild(new RDOMElement(dummies[i]), dummyEl);
            }
        }

        // TODO: Refresh placeholders.

        for (let i in texts) {
            let value = texts[i];
            let el = rel.querySelectorWithSelf(`[rdom-text-${i}]`);
            el.textContent = value;
            // TODO: Cache and possibly inline rdom-text!
        }

        // "Collect" fields.
        for (let wrap of fields) {
            let { h, key, state, value } = wrap;
            h = h || wrap;
            let field = new RDOMElement(rel.querySelectorWithSelf(`[rdom-field-${key}]`));

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

        for (let i in renderers) {
            let value = renderers[i];
            let el = rel.querySelectorWithSelf(`[rdom-render-${i}]`);
            // TODO: De-code-dupe: Share code with rdh.el
            if (value && value instanceof Function)
                value = value(el.tagName.toLowerCase() === "rdom-empty" ? null : el);
            if (!value) {
                // Value is false-ish, clear the field.
                el.parentNode.replaceChild(rd$`<rdom-empty rdom-render-$${i}></rdom-empty>`, el);
                continue;
            }

            // Replace (fill) the field.
            if (el !== value) {
                el.parentNode.replaceChild(value, el);
                value.setAttribute("rdom-render-"+i, "");
            }
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
     * Parse a template string, escaping expressions unprefixed with $.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {string}
     */
    escape$(template, ...values) {
        return template.reduce((prev, next, i) => {
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
        }).trim();
    },

}

var rdparse$ = window["rdparse$"] = rdom.rdparse$;
var rp$ = window["rp$"] = rdom.rdparse$;
var rdbuild = window["rdbuild"] = rdom.rdbuild;
var rd$ = window["rd$"] = rdom.rd$;
var escape$ = window["escape$"] = rdom.escape$;
var rd = window["rd"] = rdom.rdbuild;

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
        set: (s, el, value) => {
            if (value && value instanceof Function)
                value = value(el.tagName.toLowerCase() === "rdom-empty" ? null : el);
            if (value && !(value instanceof HTMLElement)) {
                // Ignore true-ish non-HTMLElement values.
                return;
            }
            if (!value) {
                // Value is false-ish, clear the field.
                el.parentNode.replaceChild(rd$`?${s.key}`, el);
                return;
            }

            // Replace (fill) the field.
            if (el !== value) {
                el.parentNode.replaceChild(value, el);
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
    el: (key) => rdh._prepare(rdh._el, key, {
        key: key,
    }),

    _attr: {
        get: (s, el) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
            s.value = value;
            el.setAttribute(s.name, value);
        }
    },
    attr: (key, name) => rdh._prepare(rdh._attr, key, {
        name: name || key,
        value: undefined,
    }),

    _toggleClass: {
        get: (s) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
            s.value = value;
            if (value)
                el.classList.add(s.nameTrue);
            else
                el.classList.remove(s.nameTrue);
        }
    },
    _toggleClasses: {
        get: (s) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
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
    toggleClass: (key, nameTrue, nameFalse) => rdh._prepare(nameFalse ? rdh._toggleClasses : rdh._toggleClass, key, {
        nameTrue: nameTrue || key,
        nameFalse: nameFalse,
        value: undefined,
    }),

    _toggleEl: {
        init: (s, el, key) => {
            s.elOrig = el;
            s.elPseudo = rd$`<rdom-empty ${rdh._prepare(rdh._toggleElPseudo, key, s)}=${undefined}></rdom-empty>`;
            s.elParent = el.parentNode;
        },
        get: (s) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
            s.value = value;
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
        value: true,
    }),

    _textContent: {
        get: (s, el) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
            s.value = value;
            el.textContent = value
        }
    },
    textContent: (key) => rdh._prepare(rdh._textContent, key, {
        value: "",
    }),

    _innerHTML: {
        get: (s, el) => s.value,
        set: (s, el, value) => {
            if (s.value === value)
                return;
            s.value = value;
            el.innerHTML = value
        }
    },
    innerHTML: (key) => rdh._prepare(rdh._innerHTML, key, {
        value: "",
    }),
}
