// @ts-check

import { r } from "./rotonde.js";
import { hasKey } from "./util.js";
import { rd$ } from "./rdom.js";

//@ts-ignore
import * as Citizen from "dat://cityxvii.hashbase.io/dev/api.js"

import { Feed } from "./feed.js";

export class Home {
  constructor() {
    this.network = [];
    this._networkCache = null;
  
    this.logPrevTimeout = null;
    this.logPrev = "";

    this.el = rd$`<div id="portal"></div>`;
    r.root.appendChild(this.el);

    this.feed = new Feed();
  }

  async start() {
    this.log("Initializing");

    // Connect to our own portal on start.
    this.user = new Citizen.User(r.profileURL);
    r.isOwner = (await this.user.getInfo()).isOwner;
    if (r.isOwner)
      await this.user.setup();
    await this.feed.register(r.profileURL);
    this.profile = r.index.getProfile(r.profileURL);
    
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
      
    if (hasKey(
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

    console.log("[Home.log]", text);
    r.operator.input.setAttribute("placeholder", text);
    r.operator.render();
  }

  async postEntry(entry) {
    // Create /posts dir if missing.
    try {
      await this.user.mkdir("/posts");
    } catch (e) { }
    await this.user.microblog.add(entry);
  }

  render() {
    let me = this.profile;
    document.title = "@"+me.name;

    this.feed.render();
  }
  
}
