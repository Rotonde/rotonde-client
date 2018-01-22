// rdom (rotonde dom)
// Collection of DOM manipulation functions because updating innerHTML every time a single thing changes isn't cool.
// I guess this is a mini DOM "framework" of some sorts..?

__rdom__ = {
  contexts: new Map(),
  context_last_container: null,
  context_last: null
}

// Gets a rdom context for the given container element.
// If no context is present, it creates one and returns it.
// You shouldn't need to access a rdom context directly.
// Look inside the method to see what a context holds.
function rdom_context(container) {
  if (__rdom__.context_last_container === container) {
    return __rdom__.context_last;
  }

  var ctx = __rdom__.contexts.get(container);
  if (!ctx) {
    ctx = {

      // Culling setup.
      cull: false,
      cullmin: -1,
      cullmax: -1,
      culloffset: 0,

      // Elements that were added previously.
      // This will be checked against "added" on cleanup,
      // ensuring that anything that shouldn't exist
      // anymore (zombies) will be removed properly.
      prev: [],
      // Elements that were rdom_add-ed.
      // This will be used and reset in rdom_cleanup.
      added: [],

      // All current element -> object mappings.
      references: new Map(),
      // All current object -> element mappings.
      elements: new Map(),
      // All current object -> HTML source mappings.
      // We avoid comparing against innerHTML as it's slow.
      htmls: new Map()

    };
    __rdom__.contexts.set(container, ctx);
  }
  __rdom__.context_last_container = container;
  return __rdom__.context_last = ctx;
}

// Sets up a culling environment with a given minimum
// index, maximum index and moving offset.
function rdom_cull(container, min, max, offset) {
  var ctx = rdom_context(container);  

  ctx.cull = true;
  if (min === -1 || max === -1 ||
      min === undefined || max === undefined) {
    ctx.cull = false;
    min = max = -1;
  }
  ctx.cullmin = min;
  ctx.cullmax = max;

  ctx.culloffset = offset !== undefined ? offset : 0;
}

// Adds or updates an element at the given index.
// Returns the created / updated wrapper element.
// For best performance in paginated / culled containers,
// pass a function as "html." It only gets used if the element
// is visible.
// This function needs a reference object so that rdom can find
// and update existing elements for any given object.
// For example:
// When adding entries to the feed, "ref" is the entry being added.
// Instead of blindly clearing the feed and re-adding all entries,
// rdom checks if an element for the entry exists and updates it.
function rdom_add(container, ref, index, html) {
  var ctx = rdom_context(container);

  // Let's hope that making this method async doesn't break culling.
  if (ctx.cull && (index < ctx.cullmin || ctx.cullmax <= index)) {
    // Out of bounds - remove if existing, don't add.
    rdom_remove(container, ref);
    return null;
  }

  var el;
  if (typeof(html) === "object") {
    // We're (assuming that we're) adding an element directly.
    el = html;
    // Replace any existing element with the new one.
    rdom_remove(container, ref);
    container.appendChild(el);

  } else {
    // We're (assuming that we're) given the html contents of the element.
    if (typeof(html) === "function") {
      // If we're given a function, call it now.
      // We don't need its result if the element's culled away.
      html = html();
    }
    // Check if we already added an element for ref.
    // If so, update it. Otherwise create and add a new element.
    el = ctx.elements.get(ref);
    if (!el) {
      // The element isn't existing yet; create and add it.
      var range = document.createRange();
      range.selectNode(container);
      el = range.createContextualFragment("<span class='rdom-wrapper'>"+html+"</span>").firstElementChild;
      container.appendChild(el);
    } else if (ctx.htmls.get(ref) !== html) {
      // Update the innerHTML of our thin wrapper.
      el.innerHTML = html;
    }
  }

  if (index > -1) {
    // Move the element to the given index.
    rdom_move(el, index + ctx.culloffset);
  }

  // Register the element as "added:" It's not a zombie.
  ctx.added.push(el);
  // Register the element as the element of ref.
  ctx.references.set(el, ref);
  ctx.elements.set(ref, el);
  ctx.htmls.set(ref, html);

  return el;
}

// Removes an object's element in a container.
// Required to clean up properly. rdom holds references
// to the element and its reference object; el.remove() isn't enough.
function rdom_remove(container, ref) {
  if (!ref)
    return;
  var ctx = rdom_context(container);
  var el = ctx.elements.get(ref);
  if (!el)
    return; // The ref object doesn't belong to this context - no element found.
  // Remove the element and all related object references from the context.
  ctx.elements.delete(ref);
  ctx.references.delete(el);
  ctx.htmls.delete(ref);
  // Remove the element from the DOM.
  el.remove();
}

// Removes an element in a container.
// Required to clean up properly. rdom holds references
// to the element and its ref object; el.remove() isn't enough.
function rdom_remove_el(container, el) {
  if (!el)
    return;
  var ctx = rdom_context(container);
  var ref = ctx.references.get(el);
  if (!ref)
    return; // The element doesn't belong to this context - no ref object found.
  // Remove the element and all related object references from the context.
  ctx.references.delete(el);
  ctx.elements.delete(ref);
  ctx.htmls.delete(ref);
  // Remove the element from the DOM.
  el.remove();
}

// Removes zombie elements.
// Call this function after the last rdom_add.
function rdom_cleanup(container) {
  var ctx = rdom_context(container);
  for (id in ctx.prev) {
    var el = ctx.prev[id];
    if (ctx.added.indexOf(el) > -1)
      continue;
    rdom_remove_el(container, el);
  }
  ctx.prev = ctx.added;
  ctx.added = [];
}

// Moves an element to a given index.
function rdom_move(el, index) {
  if (!el)
    return;
  
  var offset = index;
  var tmp = el;
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
    while ((swap = tmp) && (tmp = tmp.previousElementSibling) && offset < 0)
      offset++;
    swap.before(el);
    
  } else {
    // offset > 0: Element needs to be pushed "right" / "down".
    // offset is the "# of elements we expected before us but weren't there",
    // thus how many places we need to shift to the right.
    var swap;
    tmp = el;
    while ((swap = tmp) && (tmp = tmp.nextElementSibling) && offset > 0)
      offset--;
    swap.after(el);
  }

}


// Don't make rdom.js require rotonde.
if (window["r"] && r.confirm) {
  r.confirm("script", "rdom");
}
