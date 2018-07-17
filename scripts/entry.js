//@ts-check
class Entry {
  constructor(data = null, host = null, rerender = false) {
    this.expanded = false;
    this.expandedEmbed = false;
    this.pinned = false;
    this.mention = false;
    this.whisper = false;
    this.quote = null;
    this.isQuote = false;

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
      host = this.fetchPortal(host, rerender);

    data.timestamp = data.timestamp || data.createdAt;
    data.editstamp = data.editstamp || data.editedAt;

    if (data.getRecordURL) {
      data.url = data.getRecordURL();
      let index = data.url.lastIndexOf("/");
      if (index > 0 && data.url.toLowerCase().endsWith(".json")) {
        data.id = data.url.substring(index + 1, data.url.length - 5);
      }
    } else {
      data.id = "" + (data.id || data.timestamp);
      data.url = host ? `${host.url}/posts/${data.id}.json` : null;
    }

    if (
      data.timestamp &&
      data.id &&
      this.timestamp === data.timestamp &&
      this.editstamp === data.editstamp &&
      this.id === data.id &&
      this.host === host
    ) return false;

    this.host = host;

    this.id = data.id;
    this.url = data.url;

    this.message = data.text || data.message || "";
    this.timestamp = data.createdAt || data.timestamp;
    this.editstamp = data.editedAt || data.editstamp;
    this.media = data.media;
    this.target = data.target || [];
    this.whisper = data.whisper;
    this.topic = this.message && this.message[0] === "#" ? this.message.slice(1, this.message.indexOf(" ")) : null;

    if (typeof(this.target) === "string") {
      this.target = ["dat://"+toHash(this.target)];
    } else if (!this.target && data.threadParent) {
      this.target = ["dat://"+toHash(data.threadParent)];
    } else if (!(this.target instanceof Array)) {
      this.target = [];
    }

    if (this.target[0]) {
      if (data.threadParent && (!this.quote || this.quote.url !== data.threadParent)) {
        // Refreshing the thread parent on URL updates only might be a little too conservative...
        // ... but Fritter doesn't even support edits natively, so we shouldn't worry about that.
        this.fetchThreadParent(data.threadParent, rerender);
      } else if (!this.quote && data.quote) {
        this.quote = new Entry(this.quote, this.target[0], rerender);
        this.quote.isQuote = true;
      }
    }

    this.mention = false;
    // Mention tag, eg @dc
    // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
    const mentionTag = "@" + r.home.portal.name
    const msg = this.message.toLowerCase()
    this.mention = this.mention || msg.endsWith(mentionTag) || msg.indexOf(mentionTag + " ") > -1;
    // Check if our portal is a target.
    this.mention = this.mention || (this.target && this.target.length > 0 && hasHash(r.home.portal, this.target));

    this.ready = true;
    return true;
  }

  toJSON() {
    return r.db.feed._def.serialize(this);
  }

  fetchPortal(hash, rerender = false) {
    let portal = r.getPortal(hash);
    if (portal)
      return portal;

    // TODO: Only rerender once per fetched portal. Multiple fetchPortals in quick succession will cause multiple redundant rerenders.
    r.fetchPortalExtra(hash).then(portal => {
      if (!portal)
        return;
      this.host = portal;
      if (rerender)
        this.el = this.render(this.el);
    });
    return r.getPortalDummy(hash);
  }

  fetchThreadParent(url, rerender = false) {
    let hash = toHash(url);
    let resolve = record => {
      if (!record)
        return;
      this.quote = new Entry(record, this.target[0], rerender);
      this.quote.url = url;
      this.quote.isQuote = true;
      if (!rerender)
        return;
      this.el = this.render(this.el);
    };

    r.db.feed.isCached(url).then(cached => {
      if (cached || r.db.isSource("dat://"+hash)) {
        r.db.feed.get(url).then(r => resolve(r));
        return;
      }

      fetch(url).then(r => r.json()).then(r => resolve(r))
      .catch(e => {});
    });
  }

  get localtime() {
    if (this._localtimeLastTimestamp === this.timestamp)
      return this._localtime;
    let date = new Date(this._localtimeLastTimestamp = this.timestamp);
    let lz = v => (v < 10 ? "0" : "") + v;
    return this._localtime = `${date.getFullYear()}-${lz(date.getMonth() + 1)}-${lz(date.getDate())} ${lz(date.getHours())}:${lz(date.getMinutes())}`;
  }

  isVisible(filter = null, target = null) {
    if (this.whisper && !hasHash(r.home.portal, this.target) && !hasHash(r.home.portal, this.host.url))
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
      return this.message.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
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
    if (typeof(el) === "undefined")
      el = this.el;
    (el = el ||
    rd$`<div class="entry"
        *?${rdh.toggleClass("whisper")} *?${rdh.toggleClass("mention")}
        *?${rdh.toggleClass("quote")} *?${rdh.toggleClass("bump")}
        >

          ?${"icon"}
          ?${"header"}
          ?${"body"}

          ?${"thread"}

          <hr/>
        </div>`
    );
    
    if (!this.ready)
      return el;

    el.rdomSet({
      "whisper": this.whisper,
      "mention": this.mention,
      "quote": this.quote,
      "bump": this.quote && !this.message,

      "icon": this.renderIcon,
      "header": this.renderHeader,
      "body": this.renderBody,

      "thread": this.renderThread,
    });

    return el;
  }

  renderIcon(el) {
    (el = el ||
    rd$`<a title=?${"title"} href=?${"url"} data-operation=?${"operation"} data-validate="true" onclick="return false">
          <img class="icon" *?${rdh.cachedAttribute("src")}>
        </a>`
    ).rdomSet({
      "title": this.host.name + (this.host.desc ? "\n"+this.host.desc : ""),
      "url": this.host.url,
      "operation": "filter:"+toOperatorArg(this.host.name),
      "src": this.host.icon,
    });

    return el;
  }

  renderHeader(el) {
    (el = el ||
    rd$`<c class="head">

          <c class="pinnedtext" *?${rdh.toggleEl("pinned")}>pinned entry</c>

          <a class="topic" *?${(() => {
            let h = rdh.toggleEl("topic");

            h.topicPrev = "";
            h.topic = "";
            h.get = () => h.topic;
            h.set = ((set) => (el, value) => {
              h.topic = value;
              set(el, value);
              if (!value || value === h.topicPrev)
                return;
              el = h.elOrig;
              h.topicPrev = value;
              el.setAttribute("data-operation", "filter #"+value);
              el.textContent = "#"+value;
            })(h.set);

            return h;
          })()}></a>

          <t .?${"portals"} class="portal"></t>
          <a title=?${"timestampTitle"} *?${rdh.textContent("timestampText")} *?${rdh.toggleClasses("timestampIsEdit", "editstamp", "timestamp")}></a>
          <t .?${"tools"} class="tools"></t>
    
        </c>`
    ).rdomSet({
      "pinned": this.pinned,
      "topic": this.topic,

      "timestampTitle": (!this.timestamp && !this.editstamp) ? "" : this.localtime,
      "timestampIsEdit": this.editstamp,
      "timestampText": (!this.timestamp && !this.editstamp) ? "" : `${this.editstamp ? "edited " : ""}${timeSince(this.timestamp)} ago`,
    });

    let { portals, tools } = el.rdomGetAll();

    // portals
    {
      let ctx = new RDOMCtx(portals);
      let eli = -1;

      ctx.add("author", ++eli, el => el ||
        rd$`<a data-operation=?${"operation"} href=?${"url"} data-validate="true" onclick="return false">
              ${renderRune("runeRelationship", "portal")}<span *?${rdh.textContent("name")}></span>
            </a>`
      ).rdomSet({
        "operation": "filter:"+toOperatorArg(this.host.name),
        "url": this.host.url,
        "runeRelationship": this.host.relationship,
        "name": this.host.name,
      });

      ctx.add("action", ++eli, el => el || rd$`<span *?${rdh.textContent("headerAction")}></span>`).rdomSet({
        "headerAction":
          (this.whisper) ? "whispered to" :
          (this.quote && !this.message) ? "bumped" :
          (this.quote) ? "quoted" :
          (this.target.length !== 0) ? "mentioned" :
          "",
      });

      for (let i in this.target) {
        let target = this.target[i];

        let name = r.getName(target);
        let relationship = r.getRelationship(target);
        ctx.add(target, ++eli, el => el ||
          rd$`<a data-operation=?${"operation"} href=?${"url"} data-validate="true" onclick="return false">
                ${renderRune("runeRelationship", "portal")}<span *?${rdh.textContent("name")}></span>
              </a>`
        ).rdomSet({
          "operation": "filter:"+toHash(target),
          "url": target,
          "runeRelationship": relationship,
          "name": name,
        });

        // @ts-ignore
        if (i < this.target.length - 1)
          ctx.add(this.host.url, ++eli, el => el || rd$`<span>, </span>`);
      }
      
      ctx.cleanup();
    }

    // tools
    if (this.host.url[0] !== "$") {
      let ctx = new RDOMCtx(tools);
      let eli = -1;

      if (this.host.name === r.home.portal.name && r.isOwner) {
        ctx.add("del", ++eli, el => el || rd$`<c data-operation=?${"operation"}>del</c>`).rdomSet({
          "operation": "delete:"+this.id
        });
        ctx.add("edit", ++eli, el => el || rd$`<c data-operation=?${"operation"}>edit</c>`).rdomSet({
          "operation": "edit:"+this.id+" "
        });
        ctx.add("pin", ++eli, el => el || rd$`<c data-operation=?${"operation"}>pin</c>`).rdomSet({
          "operation": "pin:"+this.id
        });
      }

      ctx.add("quote", ++eli, el => el || rd$`<c data-operation=?${"operation"} *?${rdh.textContent("text")}></c>`).rdomSet({
        "operation": "quote:"+this.id+" ",
        "text": this.whisper ? "reply" : "quote"
      });

    }

    return el;
  }

  renderBody(el) {
    (el = el ||
    rd$`<t class="message" dir="auto" *?${(() => {
        let lastMessage = "";
        return {
          name: "message",
          get: () => lastMessage,
          set: (el, value) => {
            if (lastMessage === value)
              return;
            lastMessage = value;
            el.innerHTML = this.format(value);
          }
        }
      })()}></t>`
    ).rdomSet({
      "message": this.message
    });
    
    return el;
  }

  renderThread(el) {
    (el = el || new RDOMContainer(
    rd$`<div *?${rdh.toggleClass("hasThread", "thread")}></div>`
    )).rdomSet({
      hasThread: this.quote && !this.isQuote
    });

    if (this.isQuote)
      return;

    let ctx = el.rdomCtx;

    let eli = -1;
    let length = 0;
    for (let quote = this.quote; quote; quote = quote.quote) {
      quote.isQuote = true;
      ++length;
      if (!this.expanded && length > 1)
        continue;
      quote.el = ctx.add(quote.id, ++eli, quote);
    }

    if (length > 1) {
      ctx.add("expand", ++eli, el => el ||
        rd$`<t class="expand" *?${rdh.toggleClasses("expanded", "up", "down")} data-operation=?${"operation"} data-validate="true" *?${rdh.textContent("text")}></t>`
      ).rdomSet({
        "expanded": this.expanded,
        "operation": (this.expanded ? "collapse:" : "expand:")+this.id,
        "text": this.expanded ? "Hide" : `Show ${length === 1 ? "Quote" : ("+" + (length - 1) + (length === 2 ? " Entry" : " Entries"))}`,
      });
    }

    ctx.cleanup();

    return el;
  }

  format(message) {
    message = this.topic ? message.slice(this.topic.length + 1).trimLeft() : message;
    return message.split("\n").map(this.formatLine, this).join("<br>");
  }

  /** @arg {string} m */
  formatLine(m) {
    m = rdom.escapeHTML(m);
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
      let isURLdat = word.startsWith("dat://");
      let isURLhttp = word.startsWith("http://");
      let isURLhttps = word.startsWith("https://");
      if (isURLdat || isURLhttp || isURLhttps) {
        let compressed = word;

        let cutoffLen = -1;

        if (isURLdat) {
          let domain = toHash(word);
          let rest = word.substr(6 + domain.length);
          if (domain.indexOf(".") === -1) {
            domain = domain.substr(0, 8) + ".." + domain.substr(domain.length - 4);
          }
          cutoffLen = domain.length + 15;
          compressed = domain + rest;

        } else if (isURLhttp || isURLhttps) {
          try {
            let url = new URL(word);
            cutoffLen = url.hostname.length + 15;
            compressed = word.substr(isURLhttps ? 8 : isURLhttp ? 7 : (word.indexOf("://") + 3));
          } catch (e) {
          }
        }

        if (cutoffLen != -1 && compressed.length > cutoffLen) {
          compressed = compressed.substr(0, cutoffLen) + "..";
        }

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
        n += escape$`<a href="$${m.slice(linkbr + 1, linkend)}">$${m.slice(c + 1, linkbr)}</a>`;
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
        if (match[1] == r.home.portal.name) {
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

function EntryLegacy(data,host)
{
  this.expanded = false;
  this.embed_expanded = false;
  this.pinned = false;

  this.to_html = function()
  {
    var html = "";

    var embed_needs_refresh = false; // Helpful when the detect_embed promise resolves immediately.
    this.detect_embed().then(e => {
      // If no embed was ever found, return.
      if (!this.embed && !e) return;
      // If no embed was found before, found now or if both embeds mismatch, update.
      var refresh = !this.embed || !e || this.embed.url !== e.url;
      this.embed = e;
      if (refresh && embed_needs_refresh) {
        // If embed updated and promise resolved too late, trigger feed refresh.
        r.home.feed.refreshLazy("embed in post updated");
      }
    });

    html += this.icon();
    html += this.header();
    html += this.body();
    if(this.quote){
      var quote = this.quote;
      if (!this.expanded)
        while (!quote.message && quote.quote)
          quote = quote.quote;
      var thread_id = escape_html(this.host.name)+"-"+this.id;
      html += "<div class='thread'>"+quote.thread(this.expanded, thread_id)+"</div>";
    }
    if(!this.quote || !this.quote.quote || this.expanded || !this.message){
      embed_needs_refresh = true;
      html += this.rmc();
    }

    return "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+" "+(this.quote ? 'quote' : '')+" "+(this.quote && !this.message ? 'bump' : '')+"'>"+html+"<hr/></div>";
  }

  this.thread = function(recursive, thread_id)
  {
    var html = "";

    html += "<div class='entry "+(this.whisper ? 'whisper' : '')+" "+(this.is_mention ? 'mention' : '')+"'>";
    html += this.icon();
    var a_attr = "href='"+escape_attr(this.host.url)+"' onclick='return false' data-operation='"+escape_attr("filter:"+this.host.name)+"' data-validate='true'";
    if (this.host.url === r.url || this.host.url === "$rotonde") {
      a_attr = "style='cursor: pointer;'";
    }
    html += "<t class='message' dir='auto'><a "+a_attr+"'>"+r.getRelationship(this.host.url)+escape_html(r.getName(this.host.url))+"</a> "+(this.format(this.message))+"</t></div>";

    if(recursive){
      if(this.quote){ html += this.quote.thread(recursive, thread_id); }
      else{ html += "<t class='expand up' data-operation='collapse:"+thread_id+"' data-validate='true'>Collapse</t>"; }
    }
    else {
      var length = this.thread_length();
      if(length > 0 || this.media){
        html += "<t class='expand down' data-operation='expand:"+thread_id+"' data-validate='true'>"+(length > 0 ? "Expand "+(length+1)+" Entries" : "Expand Entry")+"</t>";
      }
    }
    return html;
  }

  this.rmc = function() // Rich Media Content
  {
    var html = "";
    if(this.media){
      // We hope that the URI's already encoded.
      // We can't encode it here as that'd break previously encoded URIs (see: operator.commands.say).
      var media = this.media;
      if (media.startsWith("/"))
        media = media.substring(1);
      else if (media.startsWith("%2F"))
        media = media.substring(3);
      if (media.startsWith("media/content/"))
        media = media.substring("media/content/".length);
      else if (media.startsWith("media%2Fcontent%2F"))
        media = media.substring("media%2Fcontent%2F".length);
      var parts = media.split(".")
      extension = parts[parts.length-1].toLowerCase();
      if (parts.length === 1) { // support og media uploads
        media += ".jpg";
        extension = "jpg";
      }
      audiotypes = ["m4a", "mp3", "oga", "ogg", "opus"];
      videotypes = ["mp4", "ogv", "webm"];
      imagetypes = ["apng", "gif", "jpg", "jpeg", "jpe", "png", "svg", "svgz", "tiff", "tif", "webp"];

      var origin = this.thread_root().host.url;
      origin += origin.toString().slice(-1) == "/" ? "" : "/";

      if(audiotypes.indexOf(extension) > -1){ html += this.rmc_element(origin, media, "audio", "media", "controls", ""); }
      else if(videotypes.indexOf(extension) > -1){ html += this.rmc_element(origin, media, "video", "media", "controls", ""); }
      else if(imagetypes.indexOf(extension) > -1){ html += this.rmc_bigpicture(origin, media, "img", "media", "", ""); }
      else{ html += this.rmc_element(origin, media, "a", "media", "", "&gt;&gt; "+media); }
    } else if (this.embed && this.embed.provider) {
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
    }
    return html;
  }
  this.rmc_element = function(origin, media, tag, classes = "media", extra = "", inner = "")
  {
    return "<"+tag+" class='"+classes+"' "+(tag==="a"?"href":"src")+"='"+(origin?(origin+"media/content/"+media):media)+"' "+extra+">"+inner+"</"+tag+">";
  }
  this.rmc_bigpicture = function(origin, media, tag, classes = "media", extra = "", inner = "", href = "")
  {
    return this.rmc_element(origin, href || media, "a", "thin-wrapper", "onclick='return false' target='_blank'",
      this.rmc_element(origin, media, tag, classes, extra + " data-operation='big:"+escape_attr(this.host.name)+"-"+this.id+"' data-validate='true'", inner)
    );
  }

  this.big = function()
  {
    r.home.feed.bigpicture_toggle(() => this.to_html());
  }

  this.detect_mention = function()
  {
    // Mention tag, eg '@dc'
    const mentionTag = '@' + r.home.portal.name
    const msg = this.message.toLowerCase()
    // We want to match messages containing @dc, but NOT ones containing eg. @dcorbin
    if(msg.endsWith(mentionTag) || msg.indexOf(mentionTag + ' ') > -1) {
      return true;
    }

    // check for mentions of our portal or of one of our remotes in sameAs
    if (this.target && this.target.length > 0) {
      var has_mention = has_hash(r.home.portal, this.target);
      if (r.home.portal.sameAs) {
        has_mention = has_mention || has_hash(r.home.portal.sameAs, this.target);
      }
      return has_mention;
    }
    return false;
  }

  this.__detecting_embed__ = null;
  this.__detected_embed_message__ = null;
  this.__detected_embed__ = null;
  this.detect_embed = function() { return this.__detecting_embed__ || (this.__detecting_embed__ = (async () => {
    if (this.media) {
      this.__detecting_embed__ = null;
      return null;
    }

    var m = this.message;

    if (m === this.__detected_embed_message__) {
      return this.__detected_embed__;
    }
    this.__detected_embed_message__ = m;

    var space, newline, split, embed;
    // c: current char index
    for (var c = 0; c < m.length; c = split + 1) {
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
      var word = m.substring(c, split);

      // Check for URL
      var is_url_dat = word.startsWith("dat://");
      var is_url_http = word.startsWith("http://");
      var is_url_https = word.startsWith("https://");
      if (is_url_dat || is_url_http || is_url_https) {
        embed = new Embed(word);
        if (embed.provider) {
          this.__detecting_embed__ = null;
          return embed;
        }
        continue;
      }

      // Check for { upcoming | and }
      if (word.length > 1 && word[0] === '{' && m[c - 1] !== "\\") {
        var linkbr = m.indexOf("|", c);
        if (linkbr < 0) { continue; }
        var linkend = m.indexOf("}", linkbr);
        if (linkend < 0) { continue; }

        embed = new Embed(m.substring(linkbr + 1, linkend));
        if (embed.provider) {
          this.__detecting_embed__ = null;
          return embed;
        }
        continue;
      }

    }

    var embed = this.quote && this.quote.detect_embed ? await this.quote.detect_embed() : null;
    this.__detecting_embed__ = null;
    return this.__detected_embed__ = embed;
  })())}

  this.thread_length = function()
  {
    return this.quote ? this.quote.thread_length() + 1 : 0;
  }

  this.thread_root = function()
  {
    return this.quote ? this.quote.thread_root() : this;
  }

  this.is_mention = this.detect_mention()
}
