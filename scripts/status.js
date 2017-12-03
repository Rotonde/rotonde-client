function Status()
{
  this.el = document.createElement('div'); this.el.id = "status";
  this.h1 = document.createElement('h1'); this.h1.id = "status_head";
  this.logo = document.createElement('div'); this.logo.className = "logo";
  this.list = document.createElement('list');

  this.install = function(target)
  {
    this.el.appendChild(this.h1);
    this.el.appendChild(this.logo);
    this.el.appendChild(this.list);
    target.appendChild(this.el);
    this.start();
  }

  this.start = function()
  {
    this.h1.textContent = "Rotonde";
    setInterval(r.status.update,4000)
    r.operator.icon_el.addEventListener('mousedown',r.status.toggle, false);
  }

  this.toggle = function()
  {
    r.el.className = r.el.className == "rotonde" ? "rotonde sidebar" : "rotonde";
  }

  this.update = function()
  {
    r.status.h1.textContent = "Rotonde "+r.home.portal.json.client_version;

    var html = "";

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      html += "<ln class='"+(window.location.hash.replace("#","") == portal.json.name ? "filter" : "")+"'><a title='"+(portal.json.client_version ? portal.json.client_version : "Unversioned")+"' data-operation='filter:"+portal.json.name+"' data-validate='true' class='"+(portal.json.client_version && portal.json.client_version == r.home.portal.json.client_version ? "compatible" : "")+"'>"+portal.relationship()+escape_html(portal.json.name)+"</a><span class='time_ago'>"+(portal.updated(false) ? timeSince(portal.updated(false)) : 'XX')+" ago</span></ln>"
    }
    html = "<list>"+html+"</list>";
    if(r.status.list.innerHTML != html){
      r.status.list.innerHTML = html;  
    }
  }
}

r.confirm("script","status");