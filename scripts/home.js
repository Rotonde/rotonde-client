//@ts-check
class Home {
  constructor() {
    this.url = localStorage.getItem("profile_archive") || window.location.origin;
    this.network = [];
    this._networkCache = null;
  
    this.logPrevTimeout = null;
    this.logPrev = "";

    this.el = rd$`<div id="portal"></div>`;
    r.root.appendChild(this.el);

    /** @type {Portal} */
    this.portal = null;
    this.feed = new Feed();
  }

  async start() {
    this.log("Initializing");

    // Connect to our own portal on start.
    this.portal = new Portal(this.url);
    this.portal.archive = await r.db.indexArchive(this.url);
    await this.portal.invalidate();
    await this.portal.maintenance();
    await this.feed.register(this.portal);
    
    let archive = await r.home.portal.archive.getInfo();
    r.isOwner = archive.isOwner;

    this.log("Connecting");
    
    await this.feed.start();
  }

  async selectArchive() {
    let archive = await DatArchive.selectArchive({
      title: "Select Profile",
      buttonLabel: "Login"
    });
    if (!archive)
      return;
      
    if (hasHash(
      [ window.location.origin.toString(), await DatArchive.resolveName(window.location.origin.toString()) ],
      archive.url
    )) {
      // Returning to our main profile.
      localStorage.removeItem("profile_archive");
    } else {
      // Switching to another profile.
      localStorage.setItem("profile_archive", archive.url);
    }
    // For now, the safest way to reset everything is to just reload the page.
    window.location.reload();
  }

  log(text, life) {
    if (this.logPrevTimeout) {
      clearTimeout(this.logPrevTimeout);
    }
    if (life) {
      if (life > 0) {
        this.logPrevTimeout = setTimeout(() => {
          r.operator.input.setAttribute("placeholder", this.logPrev);
          r.operator.render();
        }, life);
      }
    } else {
      this.logPrev = text;
    }

    r.operator.input.setAttribute("placeholder", text);
    r.operator.render();
  }

  async postEntry(entry) {
    entry.id = "" + (entry.id || entry.timestamp);

    // Create /posts dir if missing.
    try {
      await this.portal.archive.mkdir("/posts");
    } catch (e) { }
    // Ignore if post with same already ID exists.
    try {
      if (await this.portal.archive.stat("/posts/" + entry.id + ".json"))
        return;
    } catch (e) { }
    await r.db.feed.put(this.portal.archive.url + "/posts/" + entry.id + ".json", entry);
  }

  async render() {
    let me = await this.portal.getRecord();
    document.title = "@"+me.name;

    await this.feed.render();
  }
  
}
