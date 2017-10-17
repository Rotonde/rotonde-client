function Entry(data)
{
  this.portal = data.portal ? data.portal : r.portal.data;
  this.message = data.message;
  this.timestamp = data.timestamp;
  this.dat = data.dat;
  this.id = data.id;
  this.editstamp = data.editstamp;
  this.media = data.media;
  this.target = data.target;
  this.seed = data.seed;

  this.to_json = function()
  {
    return {message:this.message,timestamp:this.timestamp,editstamp:this.editstamp,media:this.media,target:this.target};
  }

  this.to_html = function()
  {
    var html = "";

    html += "<a href='"+this.dat+"'><img class='icon' src='"+this.dat+"/media/content/icon.svg'></a>";

    html += "<t class='portal'><a href='"+this.dat+"'>"+(this.seed ? "@" : "~")+this.portal+"</a>"+(this.target ? " > <a href='"+this.target+"'>"+("@"+r.operator.name_pattern.exec(this.message)[1])+"</a>" : "")+"</t>";

    if(this.portal == r.portal.data.name){
      html += this.editstamp ? "<c class='editstamp' data-operation='"+('edit:'+this.id+' '+this.message.replace("'",""))+"'>edited "+timeSince(this.editstamp)+" ago</c>" : "<c class='timestamp' data-operation='edit:"+this.id+" "+this.message.replace("'","")+"'>"+timeSince(this.timestamp)+" ago</c>";
    }
    else{
      html += this.editstamp ? "<c class='editstamp' data-operation='@"+this.portal+": '>edited "+timeSince(this.editstamp)+" ago</c>" : "<c class='timestamp' data-operation='@"+this.portal+": '>"+timeSince(this.timestamp)+" ago</c>";
    }
    html += "<hr />";
    html += "<t class='message' dir='auto'>"+(this.formatter(this.message))+"</t><br/>";

    if(this.media){
      var parts = this.media.split(".")
      if (parts.length === 1) { this.media += ".jpg" } // support og media uploads
      html += "<img class='media' src='"+this.dat+"/media/content/"+this.media+"'/>";
    }
    return "<div class='entry'>"+html+"<hr/></div>";
  }

  this.formatter = function(message)
  {
    var m = message;

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
    return m.replace('@'+r.portal.data.name,'<t class="highlight">@'+r.portal.data.name+"</t>")
  }

  this.link_portals = function(m)
  {
    var words = m.split(" ");
    var n = [];
    for(id in words){
      var word = words[id];
      var name_match = r.operator.name_pattern.exec(word)
      if(name_match && r.feed.portals[name_match[1]]){
        var remnants = word.substr(name_match[0].length)
        n.push("<a href='"+r.feed.portals[name_match[1]].dat+"' class='known_portal'>"+name_match[0]+"</a>"+remnants);
      }
      else{
        n.push(word)
      }
    }
    return n.join(" ").trim();
  }
  this.format_style = function(m)
  {
    if(m.indexOf("{*") > -1 && m.indexOf("*}") > -1){
      m = m.replace('{*',"<b>").replace('*}',"</b>");
    }
    if(m.indexOf("{_") > -1 && m.indexOf("_}") > -1){
      m = m.replace('{_',"<i>").replace('_}',"</i>");
    }
    return m
  }

  this.time_ago = function()
  {
    return timeSince(this.timestamp);
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
