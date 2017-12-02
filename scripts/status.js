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
  }

  this.update = function()
  {
    r.status.h1.textContent = "Rotonde "+r.home.portal.json.client_version;

    var html = "";
    r.status.list.innerHTML = "";

    for(id in r.home.feed.portals){
      var portal = r.home.feed.portals[id];
      html += portal.to_status();
    }
    r.status.list.innerHTML += "<list>"+html+"</list>";
  }
}

r.confirm("script","status");