//@ts-check
class Status {
  constructor() {
    this._enabled = false;

    this.el = rd$`
      <div id="status">
        <h1 id="status_head"><a rdom-get="version" href="https://github.com/Rotonde/rotonde-client" target="_blank">${r.version}</a></h1>
        <a rdom-get="logo" class="logo" href="https://github.com/Rotonde/rotonde-client"></a>
        <list rdom-get="list">
      </div>`;
    this.version = this.logo = this.list = null;
    rdom.get(this.el, this);

    if (r.styleNeu) {
      rdom.move(this.list, 0);
      this.version.parentElement.appendChild(this.logo);

      this.profile = null;
      this.profile = this.renderProfile(this.profile);
      this.el.appendChild(this.profile);
      rdom.move(this.profile, 0);
    }

    r.root.appendChild(this.el);
  }

  /** @returns {boolean} */
  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    this._enabled = value;
    if (value) {
      r.root.classList.add("sidebar");
    } else {
      r.root.classList.remove("sidebar");
    }
    localStorage.setItem("status_disabled", value ? "" : "true");
  }

  start() {
    r.operator.icon.addEventListener("mousedown", this.onMouseDownIcon.bind(this), false);
    this.enabled = localStorage.getItem("status_disabled") !== "true";
  }

  onMouseDownIcon(e) {
    if (e.button !== 0)
      return;
    this.enabled = !this.enabled;
  }

  render() {
    this.version.textContent = r.version;
    
    let portals = [...r.home.feed.portals].sort(
      (a, b) =>
      a === r.home.portal ? -1 : b === r.home.portal ? 1 :
      a.timestampLast || b.timestampLast ? b.timestampLast - a.timestampLast :
      a.name.localeCompare(b.name)
    );

    for (let follow of r.home.portal.follows) {
      if (r.home.feed.getPortal(follow.url, false))
        continue;
      portals.push({
        name: follow.name || r.getName(follow.url),
        url: follow.url,
        unfetched: true,
        version: "Unfetched",
        relationship: "follow"
      });
    }

    let ctx = new ListHelper(this.list, true);
    
    ctx.add("preloader", el => rf$(el)`
      <ln class="pseudo preloader-wrap" ${rd.toggleClass("done")}=${r.home.feed.ready}>
        <div class="preloader"></div>
        <div class="preloader b"></div>
      </ln>`);

    for (let portal of portals) {
      ctx.add(portal.url, el => rf$(el)`
        <ln
        ${rd.toggleClass("active", "active", "inactive")}=${timeOffset(portal.timestampLast) <= 14}
        ${rd.toggleClass("unfetched")}=${portal.unfetched || false}
        >
          <a title=${(portal.bio + "\n" + (portal.version || "Unversioned")).trim()} data-operation=${"filter:"+toOperatorArg(portal.name)} href=${portal.url} data-validate="true" onclick="return false">
            ${rune("portal", portal.relationship)}<span>${portal.name.substr(0, 16)}</span>
          </a>
          <span class="time_ago" title=${portal.timestampLast}>${portal.timestampLast ? timeSince(portal.timestampLast) : ""}</span>
          <span class="remove" data-operation=${"un"+portal.url}>remove</span>
        </ln>`);
    }

    ctx.end();

    this.profile = this.renderProfile(this.profile);
  }

  renderProfile(el) {
    /** @type {any} */
    let portal = (r.home ? r.home.portal : null) || {};
    return rf$(el || this.profile)`
      <div id="profile">
        <div class="header">
          <img class="icon" src=${portal.icon || "media/content/icon.svg"}>
          <div class="body">
            <p class="name">${portal.name}</p>
            <span class="counters">
              <p class="counter">
                <span class="count">${portal.entries ? portal.entries.length : 0}</span>
                <span class="text">Entries</span>
              </p>
              <p class="counter">
                <span class="count">${portal.follows ? portal.follows.length : 0}</span>
                <span class="text">Portals</span>
              </p>
              <p class="counter">
                <span class="count">${(r.home ? r.home.feed.portals.filter(p => p.relationship === "both").length : 0) || 0}</span>
                <span class="text">Loops</span>
              </p>
            </span>
          </div>
        </div>
        <p class="bio">${portal.bio}</p>
      </div>`;
  }
}
