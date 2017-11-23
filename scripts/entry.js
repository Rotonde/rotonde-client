function Entry(data,host)
{
  this.expanded = false;
  
  this.update = function(data, host) {
    if (
      this.timestamp == data.timestamp &&
      this.editstamp == data.editstamp &&
      this.id == data.id
    ) return;

    this.host = host;
  
    this.message = data.message;
    this.ref = data.ref;
    this.timestamp = data.timestamp;
    this.id = data.id;
    this.editstamp = data.editstamp;
    this.media = data.media;
    this.target = data.target;
    this.whisper = data.whisper;
  
    if(this.target && !(this.target instanceof Array)){
      if(this.target.dat){ this.target = [this.target.dat]; }
      else{ this.target = [this.target ? this.target : ""]; }
    }
  
    this.quote = data.quote;
    if(data.quote && this.target && this.target[0]){
      var icon = this.target[0].replace(/\/$/, "") + "/media/content/icon.svg"
      // set the source's icon for quotes of remotes
      if (host && host.json && host.json.sameAs && has_hash(host.json.sameAs, this.target[0])) {
        icon = host.icon
      }
      var dummy_portal = {"url":this.target[0], "icon": icon, "json":{"name":r.escape_html(portal_from_hash(this.target[0].toString())).substring(1)}};
      this.quote = new Entry(data.quote, dummy_portal);
    }
  
    this.is_seed = this.host && has_hash(r.home.portal.json.port, this.host.url);
  }
  this.update(data, host);

  this.element = null;
  this.element_html = null;

  this.to_element = function(timeline, c, cmin, cmax, offset)
  {
    if (c < 0 || c < cmin || cmax <= c) {
      // Out of bounds - remove if existing, don't add.
      this.remove_element();
      return null;
    }

    var html = this.to_html();
    if (this.element_html != html) {
      if (this.element == null) {
        // Thin wrapper required.
        this.element = document.createElement('div');
        this.element.className = 'thin-wrapper';
      }
      this.element.innerHTML = html;
      this.element_html = html;
      timeline.appendChild(this.element);
    }

    // The entry is being added to an ordered collection.
    move_element(this.element, c - cmin + offset);

    return this.element;
  }

  this.remove_element = function() {
    if (this.element == null)
      return;
    // Simpler alternative than elem.parentElement.remove(elem);
    this.element.remove();
    this.element = null;
    this.element_html = null;
  }

  this.to_json = function()
  {
    var quote_json = this.quote ? this.quote.to_json() : this.quote;
    return {message:this.message,timestamp:this.timestamp,editstamp:this.editstamp,media:this.media,target:this.target,ref:this.ref,quote:quote_json,whisper:this.whisper};
  }

  this.to_html = function()
  {
    var html = "";

    html += this.icon();
    html += this.header();
    html += this.body();
    if(this.quote){
      var thread_id = r.escape_html(this.host.json.name)+"-"+this.id;
      html += "<div class='thread'>"+this.quote.thread(this.expanded, thread_id)+"</div>";
    }
    html += this.rmc();

    return "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+"'>"+html+"<hr/></div>";
  }

  this.icon = function()
  {
    var title = r.escape_html(this.host.json.name);
    var desc = r.escape_html(this.host.json.desc || "");
    if (desc){
        title += "\n" + desc;
    }
    return "<a href='"+this.host.url+"' title='"+ title +"'><img class='icon' src='"+this.host.icon+"'></a>";
  }

  this.header = function()
  {
    var html = ""

    var a_attr = "href='"+this.host.url+"'";
    if (this.host.url === r.client_url || this.host.url === "$rotonde") {
      a_attr = "style='cursor: pointer;' data-operation='filter:"+this.host.json.name+"'";
    }
    html += "<t class='portal'><a "+a_attr+">"+this.host.relationship()+r.escape_html(this.host.json.name)+"</a> "+this.rune()+" ";

    if(!this.expanded){
      for(i in this.target){
        if(this.target[i]){
          var a_attr = "href='" + r.escape_attr(this.target[i]) + "'";
          if (this.target[i] === r.client_url || this.target[i] === "$rotonde") {
            a_attr = "style='cursor: pointer;' data-operation='filter:"+r.home.feed.portal_rotonde.json.name+"'";
          }
          html += "<a "+a_attr+">" + r.escape_html(portal_from_hash(this.target[i].toString())) + "</a>";
        }else{
          html += "...";
        }
        if(i != this.target.length-1){
          html += ", ";
        }
      }
    }

    html += "</t><t class='link' data-operation='filter:"+r.escape_attr(this.host.json.name)+"-"+this.id+"'>•</t>";

    var operation = '';
    if(this.whisper)
      operation = r.escape_attr("whisper:"+this.host.json.name+" ");
    else
      operation = r.escape_attr("quote:"+this.host.json.name+"-"+this.id+" ");

    html += this.editstamp ? "<c class='editstamp' data-operation='"+operation+"' title='"+this.localtime()+"'>edited "+timeSince(this.editstamp)+" ago</c>" : "<c class='timestamp' data-operation='"+operation+"' title='"+this.localtime()+"'>"+timeSince(this.timestamp)+" ago</c>";
    
    html += "<t class='tools'>";
    if(this.host.json.name == r.home.portal.json.name && r.is_owner) {
      html += "<c data-operation='delete:"+this.id+"'>del</c> ";
      html += "<c data-operation='edit:"+this.id+" "+r.escape_attr(this.message)+"'>edit</c> ";
    }
    html += "<c data-operation='quote:"+r.escape_attr(this.host.json.name+"-"+this.id)+"'>quote</c> ";
    html += "</t>";

    return html+"<hr />";
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
        a_attr = "style='cursor: pointer;' data-operation='filter:"+this.host.json.name+"'";
      }
      html += "<t class='message' dir='auto'><a "+a_attr+"'>"+r.escape_html(portal_from_hash(this.host.url.toString()))+"</a> "+(this.formatter(this.message))+"</t></div>";
      if(this.quote){ html += this.quote.thread(recursive, thread_id); }
      else{ html += "<t class='expand up' data-operation='collapse:"+thread_id+"' data-validate='true'>Collapse</t>"; }
    }
    else {
      html += "<t class='message' dir='auto'>"+this.icon()+"<a "+a_attr+"'>"+r.escape_html(portal_from_hash(this.host.url.toString()))+"</a> "+(this.formatter(this.message))+"</t>";
      var length = this.thread_length();
      if(length > 0){
        html += "<t class='expand down' data-operation='expand:"+thread_id+"' data-validate='true'>Expand "+(length+1)+" entries</t>";
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
    }
    return html;
  }
  this.rmc_element = function(origin, media, tag, classes = "media", extra = "", inner = "")
  {
    return "<"+tag+" class='"+classes+"' "+(tag==="a"?"href":"src")+"='"+origin+"media/content/"+media+"' "+extra+">"+inner+"</"+tag+">";
  }
  this.rmc_bigpicture = function(origin, media, tag, classes = "media", extra = "", inner = "")
  {
    return this.rmc_element(origin, media, "a", "thin-wrapper", "onclick='return false'",
      this.rmc_element(origin, media, tag, classes, extra + " data-operation='big:"+this.host.json.name+"-"+this.id+"' data-validate='true'", inner)
    );
  }

  this.big = function()
  {
    r.home.feed.bigpicture_toggle(() => this.to_html());
  }

  this.rune = function()
  {
    if(this.whisper){
      return create_rune("feed", "whisper");
    }
    if(this.quote){
      return create_rune("feed", "quote");
    }
    if(this.target && this.target.length != 0){
      // Fun fact: this.target.length != 0 works for strings ("".length == 0),
      // but also for arrays ([].length == 0).
      return create_rune("feed", "mention");
    }
    return "";
  }

  this.formatter = function(message)
  {
    return message.split(/\r\n|\n/).map(this.format_line, this).join("<br>");
  }

  this.format_line = function(m)
  {
    m = r.escape_html(m);
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
            console.error("Error when parsing url:", word, e);
          }
        }

        n += "<a href='"+word+"'>"+compressed+"</a>";        
        continue;
      }

      // Check for #
      if (word.length > 1 && word[0] === '#') {
        n += "<c class='hashtag' data-operation='filter "+word+"'>"+word+"</c>";        
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
    return m.replace('@'+r.home.portal.json.name,'<t class="highlight">@'+r.escape_html(r.home.portal.json.name)+"</t>")
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
        if (name_match[1] == r.home.portal.json.name) {
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
      
      m = `${left}<img class="inline" src="${r.escape_attr(src)}" alt="" title="${r.escape_attr(mid)}" />${right}`;
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
    
    if(filter && this.message.indexOf(filter) < 0){
      return false;
    }

    if(feed_target == "mentions"){
      return this.is_mention && !this.whisper && this.host.url != r.home.portal.url;
    }
    if(feed_target == "whispers"){
      return this.whisper;
    }
    if(feed_target && feed_target != this.host.json.name){
      return false;
    }

    return true;
  }

  this.detect_mention = function()
  {
    // Mention tag, eg '@dc'
    const mentionTag = '@' + r.home.portal.json.name
    const msg = this.message.toLowerCase()
    // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
    if(msg.endsWith(mentionTag) || msg.indexOf(mentionTag + ' ') > -1) {
      return true;
    }

    // check for mentions of our portal or of one of our remotes in sameAs
    if (this.target && this.target.length > 0) {
      var has_mention = has_hash(r.home.portal, this.target);
      if (r.home.portal.json && r.home.portal.json.sameAs) {
        has_mention = has_mention || has_hash(r.home.portal.json.sameAs, this.target);
      }
      return has_mention;
    }
    return false;
  }

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

r.confirm("script","entry");
