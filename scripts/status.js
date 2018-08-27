// @ts-check

import { r } from "./rotonde.js";
import { toKey, hasKey, timeOffset, timeSince, toOperatorArg, rune, RDOMListHelper } from "./util.js";
import { rd$, rdom, rd } from "./rdom.js";

export class Status {
  constructor() {
    this._enabled = false;

    this.el = rd$`
      <div id="status">
        <rdom-empty rdom-get="profile"></rdom-empty>
        <list rdom-get="list"></list>
        <h1 id="status_head">
          <a rdom-get="version" href="https://github.com/Rotonde/rotonde-client" target="_blank">${r.version}
            <a rdom-get="logo" class="logo" href="https://github.com/Rotonde/rotonde-client"></a>
          </a>
        </h1>
      </div>`;
    this.profile = this.list = this.version = this.logo = null;
    rdom.get(this.el, this);

    this.renderProfile();

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
    
    let profiles = [r.home.profile, ...r.home.profile.follows.map(p => r.index.getProfile(p.url))].sort(
      (a, b) =>
      a === r.home.profile ? -1 : b === r.home.profile ? 1 :
      a.isFetched && !b.isFetched ? -1 : !a.isFetched && b.isFetched ? 1 : 
      a.timestampLast || b.timestampLast ? b.timestampLast - a.timestampLast :
      a.name.localeCompare(b.name)
    );

    let ctx = new RDOMListHelper(this.list, true);

    ctx.add("preloader", el => rd$(el)`
      <ln class="pseudo preloader-wrap" ${rd.toggleClass("done")}=${r.home.feed.ready}>
        <div class="preloader"></div>
        <div class="preloader b"></div>
      </ln>`);
    
    for (let profile of profiles) {
      ctx.add(profile.url, el => rd$(el)`
        <ln
        ${rd.toggleClass("active", "active", "inactive")}=${timeOffset(profile.timestampLast) <= 14}
        ${rd.toggleClass("unfetched")}=${!profile.isFetched}
        >
          <a title=${(profile.bio + "\n" + (profile.get("version", "string", null) || profile.get("client_version", "string", null) || "Unversioned")).trim()} data-operation=${"filter:"+toOperatorArg(profile.name)} href=${profile.url} data-validate="true" onclick="return false">
            ${rune("portal", r.getRelationship(profile))}<span>${profile.name.substr(0, 16)}</span>
          </a>
          <span class="time_ago" title=${profile.timestampLast}>${profile.timestampLast ? timeSince(profile.timestampLast) : ""}</span>
          ${r.isOwner ? el => rd$(el)`<span class="remove" data-operation=${"un"+profile.url}>remove</span>` : null}
        </ln>`);
    }

    ctx.end();

    this.profile = this.renderProfile(this.profile);
  }

  renderProfile(el) {
    /** @type {any} */
    let profile = (r.home ? r.home.profile : null) || {url: r.profileURL, follows: []};
    return this.profile = rd$(el || this.profile)`
      <div id="profile">
        <div class="header">
          <img class="icon" src=${profile.avatar || "media/content/icon.svg"}>
          <div class="body">
            <p class="name">${profile.name}</p>
            <span class="counters">
              <p class="counter">
                <span class="count">${r.index.microblog.listFeed({ author: toKey(profile) }).length}</span>
                <span class="text">Entries</span>
              </p>
              <p class="counter">
                <span class="count">${profile.follows ? profile.follows.length : 0}</span>
                <span class="text">Following</span>
              </p>
              <p class="counter">
                <span class="count">${profile.follows.map(p => r.index.getProfile(p.url)).filter(p => r.getRelationship(p) === "both").length}</span>
                <span class="text">Loops</span>
              </p>
            </span>
          </div>
        </div>
        <p class="bio">${profile.bio}</p>
      </div>`;
  }
}
