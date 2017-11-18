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
      var dummy_portal = {"url":this.target[0],"json":{"name":r.escape_html(portal_from_hash(this.target[0].toString())).substring(1)}};
      this.quote = new Entry(data.quote, dummy_portal);
    }
  
    this.is_seed = this.host ? r.home.portal.json.port.indexOf(this.host.url) > -1 : false;
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
    return "<a href='"+this.host.url+"' title='"+ title +"'><img class='icon' src='"+this.host.url+"/media/content/icon.svg'></a>";
  }

  this.header = function()
  {
    var html = ""

    html += "<t class='portal'><a href='"+this.host.url+"'>"+this.host.relationship()+r.escape_html(this.host.json.name)+"</a> "+this.rune()+" ";

    if(!this.expanded){
      for(i in this.target){
        if(this.target[i]){
          html += "<a href='" + r.escape_attr(this.target[i]) + "'>" + r.escape_html(portal_from_hash(this.target[i].toString())) + "</a>";
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
    
    if(this.host.json.name == r.home.portal.json.name && r.is_owner) {
      html += "<t class='tools'>";
      html += "<c data-operation='delete:"+this.id+"'>del</c> ";
      html += "<c data-operation='edit:"+this.id+" "+r.escape_attr(this.message)+"'>edit</c> ";
      html += "</t>";
    }

    return html+"<hr />";
  }

  this.body = function()
  {
    var html = "";
    html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t><br/>";
    return html;
  }

  this.thread = function(recursive, thread_id)
  {
    var html = "";
    if(recursive){
      html += "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+"'>";
      html += this.icon();
      html += "<t class='portal'><a href='"+this.host.url+"'>"+r.escape_html(portal_from_hash(this.host.url.toString()))+"</a> "+this.rune()+" </t>";
      html += "<c class='timestamp' title='"+this.localtime()+"'>"+timeSince(this.timestamp)+" ago</c><hr />";
      html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t><br/></div>";
      if(this.quote){ html += this.quote.thread(recursive, thread_id); }
      else{ html += "<t class='expand up' data-operation='collapse:"+thread_id+"' data-validate='true'>Collapse</t>"; }
    }
    else {
      html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t>";
      var length = this.thread_length();
      if(length > 0){
        html += "<t class='expand down' data-operation='expand:"+thread_id+"' data-validate='true'>Expand Conversation("+(length+1)+")</t>";
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

      if(audiotypes.indexOf(extension) > -1){ html += "<audio class='media' src='"+origin+"media/content/"+media+"' controls />"; }
      else if(videotypes.indexOf(extension) > -1){ html += "<video class='media' src='"+origin+"media/content/"+media+"' controls />"; }
      else if(imagetypes.indexOf(extension) > -1){ html += "<img class='media' src='"+origin+"media/content/"+media+"'/>"; }
      else{ html +="<a class='media' href='"+origin+"media/content/"+media+"'>&gt;&gt; "+media+"</a>"; }
    }
    return html;
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
    m = this.format_links(m);
    m = this.highlight_portal(m);
    m = this.link_portals(m);
    m = this.format_style(m);
    return m;
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
      if (word.length > 1 && word[0] == '#') {
        n += "<c class='hashtag' data-operation='filter "+word+"'>"+word+"</c>";        
        continue;
      }

      n += m.substring(c, space);
    }

    m = n;

    // Must resist urge to optimize... -ade
    // formats descriptive [md style](https://guides.github.com/features/mastering-markdown/#examples) links
    return m.replace(/{(.*?)\|(.*?)}/g, 
      function replacer(m, p1, p2) { return `<a href="${p2}">${p1}</a>`}
    )
  }

  this.highlight_portal = function(m)
  {
    return m.replace('@'+r.home.portal.json.name,'<t class="highlight">@'+r.escape_html(r.home.portal.json.name)+"</t>")
  }

  this.link_portals = function(m)
  {
    var words = m.split(" ");
    var n = [];
    for(id in words){
      var word = words[id];
      var name_match = r.operator.name_pattern.exec(word)
      var portals = []; // name_match ? r.index.lookup_name(name_match[1]) : [];
      if(portals.length > 0){
        var remnants = word.substr(name_match[0].length);
        n.push("<a href='"+portals[0].url+"' class='known_portal'>"+name_match[0]+"</a>"+remnants);
      }
      else{
        n.push(word)
      }
    }
    return n.join(" ").trim();
  }

  this.format_style = function(m)
  {
    var il;
    var ir;
    // il and ir are required as we check il < ir.
    // We don't want to replace *} {* by accident.
    // While we're at it, use substring (faster) instead of replace (slower).
    while ((il = m.indexOf("{*")) > -1 && (ir = m.indexOf("*}")) > -1 && il < ir) {
      m = m.substring(0, il) + "<b>" + m.substring(il + 2, ir) + "</b>" + m.substring(ir + 2);
    }
    while ((il = m.indexOf("{_")) > -1 && (ir = m.indexOf("_}")) > -1 && il < ir) {
      m = m.substring(0, il) + "<i>" + m.substring(il + 2, ir) + "</i>" + m.substring(ir + 2);
    }
    while ((il = m.indexOf("{-")) > -1 && (ir = m.indexOf("-}")) > -1 && il < ir) {
      m = m.substring(0, il) + "<del>" + m.substring(il + 2, ir) + "</del>" + m.substring(ir + 2);
    }
    while ((il = m.indexOf("{%")) > -1 && (ir = m.indexOf("%}")) > -1 && il < ir) {
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
    if(this.target){
      // Mention tag, eg '@dc'
      const mentionTag = '@' + r.home.portal.json.name
      const msg = this.message.toLowerCase()
      // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
      if(msg.endsWith(mentionTag) || msg.indexOf(mentionTag + ' ') > -1) {
        return true;
      }
      return has_hash(r.home.portal, this.target);
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
