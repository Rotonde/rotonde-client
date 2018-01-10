function Entry(data,host)
{
  this.expanded = false;
  this.embed_expanded = false;
  this.pinned = false;

  this.update = function(data, host) {
    data.timestamp = data.timestamp || data.createdAt;
    data.editstamp = data.editstamp || data.editedAt;
    data.id = data.id || data.timestamp;
    if (
      this.timestamp == data.timestamp &&
      this.editstamp == data.editstamp &&
      this.id == data.id
    ) return;

    this.host = host;

    if (data.getRecordURL) {
      this.url = data.getRecordURL();
      var index = this.url.lastIndexOf("/");
      if (index > 0 && this.url.toLowerCase().endsWith(".json")) {
        this.id = this.url.substring(index + 1, this.url.length - 5);
      }
    } else {
      this.id = data.id || data.timestamp;
      this.url = host ? "dat://" + to_hash(host.url) + "/posts/" + this.id + ".json" : null;      
    }

    this.message = data.text || data.message;
    this.ref = data.ref;
    this.timestamp = data.createdAt || data.timestamp;
    this.editstamp = data.editedAt || data.editstamp;
    this.media = data.media;
    this.target = data.target;
    this.whisper = data.whisper;
    this.topic = data.message && data.message.substr(0,1) == "#" ? data.message.split(" ")[0].replace("#","").trim() : null;
    
    if(this.target && !(this.target instanceof Array)){
      if(this.target.dat){ this.target = [this.target.dat]; }
      else{ this.target = [this.target ? this.target : ""]; }
    }

    if (!this.target) {
      if (data.threadParent) {
        this.target = ["dat://"+to_hash(data.threadParent)+"/"];
      } else {
        this.target = [];
      }
    }

    if(data.quote && this.target && this.target[0]){
      var icon = this.target[0].replace(/\/$/, "") + "/media/content/icon.svg"
      // set the source's icon for quotes of remotes
      if (host && host.sameas && has_hash(host.sameas, this.target[0])) {
        icon = host.icon
      }
      var dummy_portal = { "url":this.target[0], "icon": icon, "name": escape_html(name_from_hash(this.target[0])) };
      this.quote = new Entry(data.quote, dummy_portal);
      this.topic = this.quote.topic ? this.quote.topic : this.topic;
    } else if (data.threadParent) {
      // Try resolving the thread parent as the quote.
      r.db.feed.get(data.threadParent).then(record => {
        if (!record)
          return;
        this.target = ["dat://"+to_hash(data.threadParent)+"/"];
        var dummy_portal = { "url": this.target[0], "icon": this.target[0] + "/media/content/icon.svg", "name": escape_html(name_from_hash(this.target[0])) };
        this.quote = new Entry(record, dummy_portal);
        r.home.feed.refresh("lazily resolved quote");
      });
    }
  }
  this.update(data, host);

  this.to_json = function()
  {
    return {
      text: this.message,
      createdAt: this.timestamp,
      editedAt: this.editstamp,
      ref: this.ref,
      target: this.target,
      whisper: this.whisper,
      media: this.media,
      quote: this.quote ? this.quote.to_json() : this.quote,
      threadRoot: this.threadRoot || this.quote ? this.thread_root().url : null,
      threadParent: this.threadParent || this.quote ? this.quote.url : null,
    }
  }

  this.to_html = function()
  {
    var html = "";

    var embed_needs_refresh = false; // Helpful when the detect_embed promise resolves immediately.
    this.detect_embed().then(e => {
      // If no embed was ever found, return.
      if (!this.embed && !e) return;
      // If no embed was found before, found now or if both embeds mismatch, update.
      var refresh = !this.embed || !e || this.embed.url !== e.url;
      this.embed = e;
      if (refresh && embed_needs_refresh) {
        // If embed updated and promise resolved too late, trigger feed refresh.
        r.home.feed.refresh("embed in post updated");
      }
    });

    html += this.icon();
    html += this.header();
    html += this.body();
    if(this.quote){
      var quote = this.quote;
      if (!this.expanded)
        while (!quote.message && quote.quote)
          quote = quote.quote;
      var thread_id = escape_html(this.host.name)+"-"+this.id;
      html += "<div class='thread'>"+quote.thread(this.expanded, thread_id)+"</div>";
    }
    if(!this.quote || this.quote && this.expanded || this.quote && !this.message){
      embed_needs_refresh = true;
      html += this.rmc();
    }

    return "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+" "+(this.quote ? 'quote' : '')+" "+(this.quote && !this.message ? 'bump' : '')+"'>"+html+"<hr/></div>";
  }

  this.icon = function()
  {
    var title = escape_html(this.host.name);
    var desc = escape_html(this.host.desc || "");
    if (desc){
        title += "\n" + desc;
    }
    return "<a href='"+this.host.url+"' title='"+ title +"'><img class='icon' src='"+this.host.icon+"'></a>";
  }

  this.header = function()
  {
    var html = ""

    if (this.pinned) html += "<c class='pinnedtext'>pinned entry</c>";

    var a_attr = "href='"+this.host.url+"'";
    if (this.host.url === r.client_url || this.host.url === "$rotonde") {
      a_attr = "style='cursor: pointer;' data-operation='filter:"+escape_attr(this.host.name)+"'";
    }
    html += this.topic ? "<a data-operation='filter #"+escape_attr(this.topic.toLowerCase())+"' class='topic'>#"+escape_html(this.topic)+"</a>" : "";
    html += "<t class='portal'><a "+a_attr+">"+this.host.relationship()+escape_html(this.host.name)+"</a> "+this.action()+" ";

    for(i in this.target){
      if(this.target[i]){
        var a_attr = "href='" + escape_attr(this.target[i]) + "'";
        if (this.target[i] === r.client_url || this.target[i] === "$rotonde") {
          a_attr = "style='cursor: pointer;' data-operation='filter:"+escape_attr(this.host.name)+"'";
        }
        html += "<a "+a_attr+">" + relationship_from_hash(this.target[i]) + escape_html(name_from_hash(this.target[i])) + "</a>";
      }else{
        html += "...";
      }
      if(i != this.target.length-1){
        html += ", ";
      }
    }

    html += "</t> ";
    var operation = escape_attr("quote:"+this.host.name+"-"+this.id+" ");
    html += this.editstamp ? "<c class='editstamp' data-operation='"+operation+"' title='"+this.localtime()+"'>edited "+timeSince(this.editstamp)+" ago</c>" : "<c class='timestamp' data-operation='"+operation+"' title='"+this.localtime()+"'>"+timeSince(this.timestamp)+" ago</c>";


    html += "<t class='tools'>";
    if(this.host.name == r.home.portal.name && r.is_owner) {
      html += "<c data-operation='delete:"+this.id+"'>del</c> ";
      html += "<c data-operation='edit:"+this.id+" "+escape_attr(this.message)+"'>edit</c> ";
    }
    if(!this.whisper){
      html += "<c data-operation='quote:"+escape_attr(this.host.name+"-"+this.id)+"'>quote</c> ";
    }

    html += "</t>";

    return "<c class='head'>"+html+"</c>";
  }

  this.body = function()
  {
    var html = "";
    html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t>";
    return html;
  }

  this.thread = function(recursive, thread_id)
  {
    var html = "";
    if(recursive){
      html += "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+"'>";
      html += this.icon();
      var a_attr = "href='"+this.host.url+"'";
      if (this.host.url === r.client_url || this.host.url === "$rotonde") {
        a_attr = "style='cursor: pointer;' data-operation='filter:"+escape_attr(this.host.name)+"'";
      }
      html += "<t class='message' dir='auto'><a "+a_attr+"'>"+relationship_from_hash(this.host.url)+escape_html(name_from_hash(this.host.url))+"</a> "+(this.formatter(this.message))+"</t></div>";
      if(this.quote){ html += this.quote.thread(recursive, thread_id); }
      else{ html += "<t class='expand up' data-operation='collapse:"+thread_id+"' data-validate='true'>Collapse</t>"; }
    }
    else {
      html += "<t class='message' dir='auto'>"+this.icon()+"<a "+a_attr+"'>"+relationship_from_hash(this.host.url)+escape_html(name_from_hash(this.host.url))+"</a> "+(this.formatter(this.message))+"</t>";
      var length = this.thread_length();
      if(length > 0 || this.media){
        html += "<t class='expand down' data-operation='expand:"+thread_id+"' data-validate='true'>"+(length > 0 ? "Expand "+(length+1)+" Entries" : "Expand Entry")+"</t>";
      }
    }
    return html;
  }

  this.rmc = function() // Rich Media Content
  {
    var html = "";
    if(this.media){
      // We hope that the URI's already encoded.
      // We can't encode it here as that'd break previously encoded URIs (see: operator.commands.say).
      var media = this.media;
      if (media.startsWith("/"))
        media = media.substring(1);
      else if (media.startsWith("%2F"))
        media = media.substring(3);
      if (media.startsWith("media/content/"))
        media = media.substring("media/content/".length);
      else if (media.startsWith("media%2Fcontent%2F"))
        media = media.substring("media%2Fcontent%2F".length);
      var parts = media.split(".")
      extension = parts[parts.length-1].toLowerCase();
      if (parts.length === 1) { // support og media uploads
        media += ".jpg";
        extension = "jpg";
      }
      audiotypes = ["m4a", "mp3", "oga", "ogg", "opus"];
      videotypes = ["mp4", "ogv", "webm"];
      imagetypes = ["apng", "gif", "jpg", "jpeg", "jpe", "png", "svg", "svgz", "tiff", "tif", "webp"];

      var origin = this.thread_root().host.url;
      origin += origin.toString().slice(-1) == "/" ? "" : "/";

      if(audiotypes.indexOf(extension) > -1){ html += this.rmc_element(origin, media, "audio", "media", "controls", ""); }
      else if(videotypes.indexOf(extension) > -1){ html += this.rmc_element(origin, media, "video", "media", "controls", ""); }
      else if(imagetypes.indexOf(extension) > -1){ html += this.rmc_bigpicture(origin, media, "img", "media", "", ""); }
      else{ html += this.rmc_element(origin, media, "a", "media", "", "&gt;&gt; "+media); }
    } else if (this.embed && this.embed.provider) {
      var embed_id = escape_html(this.host.name)+"-"+this.id;
      html += "<div class='media embed'>";
      if (this.embed_expanded) {
        if (this.embed.resolved === undefined) { // If still resolving
          this.embed.resolve(this);
          html += "<t class='expand preload'>Loading content...</t>";
        } else if (this.embed.resolved) { // If resolved properly
          html += "<div>" + this.embed.resolved + "</div>";
          html += "<t class='expand up' data-operation='embed_collapse:"+embed_id+"' data-validate='true'>Hide content</t>";
        } else {
          html += "<t class='expand'>Content not supported.</t>";
        }
      } else {
        var provider = this.embed.url;
        provider = provider.substring(provider.indexOf("/") + 2);
        provider = provider.substring(0, provider.indexOf("/"));
        html += "<t class='expand down' data-operation='embed_expand:"+embed_id+"' data-validate='true'>Show content from "+provider+"</t>";
      }
      html += "</div>"
    }
    return html;
  }
  this.rmc_element = function(origin, media, tag, classes = "media", extra = "", inner = "")
  {
    return "<"+tag+" class='"+classes+"' "+(tag==="a"?"href":"src")+"='"+(origin?(origin+"media/content/"+media):media)+"' "+extra+">"+inner+"</"+tag+">";
  }
  this.rmc_bigpicture = function(origin, media, tag, classes = "media", extra = "", inner = "", href = "")
  {
    return this.rmc_element(origin, href || media, "a", "thin-wrapper", "onclick='return false' target='_blank'",
      this.rmc_element(origin, media, tag, classes, extra + " data-operation='big:"+escape_attr(this.host.name)+"-"+this.id+"' data-validate='true'", inner)
    );
  }

  this.big = function()
  {
    r.home.feed.bigpicture_toggle(() => this.to_html());
  }

  this.action = function()
  {
    if(this.whisper){
      return "whispered to";
    }
    if(this.quote && !this.message){
      return "bumped";
    }
    if(this.quote){
      return "quoted";
    }
    if(this.target && this.target.length != 0){
      return "mentioned";
    }
    return "";
  }

  this.formatter = function(message)
  {
    message = this.topic ? message.replace("#"+this.topic,"").trim() : message;
    return message.split(/\r\n|\n/).map(this.format_line, this).join("<br>");
  }

  this.format_line = function(m)
  {
    m = escape_html(m);
    m = this.format_style(m);
    m = this.format_links(m);
    m = this.link_portals(m);
    return m;
  }

  this.format_escaped = function(m, i)
  {
    return m[i - 1] === "\\" && (m.substring(0, i - 1) + m.substring(i));
  }

  this.format_links = function(m)
  {
    // Temporary output string.
    // Note: += is faster than Array.join().
    var n = "";
    var space;
    // c: current char index
    for (var c = 0; c < m.length; c = space + 1) {
      if (c > 0)
        n += " ";

      space = m.indexOf(" ", c);
      if (space <= -1)
        space = m.length;
      var word = m.substring(c, space);

      // Check for URL
      var is_url_dat = word.startsWith("dat://");
      var is_url_http = word.startsWith("http://");
      var is_url_https = word.startsWith("https://");
      if (is_url_dat || is_url_http || is_url_https) {
        var compressed = word;

        if (is_url_dat && word.length > 16) {
          compressed = word.substr(0,12)+".."+word.substr(word.length-3,2);

        } else if (is_url_http || is_url_https) {
          try {
            var url = new URL(word);
            var cutoffLen = url.hostname.length + 15;
            var compressed = word.substr(is_url_https ? 8 : is_url_http ? 7 : (word.indexOf("://") + 3));
            if (compressed.length > cutoffLen) {
              compressed = compressed.substr(0, cutoffLen)+"..";
            }
          } catch(e) {
            // console.error("Error when parsing url:", word, e);
          }
        }

        n += "<a href='"+word+"'>"+compressed+"</a>";
        continue;
      }

      // Check for #
      if (word.length > 1 && word[0] === '#') {
        var word_filter = word;
        // Remove any unwanted symbols from the end of the "filter word".
        while (
          word_filter[word_filter.length - 1] === '.' ||
          word_filter[word_filter.length - 1] === ',' ||
          word_filter[word_filter.length - 1] === ';' ||
          word_filter[word_filter.length - 1] === '"' ||
          word_filter[word_filter.length - 1] === '}' ||
          word_filter[word_filter.length - 1] === '{'
        )
          word_filter = word_filter.substring(0, word_filter.length - 1);
        n += "<c class='hashtag' data-operation='filter "+word_filter+"'>"+word.substring(0, word_filter.length)+"</c>"+word.substring(word_filter.length);
        continue;
      }

      // Check for { upcoming | and }
      if (word.length > 1 && word[0] === '{' && m[c - 1] !== "\\") {
        var linkbr = m.indexOf("|", c);
        if (linkbr < 0) { n += word; continue; }
        var linkend = m.indexOf("}", linkbr);
        if (linkend < 0) { n += word; continue; }
        n += "<a href='"+m.substring(linkbr + 1, linkend)+"'>"+m.substring(c + 1, linkbr)+"</a>";
        space = linkend;
        continue;
      }

      n += word;
    }

    return n;
  }

  // link_portals does the job better.
  this.highlight_portal = function(m)
  {
    return m.replace('@'+r.home.portal.name,'<t class="highlight">@'+escape_html(r.home.portal.name)+"</t>")
  }

  this.link_portals = function(m)
  {
    // Temporary output string.
    // Note: += is faster than Array.join().
    var n = "";
    var space;
    // c: current char index
    for (var c = 0; c < m.length; c = space + 1) {
      if (c > 0)
        n += " ";

      space = m.indexOf(" ", c);
      if (space <= -1)
        space = m.length;
      var word = m.substring(c, space);

      var name_match;
      if (word.length > 1 && word[0] == "@" && (name_match = r.operator.name_pattern.exec(word))) {
        var remnants = word.substr(name_match[0].length);
        if (name_match[1] == r.home.portal.name) {
          n += "<t class='highlight'>"+name_match[0]+"</t>"+remnants;
          continue;
        }
        var portals = r.operator.lookup_name(name_match[1]);
        if (portals.length > 0) {
          n += "<a href='"+portals[0].url+"' class='known_portal'>"+name_match[0]+"</a>"+remnants;
          continue;
        }
      }

      n += word;
    }

    return n;
  }

  this.format_style = function(m)
  {
    var il;
    var ir;
    // il and ir are required as we check il < ir.
    // We don't want to replace *} {* by accident.
    // While we're at it, use substring (faster) instead of replace (slower).

    ir = 0;
    while ((il = m.indexOf("{*", ir)) > -1 && (ir = m.indexOf("*}", il)) > -1) {
      m = this.format_escaped(m, il) || (m.substring(0, il) + "<b>" + m.substring(il + 2, ir) + "</b>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{_", ir)) > -1 && (ir = m.indexOf("_}", il)) > -1) {
      m = this.format_escaped(m, il) || (m.substring(0, il) + "<i>" + m.substring(il + 2, ir) + "</i>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{#", ir)) > -1 && (ir = m.indexOf("#}", il)) > -1) {
      m = this.format_escaped(m, il) || (m.substring(0, il) + "<code>" + m.substring(il + 2, ir) + "</code>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{-", ir)) > -1 && (ir = m.indexOf("-}", il)) > -1) {
      m = this.format_escaped(m, il) || (m.substring(0, il) + "<del>" + m.substring(il + 2, ir) + "</del>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{%", ir)) > -1 && (ir = m.indexOf("%}", il)) > -1) {
      var escaped;
      if (escaped = this.format_escaped(m, il)) {
        m = escaped;
        continue;
      }
      var left = m.substring(0, il);
      var mid = m.substring(il + 2, ir);
      var right = m.substring(ir + 2);

      var origin = this.host.url;
      origin += origin.slice(-1) == "/" ? "" : "/";
      var src = origin + 'media/content/inline/' + mid;

      if (src.indexOf('.') == -1) {
          src = src + '.png'; // Default extension: .png
      } else {
          mid = mid.substring(0, mid.lastIndexOf('.'));
      }

      m = `${left}<img class="inline" src="${escape_attr(src)}" alt="" title="${escape_attr(mid)}" />${right}`;
    }

    return m
  }

  this.__localtime__ = null;
  this.__localtime_stamp__ = null;
  this.localtime = function()
  {
    if (this.__localtime_stamp__ == this.timestamp)
      return this.__localtime__;
    var date = new Date(this.__localtime_stamp__ = this.timestamp);
    var lz = (v)=> { return (v<10 ? '0':'')+v; };
    return this.__localtime__ = ''+date.getFullYear()+'-'+lz(date.getMonth()+1)+'-'+lz(date.getDate())+' '+lz(date.getHours())+':'+lz(date.getMinutes());
  }

  this.time_ago = function()
  {
    return timeSince(this.timestamp);
  }

  this.is_visible = function(filter = null,feed_target = null)
  {
    if(this.whisper){
      if(!has_hash(r.home.portal, this.target) && r.home.portal.url != this.host.url)
        return false;
    }

    if(filter && this.message.toLowerCase().indexOf(filter.toLowerCase()) < 0){
      return false;
    }

    if(feed_target == "all"){
      return true;
    }

    if(feed_target == "mentions"){
      return this.is_mention && !this.whisper && this.host.url != r.home.portal.url;
    }
    if(feed_target == "whispers"){
      return this.whisper;
    }
    if(feed_target == "discovery"){
      return this.host.is_discovered;
    } else if(this.host.is_discovered) {
      return false;
    }
    if(feed_target && feed_target != this.host.name){
      return false;
    }

    return true;
  }

  this.detect_mention = function()
  {
    // Mention tag, eg '@dc'
    const mentionTag = '@' + r.home.portal.name
    const msg = this.message.toLowerCase()
    // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
    if(msg.endsWith(mentionTag) || msg.indexOf(mentionTag + ' ') > -1) {
      return true;
    }

    // check for mentions of our portal or of one of our remotes in sameAs
    if (this.target && this.target.length > 0) {
      var has_mention = has_hash(r.home.portal, this.target);
      if (r.home.portal.sameas) {
        has_mention = has_mention || has_hash(r.home.portal.sameas, this.target);
      }
      return has_mention;
    }
    return false;
  }

  this.__detecting_embed__ = null;
  this.__detected_embed_message__ = null;
  this.__detected_embed__ = null;
  this.detect_embed = function() { return this.__detecting_embed__ || (this.__detecting_embed__ = (async () => {
    if (this.media) {
      this.__detecting_embed__ = null;
      return null;
    }

    var m = this.message;

    if (m === this.__detected_embed_message__) {
      return this.__detected_embed__;
    }
    this.__detected_embed_message__ = m;

    var space, embed;
    // c: current char index
    for (var c = 0; c < m.length; c = space + 1) {
      space = m.indexOf(" ", c);
      if (space <= -1)
        space = m.length;
      var word = m.substring(c, space);

      // Check for URL
      var is_url_dat = word.startsWith("dat://");
      var is_url_http = word.startsWith("http://");
      var is_url_https = word.startsWith("https://");
      if (is_url_dat || is_url_http || is_url_https) {
        embed = new OEmbed(word);
        if (embed) {
          this.__detecting_embed__ = null;
          return embed;
        }
        continue;
      }

      // Check for { upcoming | and }
      if (word.length > 1 && word[0] === '{' && m[c - 1] !== "\\") {
        var linkbr = m.indexOf("|", c);
        if (linkbr < 0) { continue; }
        var linkend = m.indexOf("}", linkbr);
        if (linkend < 0) { continue; }

        embed = new OEmbed(m.substring(linkbr + 1, linkend));
        if (embed) {
          this.__detecting_embed__ = null;
          return embed;
        }
        continue;
      }

    }

    var embed = this.quote && this.quote.detect_embed ? await this.quote.detect_embed() : null;
    this.__detecting_embed__ = null;
    return this.__detected_embed__ = embed;
  })())}

  this.thread_length = function()
  {
    return this.quote ? this.quote.thread_length() + 1 : 0;
  }

  this.thread_root = function()
  {
    return this.quote ? this.quote.thread_root() : this;
  }

  this.is_mention = this.detect_mention()
}

r.confirm("script","entry");
