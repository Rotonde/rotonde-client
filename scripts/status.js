//@ts-check
class Status {
  constructor() {
    this._enabled = false;

    this.el =
    // Note: The list should actually be of type "ul", but existing custom styles already depend on "list".
    rd$`<div id="status">
          <h1 id="status_head"><a .${"version"} href="https://github.com/Rotonde/rotonde-client" target="_blank">${r.version}</a></h1>
          <a class="logo" href="https://github.com/Rotonde/rotonde-client"></a>
          <list .${"list"}></list>
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

    let ctx = new RDOMCtx(this.list);
    let eli = -1;

    
    ctx.add("preloader", ++eli, el => el || rd$`<ln class="pseudo preloader-wrap" *${rdh.toggleClass}${["done"]}><div class="preloader"></div><div class="preloader b"></div></ln>`)
    .rdomSet({
      "done": r.home.feed.ready
    });

    for (let i in portals) {
      let portal = portals[i];

      /* Given a portal, RDOM list context for a list element (ctx) and ordered element index (eli):
       * ctx.add(
       *  id,
       *  wanted index,
       *  function(existing HTMLElement for the id with additional RDOM properties) returning a HTMLElement
       * );
       */
      ctx.add(portal.url, ++eli, el => (el = el ||
        // Note: The list item should actually be of type "li", but existing custom styles already depend on "ln".
        rd$`<ln *${rdh.toggleClasses("active", "active", "inactive")} *${rdh.toggleClass}${["unfetched"]}>
              <a title=*${"versionTitle"} data-operation=*${"versionOperation"} href=*${"versionURL"} data-validate="true" onclick="return false">
                ${rune("runeRelationship", "portal")}<span *${rdh.textContent}${["name"]}></span>
              </a>
              <span class="time_ago" title=*${"timestampLast"} *${rdh.textContent}${["timeSinceLast"]}></span>
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
          "active": timeOffset(portal.timestampLast) <= 14,
          "unfetched": portal.unfetched || false,
        })
      );
    }

    ctx.cleanup();
  }
}
