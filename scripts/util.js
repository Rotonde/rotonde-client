//@ts-check

// Data manipulation / processing functions

/**
 * Return the number of days between now and the given date.
 * @param {number} date UTC timestamp in milliseconds.
 */
function timeOffset(date) {
  let seconds = Math.floor((new Date().getTime() - date) / 1000);
  return Math.floor(seconds / 86400);
}

/**
 * Return the given date in a human-readable string,
 * telling the user how far in the past the given date is.
 * @param {number} date UTC timestamp in milliseconds.
 */
function timeSince(date) {
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

function toOperatorArg(arg) {
  return arg.replace(" ", "_");
}

// Hash-related functions

/**
 * Get the domain part from a dat:// URL, which often is a hash in the dat network.
 * @param {{url: string} | string} urlOrPortal
 */
function toHash(urlOrPortal) {
  /** @type {string} */
  // @ts-ignore
  let url = urlOrPortal;
  // @ts-ignore
  if (urlOrPortal && urlOrPortal.url)
    // @ts-ignore
    url = urlOrPortal.url;
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
 * Compare hashesA against hashesB.
 * hashesA can be either a portal, array of URLs, array of hashes or Set of hashes.
 * hashesB can be everything hashesA can be, or a string for convenience.
 * This function calls getDatDomain on every string, except for strings in Sets.
 */
function hasHash(hashesA, hashesB) {
  // Passed a portal (or something giving hashes) as hashesA or hashesB.
  let setA = hashesA instanceof Set ? hashesA : null;
  if (hashesA) {
    setA = hashesA.hashesSet;
    hashesA = hashesA.hashes || hashesA;
  }

  let setB = hashesB instanceof Set ? hashesB : null;
  if (hashesB) {
    setB = hashesB.hashesSet;
    hashesB = hashesB.hashes || hashesB;
  }

  // Passed a single url or hash as hashesB. Let's support it for convenience.
  if (typeof(hashesB) === "string") {
    let b = toHash(hashesB);

    if (setA)
       // Assuming that setA is already filled with pure hashes...
      return setA.has(b);

    for (let a of hashesA) {
      a = toHash(a);
      if (!a)
        continue;
  
      if (a === b)
        return true;
    }
  }

  if (setA) {
    // Fast path: set x iterator
    for (let b of hashesB) {
      b = toHash(b);
      if (!b)
        continue;

      // Assuming that setA is already filled with pure hashes...
      if (setA.has(b))
        return true;
    }
    return false;
  }

  if (setB) {
    // Fast path: iterator x set
    for (let a of hashesA) {
      a = toHash(a);
      if (!a)
        continue;

      // Assuming that setB is already filled with pure hashes...
      if (setB.has(a))
        return true;
    }
    return false;
  }
  
  // Slow path: iterator x iterator
  for (let a of hashesA) {
    a = toHash(a);
    if (!a)
      continue;

    for (let b of hashesB) {
      b = toHash(b);
      if (!b)
        continue;

      if (a === b)
        return true;
    }
  }

  return false;
}

// DOM-related functions

/**
 * Create a rune element for the given context and type.
 */
function renderRune(key, context) {
  let type = "";
  return rd$`<i class="rune rune-${context}" *${{
    key: key,
    get: () => type,
    set: (el, value) => el.className = `rune rune-${context} rune-${context}-${type = value}`
  }}></i>`;
}

/**
 * Fixes an element in place, style-wise.
 * Used f.e. in big picture mode to prevent everything from shifting.
 */
function positionFixed(...elements) {
  let boundsAll = [];

  // Store all current bounds before manipulating the layout.
  for (let id in elements) {
    let el = elements[id];
    let bounds = el.getBoundingClientRect();
    bounds = { top: bounds.top, left: bounds.left, width: bounds.width };
    // Workaround for Chromium (Beaker): sticky elements have wrong position.
    // With the tabs element, bounds.top is 0, not 40, except when debugging...
    if (window.getComputedStyle(el).getPropertyValue("position") === "sticky") {
      el.style.position = "fixed";
      bounds.top = el.getBoundingClientRect().top;
      el.style.position = "";
    }
    boundsAll[id] = bounds;
  }

  // Update the layout.
  for (let id in elements) {
    let el = elements[id];
    let bounds = boundsAll[id];
    el.style.position = "fixed";
    el.style.top = bounds.top + "px";
    el.style.left = bounds.left + "px";
    el.style.width = bounds.width + "px";
  }
}

/**
 * Resets the element's style position properties.
 * Undoes position_fixed. 
 */
function position_unfixed(...elements) {
  for (let id in elements) {
    let el = elements[id];
    el.style.top = "";
    el.style.left = "";
    el.style.width = "";
    el.style.position = "";
  }
}


// Other utility functions

// Simple assert function.
function assert(condition, message) {
  if (!condition)
    throw new Error(message);
}

