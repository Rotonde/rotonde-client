// This wouldn't be possible without the providers data from https://github.com/nfl/jquery-oembed-all/blob/master/jquery.oembed.js
function OEmbedProvider(name, type, urlschemesarray, apiendpoint, extraSettings) {
  this.name = name;
  this.type = type; // "photo", "video", "link", "rich", null
  this.urlschemes = urlschemesarray;
  for (var i in this.urlschemes) {
    this.urlschemes[i] = new RegExp(this.urlschemes[i], "i");
  }
  this.apiendpoint = apiendpoint;
  this.maxWidth = 500;
  this.maxHeight = 400;
  extraSettings = extraSettings || {};

  for (var property in extraSettings) {
      this[property] = extraSettings[property];
  }

  this.format = this.format || "json";
  this.callbackparameter = this.callbackparameter || "callback";
  this.embedtag = this.embedtag || {tag: ""};
};

function OEmbed() {

  this.setup = function()
  {
    // nop at the moment.
  }

  this.get_provider = function(url)
  {
    for (var i in r.oembed_providers) {
      var provider = r.oembed_providers[i];
      for (var j in provider.urlschemes) {
        if (url.match(provider.urlschemes[j]))
          return provider;
      }
    }
    return null;
  }

  this.get_embed = async function(entry, url)
  {
    var provider = this.get_provider(url);
    if (!provider) return null;

    var src, data;

    if (provider.templateRegex) {
      // We've got a template for the provider.

      if (provider.apiendpoint) {
        src = url.replace(provider.templateRegex, provider.apiendpoint);
        if (src.startsWith("//"))
          src = "https:" + src;

        if (provider.embedtag) {
          // The provider makes embedding easy.
          var embed = provider.embedtag;
          if (embed.tag !== "iframe")
            return null; // Flash (<embed>) and other non-iframe embeds not supported.
  
  
          if (!provider.nocache)
            src += "&_=" + Date.now();
  
          return `<iframe src='${escape_attr(src)}' `+
            `width='${embed.width || "auto"}' height='${embed.height || "auto"}' `+
            `scrolling='${embed.scrolling || "no"}' frameborder='${embed.frameborder || "0"}' `+
            // Personally not a fan of allow-same-origin, but pages require it to work properly.
            // TODO: Provider should contain info if allow-same-origin is required.
            `allowfullscreen sandbox='allow-popups allow-scripts allow-same-origin' ` +
            `/>`;
        
        }

        // We need to request data from the endpoint and pass it through provider.templateData.
        try {
          data = await this.fetch_jsonp(src);
        } catch (err) { }
        if (!data)
          return null;
        return provider.templateData(data);
      }

      return url.replace(provider.templateRegex, provider.template);
    }

    // We need to request the oembed data from the provider and handle it on our own.

    src = provider.apiendpoint;
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
  }

  this.sandbox = function(inner) {
    if (inner.trim().startsWith("<iframe ")) {
      // Trust that the provider returned nothing malicious.
      return inner;
    }
    return `<iframe srcdoc='${escape_attr(inner)}' `+
      `seamless `+
      `allowfullscreen sandbox='allow-popups allow-scripts' ` +
      `/>`;
  }

  this.fetch_jsonp = function(src, timeout = 1000) { return new Promise((resolve, reject) => {
    if (src.startsWith("//"))
      src = "https:" + src;

    var id = __oembed_jsonp__.length;
    
    src += `&callback=__oembed_jsonp__[${id}]`;

    var el = document.createElement("script");
    el.type = "text/javascript";
    el.src = src;
    el.async = true;

    var rejectout = setTimeout(() => {
      __oembed_jsonp__[id] = null;
      el.remove();
      reject(new Error("jsonp request failed, timeout!"));
    }, timeout);

    __oembed_jsonp__[id] = data => {
      clearTimeout(timeout);
      if (!__oembed_jsonp__[id])
        return;
      __oembed_jsonp__[id] = null;
      el.remove();
      resolve(data);
    };

    document.head.appendChild(el);
  })}

}

__oembed_jsonp__ = [];

r.confirm("script","oembed");
