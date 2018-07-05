function Embed(url) {
  this.url = url;
  this.provider = Embed.get_provider(url);
  if (!this.provider) {
    return;  
  }

  this.resolved = undefined;
  this.__resolving__ = null;
  this.resolve = function(entry) { return this.__resolving__ || (this.__resolving__ = (async () => {
    if (this.resolved !== undefined) {
      return this.resolved;
    }

    var provider = this.provider;
    var src, data;

    if (provider.templateRegex) {
      // We've got a template for the provider.

      if (provider.api) {
        src = url.replace(provider.templateRegex, provider.api);
        if (src.startsWith("//"))
          src = "https:" + src;

        if (provider.embedtag && provider.embedtag.tag) {
          // The provider makes embedding easy.
          var embed = provider.embedtag;
  
          if (provider.nocache)
            src += "&_=" + Date.now();
  
          if (embed.tag === "iframe") {
            return `<iframe class='media' src='${escape_attr(src)}' `+
              `width='${embed.width || "auto"}' height='${embed.height || "auto"}' ` +
              `scrolling='${embed.scrolling || "no"}' frameborder='${embed.frameborder || "0"}' ` +
              // Personally not a fan of allow-same-origin, but some providers require it to work properly.
              // TODO: Provider should contain info if allow-same-origin is required.
              `allowfullscreen sandbox='allow-popups allow-scripts allow-same-origin' ` +
              `></iframe>`;
          }

          if (embed.tag === "audio") {
            return entry.rmc_element("", src, "audio", "media", "controls", "");            
          }

          if (embed.tag === "video") {
            return entry.rmc_element("", src, "video", "media", "controls", "");            
          }

          if (embed.tag === "img") {
            return entry.rmc_bigpicture("", src, "img", "media", "", "", url);            
          }

          return null;
        }

        // We need to request data from the endpoint and pass it through provider.templateData.
        try {
          data = await Embed.fetch_jsonp(src);
        } catch (err) { }
        return data && this.sandbox(provider.templateData(data));
      }

      return url.replace(provider.templateRegex, provider.template);
    }

    // We need to request the embed data from the provider and handle it on our own.

    src = provider.api;
    src += src.indexOf("?") < 0 ? "?" : "&";
    src += `format=${provider.format}&url=${encodeURIComponent(url)}`;

    try {
      data = await Embed.fetch_jsonp(src);
    } catch (err) { }
    if (!data)
      return null;
    
    switch (data.type) {
      case "photo":
      case "file":
        var title = "";
        if (data.title)
          title += data.title;
        if (data.author_name)
          title += (data.title ? " - " : "") + data.author_name;
        if (data.provider_name)
          title += ((data.title || data.author_name) ? " - " : "") + data.provider_name;

        if (data.url) {
          return entry.rmc_bigpicture("", data.url, "img", "media", `alt='${escape_attr(title)}'`, "", url);
        } else if (data.thumbnail_url) {
          return entry.rmc_bigpicture("", data.thumbnail_url.replace("_s", "_b"), "img", "media", `alt='${escape_attr(title)}'`, "", url);
        } else if (data.html) {
          return this.sandbox(data.html);
        }

        return null;
      
      case "video":
      case "rich":
          return this.sandbox(data.html);
        
      default:
        if (data.html) {
          return this.sandbox(data.html);
        }

        return null;
    }
    
    return null;
  })().then(result => {
    this.resolved = result;
    r.home.feed.refreshLazy("embed resolved");
  }))}

  this.sandbox = function(inner) {
    if (inner.trim().startsWith("<iframe ")) {
      // Trust that the provider returned nothing malicious.
      return inner;
    }

    // Fix // refering to dat://, not https://
    inner = inner.replace(Embed.protocolfix, "$1https://");
    
    return `<iframe class='media sandbox' srcdoc='${escape_attr(inner)}' ` +
      `frameborder='0' ` +
      `allowfullscreen sandbox='allow-popups allow-scripts' ` +
      `></iframe>`;
  }

}

Embed.providers = []; // Filled by embed_providers.js
Embed.get_provider = function(url) {
  for (var i in Embed.providers) {
    var provider = Embed.providers[i];
    for (var j in provider.urlschemes) {
      if (url.match(provider.urlschemes[j]))
        return provider;
    }
  }
  return null;
}

Embed.protocolfix = /(["'])\/\//g;

Embed.jsonp = []; // Used to store jsonp info.
Embed.fetch_jsonp = function(src, timeout = 10000) { return new Promise((resolve, reject) => {
  if (src.startsWith("//"))
    // Use https to prevent getting MITM'd.
    src = "https:" + src;
  var id = Embed.jsonp.length;
  Embed.jsonp[id] = { resolve: resolve, reject: reject };
  Embed.jsonp_iframe.contentWindow.postMessage({ type: "jsonp_request", id: id, src: src, timeout: timeout }, "*");
})}

// Receive and process messages from Embed.jsonp_iframe.
window.addEventListener("message", event => {
  if (!event.data || (event.data.type !== "jsonp_reject" && event.data.type !== "jsonp_resolve"))
    return;
  var cb = Embed.jsonp[event.data.id];
  Embed.jsonp[event.data.id] = null;
  if (event.data.type === "jsonp_resolve") {
    cb.resolve(event.data.data);
  } else {
    cb.reject(new Error(event.data.data));
  }
}, false);

// Add the jsonp iframe.
Embed.jsonp_iframe = document.createElement("iframe");
Embed.jsonp_iframe.sandbox = "allow-scripts";
Embed.jsonp_iframe.style.display = "none";
Embed.jsonp_iframe.srcdoc = `<html><head><script type='text/javascript' src='${r.url}/scripts/embed_sandbox_jsonp.js'></script></head><body></body></html>`;
if (document.body.firstElementChild)
  document.body.firstElementChild.before(Embed.jsonp_iframe);
else
  document.body.appendChild(Embed.jsonp_iframe);
