// @ts-check
/** @type {Map<any, Promise>} */
let pending = new Map();

/**
 * Sherlock - lightweight shared promise locks.
 * @param {any} key The key.
 * @param {function() : Promise} factory An async function, or a function returning a promise.
 * @returns {Promise} The promise.
 */
export function sherlock(key, factory) {
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

/**
 * Queuelock - execute an array of async functions, with only a given number running at a time.
 * @param {number} count The amount of concurrently running operations.
 * @param {(function(any[], any[]) : Promise)[]} queue An array of async functions, or functions returning promises.
 * @returns {Promise} A promise.
 */
export function queuelock(count, queue) {
  let results = [];
  let _resolve;
  let promise = new Promise(resolve => {
    _resolve = resolve;
  });

  let dequeue = () => {
    if (queue.length === 0) {
      if (!_resolve)
        return;
      _resolve(results);
      return;
    }

    let r = queue.splice(0, 1)[0](queue, results);
    results.push(r);

    if (r instanceof Promise) {
      r.then(dequeue, dequeue);
      return;
    }
    dequeue();
    return;
  }

  for (let i = 0; i < count; i++)
    dequeue();
  
  return promise;
}
