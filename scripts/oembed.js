function OEmbed(url) {
  this.url = url;
  this.provider = OEmbed.get_provider(url);
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

          if (embed.tag === "img") {
            return entry.rmc_bigpicture("", src, "img", "media", "", "", url);            
          }

          return null;
        }

        // We need to request data from the endpoint and pass it through provider.templateData.
        try {
          data = await this.fetch_jsonp(src);
        } catch (err) { }
        return data && this.sandbox(provider.templateData(data));
      }

      return url.replace(provider.templateRegex, provider.template);
    }

    // We need to request the oembed data from the provider and handle it on our own.

    src = provider.api;
    src += src.indexOf("?") < 0 ? "?" : "&";
    src += `format=${provider.format}&url=${encodeURIComponent(url)}`;

    try {
      data = await this.fetch_jsonp(src);
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
    r.home.feed.refresh("oembed resolved");
  }))}

  this.sandbox = function(inner) {
    if (inner.trim().startsWith("<iframe ")) {
      // Trust that the provider returned nothing malicious.
      return inner;
    }

    // Fix // refering to dat://, not https://
    inner = inner.replace(OEmbed.protocolfix, "$1https://");
    
    return `<iframe class='media sandbox' srcdoc='${escape_attr(inner)}' ` +
      `frameborder='0' ` +
      `allowfullscreen sandbox='allow-popups allow-scripts' ` +
      `></iframe>`;
  }

  this.fetch_jsonp = function(src, timeout = 10000) { return new Promise((resolve, reject) => {
    if (src.startsWith("//"))
      // Use https to prevent getting MITM'd.
      src = "https:" + src;

    var id = OEmbed.jsonp.length;
    
    src += `&callback=OEmbed.jsonp[${id}]`;

    var el = document.createElement("script");
    el.type = "text/javascript";
    el.async = true;
    el.src = src;

    var rejectout = setTimeout(() => {
      OEmbed.jsonp[id] = null;
      el.remove();
      reject(new Error("jsonp request failed, timeout!"));
    }, timeout);

    OEmbed.jsonp[id] = data => {
      clearTimeout(timeout);
      if (!OEmbed.jsonp[id])
        return;
      OEmbed.jsonp[id] = null;
      el.remove();
      resolve(data);
    };

    document.head.appendChild(el);
  })}

}

OEmbed.providers = []; // Filled by oembed_providers.js
OEmbed.get_provider = function(url) {
  for (var i in OEmbed.providers) {
    var provider = OEmbed.providers[i];
    for (var j in provider.urlschemes) {
      if (url.match(provider.urlschemes[j]))
        return provider;
    }
  }
  return null;
}

OEmbed.protocolfix = /(["'])\/\//g;

OEmbed.jsonp = []; // Used to store the jsonp callbacks.

// oembed_providers depends on oembed
r.requirements.script.push("oembed_providers");
r.install_script("oembed_providers");
r.confirm("script","oembed");
