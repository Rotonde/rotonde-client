// @ts-check
/** @type {Map<any, Promise>} */
let pending = new Map();
/**
 * Sherlock - lightweight shared promise locks.
 * @param {any} key The key.
 * @param {function() : Promise} factory An async function, or a function returning a promise.
 * @returns The promise.
 */
export default function sherlock(key, factory) {
  // Return any pending instance locked behind that key.
  let p = pending.get(key);
  if (p)
    return p;
  
  // If there is no pending instance, create one.
  pending.set(key, p = factory());

  // Make sure that the lock is lifted and that the stack contains the callee of this function.
  let stackfix = new Error().stack;
  return p.then(rv => {
    pending.delete(key);
    return rv;
  }, e => {
    pending.delete(key);
    e.stack = e.stack.slice(0, e.stack.lastIndexOf("\n")) + stackfix.slice(stackfix.indexOf("\n"))
    throw e;
  });
}
export {sherlock};
