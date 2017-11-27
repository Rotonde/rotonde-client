// This is the code running inside the oembed jsonp sandbox.
cb = []; // Used to store the jsonp callbacks.
(() => {
  function setup(parent, id, src, timeout) {
    var el = document.createElement("script");
    el.type = "text/javascript";
    el.async = true;
    src += src.indexOf("?") < 0 ? "?" : "&";    
    src += `callback=cb[${id}]`;
    el.src = src;

    var rejectout = setTimeout(() => {
      cb[id] = null;
      el.remove();
      parent.postMessage({ type: "jsonp_reject", id: id, data: "jsonp request failed, timeout!" }, "*");
    }, timeout);

    cb[id] = data => {
      clearTimeout(rejectout);
      if (!cb[id])
        return;
      cb[id] = null;
      el.remove();
      parent.postMessage({ type: "jsonp_resolve", id: id, data: data }, "*");
    };

    document.head.appendChild(el);
  }

  window.addEventListener("message", event => {
    if (!event.data || event.data.type != "jsonp_request")
      return;
    
    setup(event.source, event.data.id, event.data.src, event.data.timeout);
  }, false);

})();


