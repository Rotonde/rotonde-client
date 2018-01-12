// Data manipulation / processing functions

// Escapes the string into a HTML - safe format.
function escape_html(m)
{
  if (!m)
    return m;

  var n = "";
  for (var i = 0; i < m.length; i++) {
    var c = m[i];
    if (c === "&") { n += "&amp;"; continue; }
    if (c === "<") { n += "&lt;"; continue; }
    if (c === ">") { n += "&gt;"; continue; }
    if (c === "\"") { n += "&quot;"; continue; }
    if (c === "'") { n += "&#039;"; continue; }
    n += c;
  }
  
  return n;
}

// Escapes the string into a HTML attribute - safe format.
function escape_attr(m)
{
  if (!m)
    return m;

  var n = "";
  for (var i = 0; i < m.length; i++) {
    var c = m[i];
    // This assumes that all attributes are wrapped in '', never "".
    if (c === "'") { n += "&#039;"; continue; }
    n += c;
  }
  
  return n;
}

// Transforms a given date into a human-readable string,
// telling the user how far in the past the given date is. 

function timeOffset(date) // Days
{
  var seconds = Math.floor((new Date() - date) / 1000);
  var interval = Math.floor(seconds / 31536000);
  return Math.floor(seconds / 86400);
}

function timeSince(date)
{
  var seconds = Math.floor((new Date() - date) / 1000);
  var interval = Math.floor(seconds / 31536000);

  if (interval >= 1) {
    var years = interval == 1 ? " year" : " years";
    return interval + years;
  }
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) {
    var months = interval == 1 ? " month" : " months";
    return interval + months;
  }
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) {
    var days = interval == 1 ? " day" : " days";
    return interval + days;
  }
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
    var hours = interval == 1 ? " hour" : " hours";
    return interval + hours;
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    var minutes = interval == 1 ? " minute" : " minutes";
    return interval + minutes;
  }
  return "seconds";
}


// Hash-related functions

// Get the hash part from a dat:// URL.
// Note that it technically returns the domain part of the URL.
// The function is named to_hash for simplicity, though, as
// we're dealing with hashes more often in the dat network.
function to_hash(url)
{
  if (url && url.url)
    url = url.url;
  if (!url)
    return null;

  // This is microoptimized heavily because it's called often.
  // "Make slow things fast" applies here, but not literally:
  // "Make medium-fast things being called very often even faster."
  
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

  var index = url.indexOf("/");
  url = index == -1 ? url : url.substring(0, index);

  url = url.toLowerCase().trim();
  return url;
}

// Compares hashes_a against hashes_b.
// hashes_a can be either a portal, array of URLs, array of hashes or Set of hashes.
// hashes_b can be everything hashes_a can be, or a string for convenience.
// This function calls to_hash on every string, except for strings in Sets.
function has_hash(hashes_a, hashes_b)
{
  // Passed a portal (or something giving hashes) as hashes_a or hashes_b.
  var set_a = hashes_a instanceof Set ? hashes_a : null;
  if (hashes_a) {
    if (typeof(hashes_a.hashes_set) === "function")
      set_a = hashes_a.hashes_set();
    if (typeof(hashes_a.hashes) === "function")
      hashes_a = hashes_a.hashes();
  }

  var set_b = hashes_b instanceof Set ? hashes_b : null;
  if (hashes_b) {
    if (typeof(hashes_b.hashes_set) === "function")
      set_b = hashes_b.hashes_set();
    if (typeof(hashes_b.hashes) === "function")
      hashes_b = hashes_b.hashes();
  }

  // Passed a single url or hash as hashes_b. Let's support it for convenience.
  if (typeof(hashes_b) === "string") {
    var hash_b = to_hash(hashes_b);

    if (set_a)
       // Assuming that set_a is already filled with pure hashes...
      return set_a.has(hash_b);

    for (var a in hashes_a) {
      var hash_a = to_hash(hashes_a[a]);
      if (!hash_a)
        continue;
  
      if (hash_a === hash_b)
        return true;
    }
  }

  if (set_a) {
    // Fast path: set x iterator
    for (var b in hashes_b) {
      var hash_b = to_hash(hashes_b[b]);
      if (!hash_b)
        continue;

      // Assuming that set_a is already filled with pure hashes...
      if (set_a.has(hash_b))
        return true;
    }
    return false;
  }

  if (set_b) {
    // Fast path: iterator x set
    for (var a in hashes_a) {
      var hash_a = to_hash(hashes_a[a]);
      if (!hash_a)
        continue;

      // Assuming that set_b is already filled with pure hashes...
      if (set_b.has(hash_a))
        return true;
    }
    return false;
  }
  
  // Slow path: iterator x iterator
  for (var a in hashes_a) {
    var hash_a = to_hash(hashes_a[a]);
    if (!hash_a)
      continue;

    for (var b in hashes_b) {
      var hash_b = to_hash(hashes_b[b]);
      if (!hash_b)
        continue;

      if (hash_a === hash_b)
        return true;
    }
  }

  return false;
}

// Try to get the portal name from the given URL.
// Returns early with URLs starting with $ (f.e. $rotonde).
// If no matching portal can be found, it shortens the URL.
function name_from_hash(url)
{
  if (url.length > 0 && url[0] == "$") return url;
  
  var hash = to_hash(url);

  var portal = r.home.feed.get_portal(hash, true);
  if (portal)
    return portal.name;
  
  if (r.home.feed.portals_dummy[hash])
    return r.home.feed.portals_dummy[hash].name;
  
  if (hash.length > 16)
    return hash.substr(0,12)+".."+hash.substr(hash.length-3,2);
  return hash;
}

// Try to get the relationship rune from r.home.portal to the given URL.
// Returns the "rotonde" rune ($) with URLs starting with $ (f.e. $rotonde).
// If no matching portal can be found, it returns the "follow" rune (~).
function relationship_from_hash(url)
{
  if (url.length > 0 && url[0] == "$") return create_rune("portal", "rotonde");
  
  if (url === r.client_url) return create_rune("portal", "rotonde");
  if (has_hash(r.home.portal, url)) return create_rune("portal", "self");

  var portal = r.home.feed.get_portal(url, true);
  if (portal)
    return portal.relationship();

  return create_rune("portal", "follow");
}

// DOM-related functions

// Creates a rune element for the given context and type.
function create_rune(context, type)
{
  context = escape_attr(context);
  type = escape_attr(type);
  return `<i class='rune rune-${context} rune-${context}-${type}'></i>`;
}

// Fixes an element in place, style-wise.
// Used f.e. in big picture mode to prevent everything from shifting.
function position_fixed(...elements)
{
  var all_bounds = [];
  // Store all current bounds before manipulating the layout.
  for (var id in elements) {
    var el = elements[id];
    var bounds = el.getBoundingClientRect();
    bounds = { top: bounds.top, left: bounds.left, width: bounds.width };
    // Workaround for Chromium (Beaker): sticky elements have wrong position.
    // With the tabs element, bounds.top is 0, not 40, except when debugging...
    if (window.getComputedStyle(el).getPropertyValue("position") === "sticky") {
      el.style.position = "fixed";
      bounds.top = el.getBoundingClientRect().top;
      el.style.position = "";      
    }
    all_bounds[id] = bounds;
  }
  // Update the layout.
  for (var id in elements) {
    var el = elements[id];
    var bounds = all_bounds[id];
    el.style.position = "fixed";
    el.style.top = bounds.top + "px";
    el.style.left = bounds.left + "px";
    el.style.width = bounds.width + "px";
  }
}

// Resets the element's style position properties.
// Undoes position_fixed. 
function position_unfixed(...elements)
{
  for (var id in elements) {
    var el = elements[id];
    el.style.top = "";
    el.style.left = "";
    el.style.width = "";
    el.style.position = "";
  }
}


// Other utility functions

// Simple assert function.
function assert(condition, message)
{
  if (!condition)
    throw new Error(message);
}

r.confirm("script","util");
