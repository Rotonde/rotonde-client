// @ts-check

import { rd$, rdom } from "./rdom.js";

// Data manipulation / processing functions

/**
 * Return the number of days between now and the given date.
 * @param {number} date UTC timestamp in milliseconds.
 */
export function timeOffset(date) {
  let seconds = Math.floor((new Date().getTime() - date) / 1000);
  return Math.floor(seconds / 86400);
}

/**
 * Return the given date in a human-readable string,
 * telling the user how far in the past the given date is.
 * @param {number} date UTC timestamp in milliseconds.
 */
export function timeSince(date) {
  let seconds = Math.floor((new Date().getTime() - date) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval >= 1) {
    let years = interval == 1 ? " year" : " years";
    return interval + years;
  }
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) {
    let months = interval == 1 ? " month" : " months";
    return interval + months;
  }
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) {
    let days = interval == 1 ? " day" : " days";
    return interval + days;
  }
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
    let hours = interval == 1 ? " hour" : " hours";
    return interval + hours;
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    let minutes = interval == 1 ? " minute" : " minutes";
    return interval + minutes;
  }
  return "seconds";
}

/**
 * @argument {string} arg
 */
export function toOperatorArg(arg) {
  return arg.replace(" ", "_");
}

// URL-related functions

/**
 * Get the domain part from a dat:// URL.
 * @param {{url: string} | string} urlOrPortal
 */
export function toKey(urlOrPortal) {
  /** @type {string} */
  // @ts-ignore
  let url = (urlOrPortal ? urlOrPortal.url : urlOrPortal) || urlOrPortal;
  if (!url)
    return null;

  // This is microoptimized heavily because it's called often.
  // "Make slow things fast" applies here, but not literally:
  // "Make medium-fast things being called very often even faster."
  
  // We check if length > 6 but remove 4.
  // The other 2 will be removed below.
  if (
    url.length > 6 &&
    url[0] == 'd' && url[1] == 'a' && url[2] == 't' && url[3] == ':'
  )
    url = url.substring(4);
  
  if (
    url.length > 2 &&
    url[0] == '/' && url[1] == '/'
  )
    url = url.substring(2);

  let index = url.indexOf("/");
  url = index == -1 ? url : url.substring(0, index);

  url = url.toLowerCase().trim();
  return url;
}

/**
 * Compare keysA against keysB.
 * keysA can be either a portal, array of URLs, array of keys or Set of keys.
 * keysB can be everything keysA can be, or a string for convenience.
 * This function calls getDatDomain on every string, except for strings in Sets.
 */
export function hasKey(keysA, keysB) {
  // Passed a portal (or something giving keys) as keysA or keysB.
  let setA = keysA instanceof Set ? keysA : null;
  if (keysA) {
    setA = keysA.keysSet;
    keysA = toKey(keysA.url) || keysA;
  }

  let setB = keysB instanceof Set ? keysB : null;
  if (keysB) {
    setB = keysB.keysSet;
    keysB = toKey(keysB.url) || keysB;
  }

  // Short-circuit if both keysA and keysB are equal.
  if (keysA === keysB)
    return true;

  // Passed a single url or key as keysA. Let's support it for convenience.
  if (typeof(keysA) === "string") {
    let a = toKey(keysA);

    if (setB)
       // Assuming that setA is already filled with pure keys...
      return setB.has(a);

    for (let b of keysB) {
      b = toKey(b);
      if (!b)
        continue;
  
      if (a === b)
        return true;
    }
  }

  // Passed a single url or key as keysB. Let's support it for convenience.
  if (typeof(keysB) === "string") {
    let b = toKey(keysB);

    if (setA)
       // Assuming that setA is already filled with pure keys...
      return setA.has(b);

    for (let a of keysA) {
      a = toKey(a);
      if (!a)
        continue;
  
      if (a === b)
        return true;
    }
  }

  if (setA) {
    // Fast path: set x iterator
    for (let b of keysB) {
      b = toKey(b);
      if (!b)
        continue;

      // Assuming that setA is already filled with pure keys...
      if (setA.has(b))
        return true;
    }
    return false;
  }

  if (setB) {
    // Fast path: iterator x set
    for (let a of keysA) {
      a = toKey(a);
      if (!a)
        continue;

      // Assuming that setB is already filled with pure keys...
      if (setB.has(a))
        return true;
    }
    return false;
  }
  
  // Slow path: iterator x iterator
  for (let a of keysA) {
    a = toKey(a);
    if (!a)
      continue;

    for (let b of keysB) {
      b = toKey(b);
      if (!b)
        continue;

      if (a === b)
        return true;
    }
  }

  return false;
}

export function splitURL(url) {
  url = url.toLowerCase();

  if (
    url.length > 6 &&
    url[0] == 'd' && url[1] == 'a' && url[2] == 't' && url[3] == ':'
  )
    // We check if length > 6 but remove 4.
    // The other 2 will be removed below.
    url = url.substring(4);
  
  if (
    url.length > 2 &&
    url[0] == '/' && url[1] == '/'
  )
    url = url.substring(2);

  var indexOfSlash = url.indexOf("/");
  if (indexOfSlash === -1)
    indexOfSlash = url.length;
  return { archiveURL: "dat://"+url.substring(0, indexOfSlash), path: url.substring(indexOfSlash) };
}

export function normalizeURL(url) {
  return splitURL(url).archiveURL;
}

// DOM-related functions

/**
 * Create a rune element for the given context and type.
 */
export function rune(context, value) {
  return (el) => {
    el = el || rd$`<i></i>`;
    el.className = `rune rune-${context} rune-${context}-${value}`;
    return el;
  };
}


/**
 * A container context.
 */
export class RDOMListHelper {
  /**
   * @param {HTMLElement} container
   */
  constructor(container, ordered) {
      if (container["rdomListHelper"]) {
          let ctx = container["rdomListHelper"];
          ctx.ordered = ordered;
          return ctx;
      }
      
      this.container = container;
      this.container["rdomListHelper"] = this;

      this.ordered = ordered;

      /** 
       * Set of previously added elements.
       * This set will be checked against [added] on cleanup, ensuring that any zombies will be removed properly.
       * @type {Set<HTMLElement>}
       */
      this.prev = new Set();
      /**
       * Set of [rdom.add]ed elements.
       * This set will be used and reset in [rdom.cleanup].
       * @type {Set<HTMLElement>}
       */
      this.added = new Set();

      /**
       * All current element -> object mappings.
       * @type {Map<HTMLElement, any>}
       */
      this.refs = new Map();
      /**
       * All current object -> element mappings.
       * @type {Map<any, HTMLElement>}
       */
      this.elems = new Map();

      this._i = -1;
  }

  /**
   * Adds or updates an element.
   * This function needs a reference object so that it can find and update existing elements for any given object.
   * @param {any} ref The reference object belonging to the element.
   * @param {any} render The element renderer. Either function(HTMLElement) : HTMLElement, or an object with a property "render" with such a function.
   * @returns {HTMLElement} The created / updated wrapper element.
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
   * @param {HTMLElement} el The element to remove.
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

/**
 * Fixes an element in place, style-wise.
 * Used f.e. in big picture mode to prevent everything from shifting.
 */
export function stylePositionFixed(...elements) {
  let boundsAll = [];

  // Store all current bounds before manipulating the layout.
  for (let i in elements) {
    let el = elements[i];
    let bounds = el.getBoundingClientRect();
    bounds = { top: bounds.top, left: bounds.left, width: bounds.width };
    boundsAll[i] = bounds;
  }

  // Update the layout.
  for (let i in elements) {
    let el = elements[i];
    let bounds = boundsAll[i];
    el.style.position = "fixed";
    el.style.top = bounds.top + "px";
    el.style.left = bounds.left + "px";
    el.style.width = bounds.width + "px";

    // If the layout is still wrong due to CSS transforms, fight against the transform.
    let boundsNew = el.getBoundingClientRect();
    // el.style.top = (bounds.top - (boundsNew.top - bounds.top)) + "px";
    el.style.left = (bounds.left - (boundsNew.left - bounds.left)) + "px";
    el.style.width = (bounds.width - (boundsNew.width - bounds.width)) + "px";
  }
}

/**
 * Resets the element's style position properties.
 * Undoes stylePositionFixed.
 */
export function stylePositionUnfixed(...elements) {
  for (let i in elements) {
    let el = elements[i];
    el.style.top = "";
    el.style.left = "";
    el.style.width = "";
    el.style.position = "";
  }
}


// Other utility functions

let regexEscapePattern = /[-\/\\^$*+?.()|[\]{}]/g;
export function regexEscape(s) {
  return s.replace(regexEscapePattern, "\\$&");
}

let wildcardToRegexCache = {};
export function wildcardToRegex(pattern) {
  let regex = wildcardToRegexCache[pattern];
  if (regex)
    return regex;
  return wildcardToRegexCache[pattern] =
    new RegExp("^" +
      pattern.split("*")
        .map(s => regexEscape(s))
        .join(".*")
    + "$");
};

export function matchPattern(str, patterns) {
  if (typeof patterns === "string")
    return str.match(wildcardToRegex(patterns));
  for (let i in patterns)
    if (matchPattern(str, patterns[i]))
      return true;
  return false;
}

// Simple assert function.
export function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

