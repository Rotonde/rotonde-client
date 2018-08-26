// @ts-check

import { r } from "./rotonde.js";
import { timeSince, toOperatorArg, toKey, hasKey, rune, RDOMListHelper } from "./util.js";
import { rd, rdom, rd$, escape$ } from "./rdom.js";

function _get(obj, attr, type, fallback) {
  let value = obj[attr];
  return (!type || typeof value === type) ? value : fallback;
}

export class Entry {
  constructor(data = null, host = null, rerender = false) {
    this.expanded = false;
    this.expandedEmbed = false;
    this.big = false;
    this.pinned = false;
    this.mention = false;
    this.whisper = false;
    this.quote = null;
    this.parent = null;
    this.embed = null;

    this.el = null;

    this._localtime = null;
    this._localtimeLastTimestamp = null;

    // Bind all rendering functions.
    for (let name of Object.getOwnPropertyNames(Entry.prototype)) {
        if (!name.startsWith("render") || !(Entry.prototype[name] instanceof Function))
            continue;
        this[name] = Entry.prototype[name].bind(this);
    }

    if (data && host)
      this.update(data, host, rerender);
  }

  update(data, host, rerender = false) {
    if (typeof(host) === "string")
      host = this.fetchProfile(host, rerender);

    let id = data.id;
    let url = data.url;
    
    let indexOfID;
    if (url && (indexOfID = url.lastIndexOf("/")) > 0 && url.toLowerCase().endsWith(".json")) {
      id = url.substring(indexOfID + 1, url.length - 5);
    } else {
      id = "" + (data.id || data.createdAt);
      url = host ? `${host.url}/posts/${id}.json` : null;
    }

    let get = (attr, type, fallback) => _get(data._input || data, attr, type, fallback);

    if (
      id &&
      this.id === id &&
      this.createdAt === get("createdAt", "number", 0) &&
      this.editedAt === get("editedAt", "number", 0) &&
      this.host === host
    ) return false;

    this.host = host;

    this.id = id;
    this.url = url;

    this.text = get("text", "string", "");
    this.createdAt = get("createdAt", "number", "");
    this.editedAt = get("editedAt", "number", "");
    this.media = get("media", "string", null);
    this.target = get("target", "", null);
    this.whisper = get("whisper", "boolean", false);
    this.threadRoot = get("threadRoot", "string", "");
    this.threadParent = get("threadParent", "string", "");
    this.mentions = get("mentions", "string", "");

    this.topic = this.text && this.text[0] === "#" ? this.text.slice(1, this.text.indexOf(" ")) : null;

    if (typeof(this.target) === "string") {
      this.target = ["dat://"+toKey(this.target)];
    } else if (!this.target && this.threadParent) {
      this.target = ["dat://"+toKey(this.threadParent)];
      if (this.mentions) {
        this.target = [...this.target, ...this.mentions.map(m => "dat://"+toKey(m.url))]
      }
    } else if (!this.target || !(this.target instanceof Array)) {
      this.target = [];
    }

    if (this.target[0]) {
      if (this.threadParent && (!this.quote || this.quote.url !== this.threadParent)) {
        // Refreshing the thread parent on URL updates only might be a little too conservative...
        this.fetchThreadParent(this.threadParent, rerender);
      } else if (!this.quote && get("quote", "", null)) {
        this.quote = new Entry(get("quote", "", null), this.target[0], rerender);
        this.quote.parent = this.parent || this;
      }
    }

    this.mention = false;
    // Mention tag, eg @dc
    // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
    const mentionTag = "@" + r.home.profile.name;
    const msg = this.text.toLowerCase();
    this.mention = this.mention || msg.endsWith(mentionTag) || msg.indexOf(mentionTag + " ") > -1;
    // Check if our portal is a target.
    this.mention = this.mention || (this.target && this.target.length > 0 && hasKey(r.home.profile, this.target));

    this.ready = true;
    return true;
  }

  toJSON() {
    return {
      // Citizen
      text: this.text,
      createdAt: this.createdAt,
      threadRoot: this.threadRoot,
      threadParent: this.threadParent || (this.quote ? this.quote.url : null),
      mentions: this.mentions,

      // Rotonde
      editedAt: this.editedAt,
      media: this.media,
      target: this.target,
      quote: this.quote ? (this.quote.toJSON ? this.quote.toJSON() : this.quote) : null,
      whisper: this.whisper,
    };
  }

  fetchProfile(domain, rerender = false) {
    let profile = r.index.getProfile(domain);
    if (profile.isFetched)
      return profile;

    profile.then((function fetchedProfile(profile) {
      if (!profile)
        return;
      this.host = profile.getSynced();
      if (rerender)
        this.el = this.render(this.el);
    }).bind(this)).catch(e => {});

    return profile;
  }

  fetchThreadParent(url, rerender = false) {
    let apply = (function fetchedThreadParentApply(post) {
      this.quote = new Entry(post, this.target[0], rerender);
      this.quote.url = url;
      this.quote.parent = this.parent || this;
    }).bind(this);

    let post = r.index.microblog.getPost(url);
    if (post.isFetched) {
      apply(post);
      return;
    }

    post.then((function fetchedThreadParent(post) {
      if (!post)
        return;
      apply(post);
      if (!rerender)
        return;
      this.el = this.render(this.el);
    }).bind(this)).catch(e => {});
  }

  get idNested() {
    if (!this.parent)
      return this.id;
    
    let depth = 0;
    for (let quote = this.parent; quote !== this; quote = quote.quote)
      depth++;
    return this.parent.id + "/" + depth;
  }

  get localtime() {
    let timestamp = this.editedAt || this.createdAt;
    if (!timestamp)
      return "";
    if (this._localtimeLastTimestamp === timestamp)
      return this._localtime;
    let date = new Date(this._localtimeLastTimestamp = timestamp);
    let lz = v => (v < 10 ? "0" : "") + v;
    return this._localtime = `${date.getFullYear()}-${lz(date.getMonth() + 1)}-${lz(date.getDate())} ${lz(date.getHours())}:${lz(date.getMinutes())}`;
  }

  isVisible(filter = null, target = null) {
    if (this.whisper && !hasKey(this.target, r.home.profile) && !hasKey(r.home.profile, this.host))
      return false;

    if (target === "all")
      return true;

    if (target === "whispers")
      return this.whisper;

    if (target === "mentions")
      return this.mention && !this.whisper;
    
    if (target === "discovery")
      return this.host.discovery;

    // If we're filtering by a query, return whether the post contains the query.
    if (filter)
      return this.text.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
    // Same goes for targets which aren't specially handled targets..
    if (target)
      return toOperatorArg(target) === toOperatorArg(this.host.name) || target === this.id;

    // Show discovered mentions and whispers in main feed.
    if (!this.mention && !this.whisper && this.host.discovery)
      return false;

    // Don't show discovered posts in main feed.
    if (this.host.discovery)
      return false;

    return true;
  }

  render(el) {
    return rd$(el || ((this.big || this.parent) ? null : this.el))`
      <div class="entry"
      ${rd.toggleClass("whisper")}=${this.whisper}
      ${rd.toggleClass("mention")}=${this.mention}
      ${rd.toggleClass("quote")}=${this.quote}
      ${rd.toggleClass("bump")}=${this.quote && !this.text}
      >

        ${this.renderIcon}
        ${this.renderHeader}
        ${this.renderBody}

        ${this.renderThread}

        ${this.renderRMC}

        <hr/>
      </div>`;
  }

  renderIcon(el) {
    return rd$(el)`
      <a
      title=${this.host.name + (this.host.bio ? "\n"+this.host.bio : "")}
      href=${this.host.url[0] === "$" ? "" : this.host.url}
      data-operation=${"filter:"+toOperatorArg(this.host.name)}
      data-validate="true" onclick="return false"
      >
        <img class="icon" src=${this.host.getAvatarUrl()}>
      </a>`;
  }

  renderHeader(el) {
    el = rd$(el)`
      <c class="head">
        <c class="pinnedtext" ${rd.toggleClass("hidden")}=${!this.pinned}>pinned entry</c>
        <a class="topic" data-operation=${"filter #"+this.topic}>${this.topic ? "#"+this.topic : ""}</a>
        <t rdom-get="portals" class="portal"></t>
        <a title=${this.localtime} ${rd.toggleClass("editstamp", "editstamp", "timestamp")}=${this.editedAt}>
          ${(!this.createdAt && !this.editedAt) ? "" : `${this.editedAt ? "edited " : ""}${timeSince(this.createdAt)} ago`}
        </a>
        <t rdom-get="tools" class="tools"></t>
      </c>`;

    let { portals, tools } = rdom.get(el);

    // portals
    {
      let ctx = new RDOMListHelper(portals, true);

      ctx.add("author", el => rd$(el)`
        <a data-operation=${"filter:"+toOperatorArg(this.host.name)} href=${this.host.url} data-validate="true" onclick="return false">
          ${rune("portal", r.getRelationship(this.host))}<span>${this.host.name}</span>
        </a>`);

      ctx.add("action", el => rd$(el)`
        <span>
          ${
          (this.whisper) ? "whispered to" :
          (this.quote && !this.text) ? "bumped" :
          (this.quote) ? "quoted" :
          (this.target.length !== 0) ? "mentioned" :
          ""}
        </span>`);

      for (let i in this.target) {
        let target = this.target[i];

        let name = r.index.getProfile(target).name;
        let relationship = r.getRelationship(target);
        ctx.add(target, el => rd$(el)`
          <a data-operation=${"filter:"+toKey(target)} href=${target} data-validate="true" onclick="return false">
            ${rune("portal", relationship)}<span>${name}</span>
          </a>`);

        // @ts-ignore
        if (i < this.target.length - 1)
          ctx.add(target+",", el => rd$(el)`<span>, </span>`);
      }
      
      ctx.end();
    }

    // tools
    if (this.host.url[0] !== "$") {
      let ctx = new RDOMListHelper(tools, true);

      if (this.host.name === r.home.profile.name && r.isOwner) {
        ctx.add("del", el => rd$(el)`<c data-operation=${"delete:"+this.id}>del</c>`);
        ctx.add("edit", el => rd$(el)`<c data-operation=${"edit:"+this.id+" "}>edit</c>`);
        ctx.add("pin", el => rd$(el)`<c data-operation=${"pin:"+this.id}>pin</c>`);
      }

      ctx.add("quote", el => rd$(el)`<c data-operation=${"quote:"+this.id+" "}>${this.whisper ? "reply" : "quote"}</c>`);

      ctx.end();
    }

    return el;
  }

  renderBody(el) {
    el = el || rd$`<t class="message" dir="auto"></t>`;
    if (el.rotondeLastMessage === this.text)
      return el;
    el.rotondeLastMessage = this.text;
    el.innerHTML = this.format(this.text);
    return el;
  }

  renderThread(el) {
    if (this.parent || !this.quote)
      return null;

    el = rd$(el)`<div class="thread"></div>`;

    let ctx = new RDOMListHelper(el, true);

    let length = 0;
    for (let quote = this.quote; quote; quote = quote.quote) {
      quote.parent = this;
      ++length;
      if (!this.expanded && !this.big && length > 1)
        continue;
      quote.el = ctx.add(quote.id, quote);
    }

    if (length > 1 && !this.big) {
      ctx.add("expand", el => rd$(el)`
        <t class="expand"
        ${rd.toggleClass("expanded", "up", "down")}=${this.expanded}
        data-operation=${(this.expanded ? "collapse:" : "expand:")+this.id}
        data-validate="true"
        >
          ${this.expanded ? "Hide" : `Show ${length === 1 ? "Quote" : ("+" + (length - 1) + (length === 2 ? " Entry" : " Entries"))}`}
        </t>`);
    }

    ctx.end();

    return el;
  }

  _rmcElement(el, origin, media, tag, classes = "media", extra = "", inner = undefined) {
    return rd$(el)`
      <$${tag} $${extra} class=${classes} ${rd.attr(tag === "a" ? "href" : "src")}=${origin?("dat://"+toKey(origin)+"/media/content/"+media):media}>
        ${inner}
      </$${tag}>`;
  }

  _rmcBigpicture(el, origin, media, tag, classes = "media", extra = "", inner = undefined, href = "") {
    return this._rmcElement(el, origin, href || media, "a", "media-wrapper", "onclick='return false' target='_blank'",
      el => this._rmcElement(el, origin, media, tag, classes, extra + " data-operation='big:"+this.id+"' data-validate='true'", inner)
    );
  }

  renderRMC(el) {
    /** @type {Entry} */
    let root = this;
    if (!this.parent && !this.media && this.quote) {
      // If this is quoting something with media, while itself not having media,
      // display the thread root's media.
      while (root.quote)
        root = root.quote;
      if (!root.media)
        root = this;
    }
    
    if (root.media) {
      // If this is the root of a thread and the parent displays this,
      // don't display the media twice.
      if (this.parent && !this.parent.media && !this.quote)
        return null;

      // TODO: Is encodeURIComponent needed anymore?
      let media = root.media;
      let origin = root.host.url;
      let indexOfProtocol = media.indexOf("://");
      if (indexOfProtocol !== -1 && indexOfProtocol < 10) {
        origin = "";
        media = media;
      } else if (media.startsWith("/"))
        media = media.substring(1);
      else if (media.startsWith("%2F"))
        media = media.substring(3);
      else if (media.startsWith("media/content/"))
        media = media.substring("media/content/".length);
      else if (media.startsWith("media%2Fcontent%2F"))
        media = media.substring("media%2Fcontent%2F".length);

      const audiotypes = new Set(["m4a", "mp3", "oga", "ogg", "opus"]);
      const videotypes = new Set(["mp4", "ogv", "webm"]);
      const imagetypes = new Set(["apng", "gif", "jpg", "jpeg", "jpe", "png", "svg", "svgz", "tiff", "tif", "webp"]);
      let ext = media.slice(media.lastIndexOf(".") + 1).toLowerCase();

      if (audiotypes.has(ext))
        el = this._rmcElement(el, origin, media, "audio", "media", "controls", "");
      else if (videotypes.has(ext))
        el = this._rmcElement(el, origin, media, "video", "media", "controls", "");
      else if (imagetypes.has(ext))
        el = this._rmcBigpicture(el, origin, media, "img", "media", "", "");
      else
        el = this._rmcElement(el, origin, media, "a", "media", "", ">> "+media);

    } else if (this.embed && this.embed.provider) {
      // TODO: Render embeds.
      /*
      var embed_id = escape_html(this.host.name)+"-"+this.id;
      html += "<div class='media embed'>";
      if (this.embed_expanded) {
        if (this.embed.resolved === undefined) { // If still resolving
          this.embed.resolve(this);
          html += "<t class='expand preload'>Loading content...</t>";
        } else if (this.embed.resolved) { // If resolved properly
          html += "<div>" + this.embed.resolved + "</div>";
          html += "<t class='expand up' data-operation='embed_collapse:"+embed_id+"' data-validate='true'>Hide content</t>";
        } else {
          html += "<t class='expand'>Content not supported.</t>";
        }
      } else {
        var provider = this.embed.url;
        provider = provider.substring(provider.indexOf("/") + 2);
        provider = provider.substring(0, provider.indexOf("/"));
        html += "<t class='expand down' data-operation='embed_expand:"+embed_id+"' data-validate='true'>Show content from "+provider+"</t>";
      }
      html += "</div>"
      */
    }

    return el;
  }

  format(message) {
    message = this.topic ? message.slice(this.topic.length + 1).trimLeft() : message;
    return message.split("\n").map(this.formatLine, this).join("<br>");
  }

  /** @arg {string} m */
  formatLine(m) {
    m = rdom.escape(m);
    m = this.formatStyle(m);
    m = this.formatLinks(m);
    m = this.formatPortals(m);
    return m;
  }

  formatEscaped(m, i) {
    return m[i - 1] === "\\" && (m.slice(0, i - 1) + m.slice(i));
  }

  /** @arg {string} m */
  formatLinks(m) {
    // Temporary output string.
    // Note: += is faster than Array.join().
    let n = "";
    let space;
    let newline;
    let split;
    // c: current char index
    for (let c = 0; c < m.length; c = split + 1) {
      if (c > 0)
        n += " ";

      space = m.indexOf(" ", c);
      newline = m.indexOf("\n", c);
      if (space === -1)
        split = newline;
      else if (newline === -1)
        split = space;
      else if (newline < space)
        split = newline;
      else
        split = space;
      if (split <= -1)
        split = m.length;
      let word = m.slice(c, split);

      // Check for URL
      let indexOfProtocolEnd = word.indexOf("://");
      let isURL = indexOfProtocolEnd !== -1 && indexOfProtocolEnd < 10;
      let isURLhttp = word.startsWith("http://");
      let isURLhttps = word.startsWith("https://");
      if (isURL || isURLhttp || isURLhttps) {
        let compressed;

        let cutoffLen;

        if (isURLhttp || isURLhttps) {
          try {
            let url = new URL(word);
            cutoffLen = url.hostname.length + 15;
            compressed = word.substr(isURLhttps ? 8 : isURLhttp ? 7 : (indexOfProtocolEnd + 3));
          } catch (e) {
          }
        }

        if (!compressed) {
          let domain = word.slice(indexOfProtocolEnd + 3, word.indexOf("/", indexOfProtocolEnd + 4));
          let rest = word.substr(indexOfProtocolEnd + 3 + domain.length);
          if (domain.indexOf(".") === -1 && domain.length > 12) {
            domain = domain.substr(0, 8) + ".." + domain.substr(domain.length - 4);
          }
          cutoffLen = domain.length + 15;
          compressed = domain + rest;
        }

        if (compressed.length > cutoffLen)
          compressed = compressed.substr(0, cutoffLen) + "..";
        compressed = word.substr(0, indexOfProtocolEnd + 3) + compressed;

        n += escape$`<a href="$${word}" target="_blank" rel="noopener">$${compressed}</a>`;
        continue;
      }

      // Check for #
      if (word.length > 1 && word[0] === "#") {
        let filter = word;
        // Remove any unwanted symbols from the end of the "filter word".
        while (
          filter[filter.length - 1] === "." ||
          filter[filter.length - 1] === "," ||
          filter[filter.length - 1] === ";" ||
          filter[filter.length - 1] === "\"" ||
          filter[filter.length - 1] === "}" ||
          filter[filter.length - 1] === "{"
        )
          filter = filter.slice(0, -1);
        n += escape$`<c class="hashtag" data-operation=${"filter "+filter}>$${word.slice(0, filter.length)}</c>$${word.slice(filter.length)}`;
        continue;
      }

      // Check for { upcoming | and }
      if (word.length > 1 && word[0] === '{' && m[c - 1] !== "\\") {
        let linkbr = m.indexOf("|", c);
        if (linkbr < 0) { n += word; continue; }
        let linkend = m.indexOf("}", linkbr);
        if (linkend < 0) { n += word; continue; }
        n += escape$`<a target="_blank" rel="noopener noreferrer" href="$${m.slice(linkbr + 1, linkend)}">$${m.slice(c + 1, linkbr)}</a>`;
        split = linkend;
        continue;
      }

      n += word;
    }

    return n;
  }

  formatPortals(m) {
    // Temporary output string.
    // Note: += is faster than Array.join().
    let n = "";
    let space;
    let newline;
    let split;
    // c: current char index
    for (let c = 0; c < m.length; c = split + 1) {
      if (c > 0)
        n += " ";

      space = m.indexOf(" ", c);
      newline = m.indexOf("\n", c);
      if (space === -1)
        split = newline;
      else if (newline === -1)
        split = space;
      else if (newline < space)
        split = newline;
      else
        split = space;
      if (split <= -1)
        split = m.length;
      let word = m.substring(c, split);

      let match;
      if (word.length > 1 && word[0] == "@" && (match = r.operator.patternName.exec(word))) {
        let remnants = word.substr(match[0].length);
        if (match[1] == r.home.profile.name) {
          n += escape$`<t class="highlight">$${match[0]}</t>$${remnants}`;
          continue;
        }
        let portals = r.operator.lookupName(match[1]);
        if (portals.length > 0) {
          n += escape$`<a href=${portals[0].url} onclick="return false" data-operation=${"filter:"+portals[0].name} data-validate="true" class="known_portal">$${match[0]}</a>$${remnants}`;
          continue;
        }
      }

      n += word;
    }

    return n;
  }

  formatStyle(m) {
    let il;
    let ir;
    // il and ir are required as we check il < ir.
    // We don't want to replace *} {* by accident.
    // While we're at it, use substring (faster) instead of replace (slower).

    ir = 0;
    while ((il = m.indexOf("{*", ir)) > -1 && (ir = m.indexOf("*}", il)) > -1) {
      m = this.formatEscaped(m, il) || (m.substring(0, il) + "<b>" + m.substring(il + 2, ir) + "</b>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{_", ir)) > -1 && (ir = m.indexOf("_}", il)) > -1) {
      m = this.formatEscaped(m, il) || (m.substring(0, il) + "<i>" + m.substring(il + 2, ir) + "</i>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{#", ir)) > -1 && (ir = m.indexOf("#}", il)) > -1) {
      m = this.formatEscaped(m, il) || (m.substring(0, il) + "<code>" + m.substring(il + 2, ir) + "</code>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{-", ir)) > -1 && (ir = m.indexOf("-}", il)) > -1) {
      m = this.formatEscaped(m, il) || (m.substring(0, il) + "<del>" + m.substring(il + 2, ir) + "</del>" + m.substring(ir + 2));
    }

    ir = 0;
    while ((il = m.indexOf("{%", ir)) > -1 && (ir = m.indexOf("%}", il)) > -1) {
      let escaped;
      if (escaped = this.formatEscaped(m, il)) {
        m = escaped;
        continue;
      }
      let left = m.substring(0, il);
      let mid = m.substring(il + 2, ir);
      let right = m.substring(ir + 2);

      let origin = this.host.url;
      origin += origin.slice(-1) == "/" ? "" : "/";
      let src = origin + "media/content/inline/" + mid;

      if (src.indexOf(".") == -1) {
          src = src + ".png"; // Default extension: .png
      } else {
          mid = mid.substring(0, mid.lastIndexOf("."));
      }

      m = escape$`$${left}<img class="inline" src=${src} alt="" title=${mid} />$${right}`;
    }

    return m
  }

}
