function Entry(data,host)
{
  this.host = host;

  this.message = data.message;
  this.quote = data.quote;
  this.ref = data.ref;
  this.timestamp = data.timestamp;
  this.id = data.id;
  this.editstamp = data.editstamp;
  this.media = data.media;
  this.target = data.target;
  this.whisper = data.whisper;

  this.is_seed = this.host ? r.home.portal.json.port.indexOf(this.host.url) > -1 : false;

  this.to_json = function()
  {
    return {message:this.message,timestamp:this.timestamp,editstamp:this.editstamp,media:this.media,target:this.target,ref:this.ref,quote:this.quote,whisper:this.whisper};
  }

  this.to_html = function()
  {
    var html = "";

    html += this.icon();
    html += this.header();
    html += this.body();
    html += this.rmc();

    return "<div class='entry "+(this.whisper ? 'whisper' : '')+"'>"+html+"<hr/></div>";
  }

  this.icon = function()
  {
    return "<a href='"+this.host.url+"'><img class='icon' src='"+this.host.url+"/media/content/icon.svg'></a>";
  }

  this.header = function()
  {
    var html = ""

    html += "<t class='portal'><a href='"+this.host.url+"'>"+(this.is_seed ? "@" : "~")+this.host.json.name+"</a> "+this.rune()+" "+(this.target ? "<a href='"+this.target+"'>"+portal_from_hash(this.target.toString())+"</a>" : "")+"</t>";

    var operation = '';
    if(this.host.json.name == r.home.portal.json.name)
      operation = 'edit:'+this.id+' '+this.message.replace(/\'/g,"&apos;");
    else if(this.whisper)
      operation = "whisper:"+this.host.json.name+" ";
    else
      operation = "quote:"+this.host.json.name+"-"+this.id+" ";

    var offset = new Date().getTimezoneOffset()*60000;
    var date = new Date(this.timestamp - offset);
    var lz = (v)=> { return (v<10 ? '0':'')+v; };
    var localtime = ''+date.getFullYear()+'-'+lz(date.getMonth()+1)+'-'+lz(date.getDate())+' '+lz(date.getHours())+':'+lz(date.getMinutes());

    html += this.editstamp ? "<c class='editstamp' data-operation='"+operation+"' title='"+localtime+"'>edited "+timeSince(this.editstamp)+" ago</c>" : "<c class='timestamp' data-operation='"+operation+"' title='"+localtime+"'>"+timeSince(this.timestamp)+" ago</c>";

    html += this.host.json.name == r.home.portal.json.name && r.is_owner ? "<t class='tools'><t data-operation='delete:"+this.id+"'>del</t></t>" : "";

    return html+"<hr />";
  }

  this.body = function()
  {
    var html = "";
    html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t><br/>";
    if(this.quote){ html += "<t class='message quote' dir='auto'>"+(this.formatter(this.quote.message))+"</t><br/>"; }
    return html;
  }

  this.rmc = function() // Rich Media Content
  {
    var html = "";
    if(this.media){
      var parts = this.media.split(".")
      extension = parts[parts.length-1].toLowerCase();
      if (parts.length === 1) {
        this.media += ".jpg";
        extension = "jpg";
      } // support og media uploads
      audiotypes = ["mp3", "ogg", "wav"];
      videotypes = ["mp4", "webm"]; // "ogg",
      imagetypes = ["apng", "bmp", "dib", "gif", "jpg", "jpeg", "jpe", "png", "svg", "svgz", "tiff", "tif", "webp"];
      if(audiotypes.indexOf(extension) > -1){ html += "<audio class='media' src='"+this.host.url+"/media/content/"+this.media+"' controls />"; }
      else if(videotypes.indexOf(extension) > -1){ html += "<video class='media' src='"+this.host.url+"/media/content/"+this.media+"' controls />"; }
      else if(imagetypes.indexOf(extension) > -1){ html += "<img class='media' src='"+this.host.url+"/media/content/"+this.media+"'/>"; }
      else{ html +="<a class='media' href='"+this.host.url+"/media/content/"+this.media+"'>&gt;&gt; "+this.media+"</a>"; }
    }
    return html;
  }

  this.rune = function()
  {
    if(this.whisper){
      return "&";
    }
    if(this.quote){
      return "+";
    }
    if(this.target){
      return ">";
    }
    return "";
  }

  this.formatter = function(message)
  {
    return message.split(/\r\n|\n/).map(this.format_line, this).join("<br>");
  }

  this.format_line = function(m)
  {
    m = this.escape_html(m);
    m = this.format_links(m);
    m = this.highlight_portal(m);
    m = this.link_portals(m);
    m = this.format_style(m);
    return m;
  }

  this.escape_html = function(m)
  {
    return m
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  this.format_links = function(m)
  {
    var words = m.split(" ");
    var n = [];
    for(id in words){
      var word = words[id];
      if(word.substr(0,6) == "dat://"){
        var compressed = word.substr(0,12)+".."+word.substr(word.length-3,2);
        n.push("<a href='"+word+"'>"+compressed+"</a>");
      }
      else if(word.substr(0,1) == "#"){
        n.push("<c class='hashtag' data-operation='filter "+word+"'>"+word+"</c>");
      }
      else if (word.search(/^https?:\/\//) != -1) {
        try {
          var url = new URL(word)
          var compressed = word.substr(word.indexOf("://")+3,url.hostname.length + 15)+"..";
          n.push("<a href='"+url.href+"'>"+compressed+"</a>");
        } catch(e) {
          console.error("Error when parsing url:", word, e);
          n.push(word);
        }
      }
      else{
        n.push(word)
      }
    }
    return n.join(" ").trim();
  }

  this.highlight_portal = function(m)
  {
    return m.replace('@'+r.home.portal.json.name,'<t class="highlight">@'+r.home.portal.json.name+"</t>")
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
        n.push("<a href='"+portals[0].dat+"' class='known_portal'>"+name_match[0]+"</a>"+remnants);
      }
      else{
        n.push(word)
      }
    }
    return n.join(" ").trim();
  }

  this.format_style = function(m)
  {
    while(m.indexOf("{*") > -1 && m.indexOf("*}") > -1){
      m = m.replace('{*',"<b>").replace('*}',"</b>");
    }
    while(m.indexOf("{_") > -1 && m.indexOf("_}") > -1){
      m = m.replace('{_',"<i>").replace('_}',"</i>");
    }
    while(m.indexOf("{-") > -1 && m.indexOf("-}") > -1){
      m = m.replace('{-',"<del>").replace('-}',"</del>");
    }
    return m
  }

  this.time_ago = function()
  {
    return timeSince(this.timestamp);
  }

  this.is_visible = function(filter = null)
  {
    if(this.whisper && this.target != r.home.portal.json.dat && this.host.json.name != r.home.portal.json.name){
      return false;
    }
    if(filter && this.message.indexOf(filter) < 0){
      return false;
    }
    return true;
  }
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
