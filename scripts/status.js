function Status()
{
  this.el = document.createElement('div'); this.el.id = "status";
  this.h1 = document.createElement('h1'); this.h1.id = "status_head";
  this.logo = document.createElement('a'); this.logo.className = "logo"; this.logo.setAttribute("href","https://github.com/Rotonde/rotonde-client");
  this.list = document.createElement('list');

  this.enabled = false;

  this.sorted_portals_prev = [];

  this.install = function(target)
  {
    this.el.appendChild(this.h1);
    this.el.appendChild(this.logo);
    this.el.appendChild(this.list);
    target.appendChild(this.el);
    this.start();
  }

  this.update_status = function(enabled)
  {
    r.status.enabled = enabled;
    if (r.status.enabled) {
      r.el.classList.add('sidebar');
    } else {
      r.el.classList.remove('sidebar');
    }
    localStorage.setItem('status_enabled', r.status.enabled ? 'enabled' : '');
  }

  this.start = function()
  {
    this.h1.textContent = "Rotonde";
    r.operator.icon_el.addEventListener('mousedown',r.status.toggle, false);
    r.status.update_status(localStorage.getItem('status_enabled') === 'enabled');
  }

  this.toggle = function()
  {
    r.status.update_status(!r.status.enabled);
  }

  this.update = function()
  {
    r.status.h1.innerHTML = "Rotonde <a href='https://github.com/Rotonde/rotonde-client' target='_blank'>"+r.home.portal.json.client_version+"</a>";
    
    var sorted_portals = r.home.feed.portals.sort(function(a, b) {
      return b.updated(false) - a.updated(false);
    });

    for (var id in sorted_portals) {
      var portal = sorted_portals[id];
      rdom_add(r.status.list, portal, id,
        "<ln class='"+(window.location.hash.replace("#","") == portal.json.name ? "filter" : "")+"'><a title='"+(portal.json.client_version ? escape_attr(portal.json.client_version) : "Unversioned")+"' data-operation='filter:"+escape_attr(portal.json.name)+"' data-validate='true' class='"+(portal.json.client_version && portal.json.client_version == r.home.portal.json.client_version ? "compatible" : "")+"'>"+portal.relationship()+escape_html(portal.json.name).substr(0,16)+"</a><span class='time_ago'>"+(portal.updated(false) ? timeSince(portal.updated(false)) : 'XX')+" ago</span></ln>"
      );
    }

    rdom_cleanup(r.status.list);
  }
}

r.confirm("script","status");