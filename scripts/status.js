//@ts-check
class Status {
  constructor() {
    this._enabled = false;

    this.el =
    // Note: The list should actually be of type "ul", but existing custom styles already depend on "list".
    rd$`<div id="status">
          <h1 id="status_head"><a .?${"version"} href="https://github.com/Rotonde/rotonde-client" target="_blank">${r.version}</a></h1>
          <a class="logo" href="https://github.com/Rotonde/rotonde-client"></a>
          <list .?${"list"}></list>
        </div>`
    this.version = this.list = null;
    this.el.rdomGet(this);
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
    
    let sorted_portals = r.home.feed.portals.sort(
      (a, b) =>
      a.timestampLast || b.timestampLast ? b.timestampLast - a.timestampLast :
      a.name.localeCompare(b.name)
    );

    let ctx = new RDOMCtx(this.list);

    for (let i in sorted_portals) {
      let portal = sorted_portals[i];

      ctx.add(portal.url, i, (ctx, el) => {
        (el = el ||
        // Note: The list item should actually be of type "li", but existing custom styles already depend on "ln".
        rd$`<ln *?${rdh.toggleClass("active")}>
              <a title=?${"versionTitle"} data-operation=?${"versionOperation"} href=?${"versionURL"} data-validate="true" onclick="return false">
                ${renderRune("runeRelationship", "portal")}<span *?${rdh.textContent("name")}></span>
              </a>
              <span class="time_ago" title=?${"timestampLast"} *?${rdh.textContent("timeSinceLast")}></span>
              <span class="remove" data-operation=${"un"+portal.url}>remove</span>
            </ln>`
        ).rdomSet({
          "versionTitle": portal.version || "Unversioned",
          "versionOperation": "filter:"+toOperatorArg(portal.name),
          "versionURL": portal.url,
          "timestampLast": portal.timestampLast,
          "timeSinceLast": portal.timestampLast ? timeSince(portal.timestampLast) : "",
          "runeRelationship": portal.relationship,
          "name": portal.name.substr(0, 16),
        })
        
        if (timeOffset(portal.timestampLast) > 14) {
          el.classList.remove("active");
          el.classList.add("inactive");
        } else {
          el.classList.remove("inactive");
          el.classList.add("active");
        }
                
        return el;
      });
    }

    ctx.cleanup();
  }
}
