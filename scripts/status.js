//@ts-check
class Status {
  constructor() {
    this._enabled = false;

    this.el = rd$`
      <div id="status">
        <h1 id="status_head"><a rdom-get="version" href="https://github.com/Rotonde/rotonde-client" target="_blank">${r.version}</a></h1>
        <a class="logo" href="https://github.com/Rotonde/rotonde-client"></a>
        <list rdom-get="list">
      </div>`;
    this.version = this.list = null;
    rdom.get(this.el, this);
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
    localStorage.setItem("status_enabled", value ? "enabled" : "");
  }

  start() {
    r.operator.icon.addEventListener("mousedown", this.toggle.bind(this), false);
    this.enabled = localStorage.getItem("status_enabled") === "enabled";
  }

  toggle() {
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
          <a title=${portal.version || "Unversioned"} data-operation=${"filter:"+toOperatorArg(portal.name)} href=${portal.url} data-validate="true" onclick="return false">
            ${rune("portal", portal.relationship)}<span>${portal.name.substr(0, 16)}</span>
          </a>
          <span class="time_ago" title=${portal.timestampLast}>${portal.timestampLast ? timeSince(portal.timestampLast) : ""}</span>
          <span class="remove" data-operation=${"un"+portal.url}>remove</span>
        </ln>`);
    }

    ctx.end();
  }
}
