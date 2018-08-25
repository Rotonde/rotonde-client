// @ts-check

/* RDOM (rotonde dom)
 * 0x0ade's collection of DOM manipulation functions because updating innerHTML every time a single thing changes isn't cool.
 * This started out as a mini framework for Rotonde.
 * Mostly oriented towards manipulating paginated / culled ordered collections, f.e. feeds.
 */

export var rdom = {
    _cachedTemplates: new Map(),
    _cachedIDs: new Map(),
    _lastID: -1,

    _sel: (k, v, t) => `[rdom-${t}${k === 1 ? "" : k === undefined ? "s" : "-"+k}${v ? '="'+v+'"' : ""}]`,

    _find(el, key, value = "", type = "field") {
        return rdom._findAll(el, key, value, type)[0];
    },

    _findAll(el, key, value = "", type = "field") {
        let sel = rdom._sel(key, value, type);
        let found = el.querySelectorAll(sel);
        if (el.matches(sel))
            found = [el, ...found];
        else
            found = [...found];
        let ctx = el.getAttribute("rdom-ctx") || rdom._getCtx(el);
        return found.filter(child => child === el || ctx === rdom._getCtx(child));
    },

    _getCtx(el) {
        while (el = el.parentElement) {
            let ctx = el.getAttribute("rdom-ctx");
            if (ctx)
                return ctx;
        }
        return null;
    },

    /** @param {HTMLElement} el @returns {HTMLElement} */
    _init(el) {
        if (el["rdomFields"])
            return el;
        el["rdomFields"] = {};
        el["rdomStates"] = {};
        return el;
    },

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
        for (let c of ""+m) {
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
     * Get the holder of the rdom-get with the given value, or all holders into the given object.
     * @param {HTMLElement} el
     * @param {string | any} valueOrObj
     * @returns {HTMLElement | any}
     */
    get(el, valueOrObj = {}) {
        if (typeof(valueOrObj) === "string")
            return rdom._find(el, 1, valueOrObj, "get");

        for (let field of rdom._findAll(el, 1, "", "get")) {
            let key = field.getAttribute("rdom-get");
            valueOrObj[key] = field;
        }

        return valueOrObj;
    },

    /**
     * Parse a template string into a HTML string + extra data, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * @param {TemplateStringsArray} template
     * @param {...any} values
     * @returns {{fields: any[], renderers: any[], texts: any[], node: HTMLElement}}}
     */
    rdparse$(template, ...values) {
        try {
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
                let t = prev[prev.length - 1];

                if (ignored) {
                    // Ignore val.
                    --ignored;
                    return prev + next;
                }

                if (t === "$") {
                    // Keep value as-is.
                    return prev.slice(0, -1) + val + next;
                }

                if (val && val.key && next.trim() === "=") {
                    // Settable / gettable field.
                    next = "";
                    fields.push({ h: val, key: val.key, state: val.state, value: values[i] });
                    ++ignored;
                    val = `rdom-field-${rdom.escape(val.key)}="${rdom.escape(val.key)}"`;

                } else if (t === "=") {
                    // Proxy attributes using a field.
                    if (val && val.join)
                        val = val.join(" ");
                    else
                        val = ""+val;
                    
                    let split = prev.lastIndexOf(" ") + 1;
                    let attr = prev.slice(split, -1);
                    let key = attr + "-" + getid();
                    prev = prev.slice(0, split);
                    let h = rd.attr(key, attr);
                    h.value = val;
                    fields.push(h);
                    val = `rdom-field-${rdom.escape(key)}="${rdom.escape(key)}"`;

                } else if (val && (val instanceof Node || val instanceof Function)) {
                    // Add placeholders, which will be replaced later on.
                    let id = getid();
                    renderers.push({ id: id, value: val instanceof Function ? val : () => val });
                    val = tag("empty", "rdom-render="+id);
                
                } else {
                    // Proxy text using a text node.
                    let id = getid();
                    texts.push({ id: id, value: val });
                    val = tag("text", "rdom-text="+id);
                    // @ts-ignore
                    prev = prev.trimRight();
                    // @ts-ignore
                    next = next.trimLeft();
                }

                return prev + val + next;
            });

            html = html.trim();
            /** @type {HTMLElement} */
            var tmp = rdom._cachedTemplates.get(html);
            if (!tmp) {
                tmp = document.createElement("template");
                tmp.innerHTML = html;
                // @ts-ignore
                tmp = tmp.content.firstElementChild;
                rdom._cachedTemplates.set(html, tmp);
            }

            let data = {
                fields: fields,
                renderers: renderers,
                texts: texts,
                node: tmp
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
     * @param {{fields: any[], renderers: any[], texts: any[], node: HTMLElement}} data 
     * @returns {HTMLElement}
     */
    rdbuild(el, data) {
        let elEmpty = null;
        if (el && el.tagName === "RDOM-EMPTY") {
            elEmpty = el;
            el = null;
        }

        /** @type {HTMLElement} */
        // @ts-ignore
        let rel = rdom._init(el || document.importNode(data.node, true));

        if (!rel.getAttribute("rdom-ctx"))
            rel.setAttribute("rdom-ctx", ""+(++rdom._lastID));

        for (let { id, value } of data.texts) {
            let el = rdom._find(rel, 1, id, "text");
            if (el && value !== undefined) {
                if (el.tagName === "RDOM-TEXT" && el.parentNode.childNodes.length === 1) {
                    // Inline rdom-text.
                    el = el.parentNode;
                    el.removeChild(el.children[0]);
                    el.setAttribute("rdom-text", id);
                }
                el.textContent = value;
            }
        }

        // "Collect" fields.
        for (let wrap of data.fields) {
            let { h, key, state, value } = wrap;
            h = h || wrap;
            let el = rdom._init(rdom._find(rel, key));
            // @ts-ignore
            let fields = el["rdomFields"];
            // @ts-ignore
            let states = el["rdomStates"];

            if (!fields[key]) {
                // Initialize the field.
                el.setAttribute(
                    "rdom-fields",
                    `${el.getAttribute("rdom-fields") || ""} ${key}`.trim()
                );
                fields[key] = h;
                states[key] = state;
                if (h.init)
                    h.init(state, el, key);
            }

            // Set the value.
            if (value !== undefined)
                h.set(states[key], el, value);
        }

        for (let { id, value } of data.renderers) {
            let el = rdom._find(rel, 1, id, "render");
            if (el && value !== undefined) {
                let p = el.parentNode;
                if (value && value instanceof Function)
                    value = value(el.tagName === "RDOM-EMPTY" ? null : el);
                value = value || rd$`<rdom-empty/>`;
                if (el !== value && !(el.tagName === "RDOM-EMPTY" && value.tagName === "RDOM-EMPTY")) {
                    // Replace (fill) the field.
                    p.replaceChild(value, el);
                    value.setAttribute("rdom-render", id);
                }
            }
        }

        if (elEmpty && elEmpty.parentNode)
            elEmpty.parentNode.replaceChild(rel, elEmpty);

        return rel;
    },

    /**
     * Parse a template string into a HTML element, escaping expressions unprefixed with $, inserting attribute arrays and preserving child nodes.
     * If the only argument is an existing element: Return a function parsing a given template string into the given HTML element.
     * @param {any} template
     * @param {...any} values
     * @returns {any}
     */
    rd$(templateOrEl, ...values) {
        if (!templateOrEl || templateOrEl instanceof HTMLElement)
            // @ts-ignore
            return (template, ...values) => rdbuild(templateOrEl, rdparse$(template, ...values))
        return rdbuild(null, rdparse$(templateOrEl, ...values));
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
            if (val && val.join)
                val = val.join(" ");
            else
                val = rdom.escape(val);

            if (t === "=")
                // Escape attributes.
                val = `"${val}"`;

            return prev + val + next;
        }).trim();
    },

}

export var rdparse$ = rdom.rdparse$;
export var rdbuild = rdom.rdbuild;
export var rd$ = rdom.rd$;
export var escape$ = rdom.escape$;

/** Sample RDOM field handlers. */
export var rd = {
    _: (h, key, state) => {
        return {
            key: key,
            state: state,
            init: h.init,
            get: h.get,
            set: h.set,
        };
    },

    _attr: {
        get: (s, el) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            el.setAttribute(s.name, v);
        }
    },
    attr: (key, name) => rd._(rd._attr, key, {
        name: name || key,
        v: undefined,
    }),

    _toggleClass: {
        get: (s) => s.v,
        set: (s, el, v) => {
            if (s.v === v)
                return;
            s.v = v;
            if (v) {
                el.classList.add(s.nameTrue);
                if (s.nameFalse)
                    el.classList.remove(s.nameFalse);
            } else {
                el.classList.remove(s.nameTrue);
                if (s.nameFalse)
                    el.classList.add(s.nameFalse);
            }
        }
    },
    toggleClass: (key, nameTrue, nameFalse) => rd._(rd._toggleClass, key, {
        nameTrue: nameTrue || key,
        nameFalse: nameFalse,
        v: undefined,
    }),
}
