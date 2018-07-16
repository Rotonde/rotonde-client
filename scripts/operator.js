//@ts-check
class OperatorCommand {
  /**
   * @param {string} name
   * @param {string} help
   * @param {function(string, string) : any} run
   */
  constructor(name, help, run) {
    this.name = name;
    this.help = help;
    this.run = run;
  }
}

class Operator {
  constructor() {
    this._isDragging = false;
  
    this.patternName = new RegExp(/^@(\w+)/, "i");
    this.patternNameWhisper = new RegExp(/^whisper:(\w+)/, "i");
    this.patternMention = /([@~])(\w+)/g;
    this.patternHelpPrefix = /\:\:/g;

    this.prefix = localStorage.getItem("command_prefix") || "/";
  
    this.history = [];
    this.historyIndex = -1;
    this.historyBuffer = "";

    /** @type OperatorCommand[] */
    this.commands = [];

    // commands
    {
      this.commands.push(new OperatorCommand("say", "message\nmessage >> media.jpg", async (p, option) => {
        alert(p);
      }));

      this.commands.push(new OperatorCommand("help", "::help\n::help cmd", (p, option) => {
        if (!p)
          p = option;
    
        let life = -1;
        if (!p) {
            // r.home.log(this.commands.map(cmd => this.prefix + cmd.name).join(" "), life);
            r.home.log(this.commands.map(cmd => cmd.help.replace(this.patternHelpPrefix, this.prefix)).join("\n"), life);
            return;
        }

        let cmd = this.getCommand(p.split(" ")[0]);
        if (!cmd) {
          r.home.log(`unknown command ${p.split(" ")[0]}`, life);
          return;
        }

        r.home.log(cmd.help.replace(this.patternHelpPrefix, this.prefix), life);
      }));

      this.commands.push(new OperatorCommand("filter", "::filter search query\n::filter:user_name_or_category\n::filter:", async (p, option) => {
        let target = option || "";
        let filter = p || "";
        window.location.hash = target;
        r.home.feed.target = target;
        r.home.feed.el.className = target;
        r.home.feed.filter = filter;
        r.home.render();
      }));

      this.commands.push(new OperatorCommand("dat", "dat://...", async (p, option) => {
        let hash = toHash(option);

        if (hasHash(r.home.portal, hash)) {
          console.warn("[op:dat]", "Can't follow yourself.");
          return;
        }
    
        let index = r.home.portal.follows.findIndex(f => toHash(f.url) === hash);
        if (index !== -1) {
          console.warn("[op:dat]", "Already following:", hash);
          return;
        }

        r.home.portal.follows.push({ name: r.getName(hash), url: "dat://"+hash });
        await r.db.portals.update(r.home.portal.recordURL, {
          follows: r.home.portal.follows
        });
        r.home.feed.connectQueue.splice(0, 0, "dat://"+hash);
        await r.home.feed.connectNext();

        r.render("followed");
      }));

      this.commands.push(new OperatorCommand("undat", "undat://...", async (p, option) => {
        let hash = toHash(option);
    
        let index = r.home.portal.follows.findIndex(f => toHash(f.url) === hash);
        if (index === -1) {
          console.warn("[op:undat]", "Not following:", hash);
          return;
        }

        r.home.portal.follows.splice(index, 1);
        await r.db.portals.update(r.home.portal.recordURL, {
          follows: r.home.portal.follows
        });
    
        let portal = r.home.feed.getPortal(hash);
        if (portal) {
          r.home.feed.portals.splice(r.home.feed.portals.indexOf(portal), 1);
          // Note: The archive can still appear in discovery.
          await r.db.unindexArchive(portal.archive);
        }

        r.render("unfollowed");
      }));

      this.commands.push(new OperatorCommand("pin", "::pin:id\n::pin:", async (p, option) => {
        await r.db.portals.update(r.home.portal.recordURL, {
          pinned: option
        });
        r.home.render();
      }));

      this.commands.push(new OperatorCommand("expand", "::expand:id", async (p, option) => {
        let entry = r.home.feed.entryMap[option];
        if (!entry)
          return;

        entry.expanded = true;
        entry.render();
      }));

      this.commands.push(new OperatorCommand("collapse", "::collapse:id", async (p, option) => {
        let entry = r.home.feed.entryMap[option];
        if (!entry)
          return;

        entry.expanded = false;
        entry.render();
      }));
    
      this.commands.push(new OperatorCommand("nightmode", "::nightmode", async (p, option) => {
        let html = document.body.parentElement;
        if (html.classList.contains("night"))
          html.classList.remove("night");
        else
          html.classList.add("night");
      }));

    }

    this.el =
    rd$`<div id="operator">
          <img !?${"icon"} src="media/content/icon.svg">

          <div id="wrapper">
            <textarea .?${"input"} id="commander" placeholder="Loading"></textarea>
            <t !?${"hint"}></t>
            <div !?${"rune"}></div>
          </div>

          <div id="options">
            <t data-operation="page:1">page</t>
            <t data-operation="filter keyword">filter</t>
            <t data-operation="whisper:user_name message">whisper</t>
            <t data-operation="quote:user_name-id message">quote</t>
            <t data-operation="message >> media.jpg">media</t>
            <t class="right" data-operation="edit:id message">edit</t>
            <t class="right" data-operation="delete:id">delete</t>
          </div>
        </div>`;
    this.icon = this.input = this.hint = this.rune = null;
    this.el.rdomGet(this);
    r.root.appendChild(this.el);
  }

  start() {
    this.input.addEventListener("keydown", this.onKeyDown.bind(this), false);
    this.input.addEventListener("input", this.onInputChanged.bind(this), false);
    this.input.addEventListener("dragover", this.onDragOver.bind(this), false);
    this.input.addEventListener("dragleave", this.onDragLeave.bind(this), false);
    this.input.addEventListener("drop", this.onDrop.bind(this), false);
    this.input.addEventListener("paste", this.onPaste.bind(this), false);
  }
  
  /** @returns {boolean} */
  get isDragging() {
    return this._isDragging;
  }
  set isDragging(value) {
    this._isDragging = value;
    if (value) {
      this.el.classList.add("drag")
    } else {
      this.el.classList.remove("drag")
    }
  }

  get autocompleteWords() {
    let words = this.input.value.split(" ");
    let last = words[words.length - 1]
    let nameMatch = this.patternName.exec(last);
    let nameMatchWhisper = this.patternNameWhisper.exec(last);

    if (!nameMatch && !nameMatchWhisper)
      return [];
    /** @type {string[]} */
    let a = [];
    let name = nameMatch ? nameMatch[1] : nameMatchWhisper[1];
    // FIXME: Port.
    /*
    for (let portal of r.home.feed.portals) {
      if (portal.name && portal.name.substr(0, name.length) === name) {
        a.push(portal.name);
      }
    }
    */
    return a;
  }

  getCommand(input) {
    return this.commands.find(cmd => cmd.name === input);
  }

  render() {
    let inputValue = this.input.value || this.input.placeholder;
    this.input.style.height = (inputValue.length / 40 * 20) + (inputValue.indexOf("\n") > -1 ? inputValue.split("\n").length * 20 : 0) + "px";

    let input = this.input.value.trim();
    let words = input === "" ? 0 : input.split(" ").length;
    let chars = input.length;

    let autocomplete = this.autocompleteWords;
    this.hint.textContent = autocomplete.length > 0 ? autocomplete[0] : `${chars}C ${words}W`;
    this.hint.className = autocomplete.length > 0 ? "autocomplete" : "";

    this.rune.textContent = "";
    this.rune.className = "rune rune-operator";
    if (this.prefix ? input.startsWith(this.prefix) : this.getCommand(input.split(" ")[0])) {
      this.rune.classList.add("rune-operator-command");
    } else if (this.prefix && (input === "help" || input.startsWith("help ") || input.startsWith("dat://") || input.startsWith("undat://"))) {
      this.rune.classList.add("rune-operator-command");
    } else if (input.indexOf(">>") > -1) {
      this.rune.classList.add("rune-operator-media");
    } else {
      this.rune.classList.add("rune-operator-message");
    }

    if (input.length > 0)
      this.rune.classList.add("input");
  }

  inject(text) {
    this.input.value = text;
    this.input.focus();
    this.render();
  }

  validate() {
    let value = this.input.value;

    let commandName = value.split(" ")[0];
    let params = value.indexOf(" ") > -1 ? value.slice(commandName.length + 1) : "";
    if (this.prefix) {
      if (value === "help" || value.startsWith("help ") || value.startsWith("dat://") || value.startsWith("undat://")) {
        // Preserve the command.
      } else if (!commandName.startsWith(this.prefix)) {
        commandName = "";
      } else {
        commandName = commandName.slice(this.prefix.length);
      }
    }

    let option = commandName.split(":")[1];
    commandName = commandName.split(":")[0];
    
    let command = this.getCommand(commandName);
    if (!command) {
      if (this.prefix && commandName) {
        command = { name: commandName, help: "", run: () => r.home.log("unknown command "+commandName, -1) };
      } else {
        command = this.getCommand("say");
        params = value.trim();
      }
    }

    this.history.push(value);
    this.historyIndex = -1;
    this.historyBuffer = "";

    command.run(params, option);

    this.input.value = "";
  }

  send(message, data) {
    let media = "";
    // Rich content
    let indexOfMedia = message.lastIndexOf(">>");
    if (indexOfMedia > -1) {
      // encode the file names to allow for odd characters, like spaces
      // Encoding the URI needs to happen here.
      // We can't encode it in entry.rmc as that'd break previously encoded URIs.
      media = encodeURIComponent(message.substring(indexOfMedia + 2).trim());
      message = message.substring(0, indexOfMedia).trim();
    }

    data = data || {};
    data.media = data.media || media;
    data.message = data.message || message;
    data.timestamp = data.timestamp || Date.now();
    data.target = data.target || [];

    // handle mentions
    let tmp;
    while ((tmp = this.patternMention.exec(message)) !== null) {
      let portals = this.lookupName(tmp[2]);
      if (portals.length > 0 && data.target.indexOf(portals[0].url) <= -1) {
        data.target.push(portals[0].url);
      }
    }

    // FIXME: Port.
    // r.home.add_entry(new Entry(data));
  }

  lookupName(name) {
    // We return an array since multiple people might be using the same name.
    let results = [];
    
    // FIXME: Port.
    /*
    for (let portal of r.home.feed.portals) {
      if (portal.name === name)
        results.push(portal);
    }
    
    // If no results found at all, try searching discovered portals.
    if (results.length === 0) {
      for (let portal of r.home.discovered) {
        if (portal.name === name)
          results.push(portal);
      }
    }
    */

    return results;
  }

  onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.validate();
      this.render();
      return;
    }

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      let words = this.input.value.split(" ");
      let last = words[words.length - 1]
      let nameMatch = this.patternName.exec(last);
      let nameMatchWhisper = this.patternNameWhisper.exec(last);
      if (nameMatch || nameMatchWhisper) {
        let autocomplete = this.autocompleteWords;
        if (autocomplete.length > 0) {
          words[words.length - 1] = `${nameMatch ? "@" : "whisper:"}${autocomplete[0]}`;
          this.inject(words.join(" ") + " ");
          this.render();
          return;
        }
      }
    }

    if (e.key === "ArrowUp" && this.input.selectionStart === 0) {
      if (this.history.length > 0) {
        e.preventDefault();
      }

      if (this.historyIndex <= -1) {
        this.historyIndex = this.history.length - 1;
        this.historyBuffer = this.input.value;

      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1;
        if (this.history.length > 0) {
          this.inject(this.history[this.historyIndex]);
        }
      }
    }

    if (e.key === "ArrowDown" && this.input.selectionStart === this.input.value.length){
      if (this.history.length > 0) {
        e.preventDefault();
      }

      if (this.historyIndex === this.history.length - 1 && this.history.length > 0) {
        this.inject(this.historyBuffer);
        this.historyIndex = -1;
        return;

      } else if(this.historyIndex <= -1) {
        return;

      } else if(this.historyIndex < this.history.length - 1) {
        this.historyIndex += 1;
        if (this.history.length > 0) {
          this.inject(this.history[this.historyIndex]);
        }
      }
    }

    this.render();
  }

  onInputChanged(e) {
    r.home.log(r.home.logPrev);
    this.render();
  }

  onDragOver(e) {
    e.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(e) {
    e.preventDefault();
    this.isDragging = false;
  }

  onDrop(e) {
    e.preventDefault();
    let files = e.dataTransfer.files;
    if (files.length === 1) {
      let file = files[0];
      let type = file.type;
      if (type.startsWith("image/"))
        this.mediaDrop(file, file.name);
    }
    this.dragging = false;
  }

  onPaste(e) {
    for (let item of e.clipboardData.items) {
      let type = item.type;
      if (!type)
        continue;

      if (type.startsWith("image/")) {
        let indexOfPlus = type.indexOf("+");
        if (indexOfPlus < 0)
          indexOfPlus = type.length;
        this.mediaDrop(item.getAsFile(), "clipboard-" + Date.now() + "." + type.slice(6, indexOfPlus));
        break;
      }

      // Special case: dotgrid (or other compatible app) SVG
      if (type === "text/svg+xml") {
        let indexOfPlus = type.indexOf("+");
        if (indexOfPlus < 0)
          indexOfPlus = type.length;
        this.mediaDrop(e.clipboardData.getData(type), "clipboard-" + Date.now() + "." + type.slice(5, indexOfPlus));
        break;
      }
    }
  }

  mediaDrop(file, name) {
    let done = async (result) => {
      let archive = new DatArchive(window.location.toString());
      await archive.writeFile("/media/content/" + name, result);

      let commanderText = "text_goes_here >> " + name
      // If there's already a message written, append ">> name" to it.
      if (this.input.value)
        commanderText = this.input.value.trim() + " >> " + name;
      this.inject(commanderText);
    };

    if (!file)
      return;

    if (typeof(file) === "string") {
      done(file);
      return;
    }

    name = name || file.name;
    let reader = new FileReader();
    reader.onload = function (e) { done(e.target.result); };
    reader.readAsArrayBuffer(file);
  }

}

function OperatorLegacy(el)
{

  this.commands = {};

  this.commands.say = function(p)
  {
    var message = p.trim();

    if(!message){ return; }

    this.send(message);
  }

  this.commands.edit = async function(p,option)
  {
    var recordURL = r.home.portal.recordURL;
    if(option == "name"){
      await r.db.portals.update(recordURL, {
        name: p.substr(0, 14)
      });
    }
    else if(option == "desc"){
      await r.db.portals.update(recordURL, {
        desc: p
      });
    }
    else if(option == "site"){
      await r.db.portals.update(recordURL, {
        site: this.validate_site(p)
      });
    }
    else if(option == "discoverable"){
      p = p && p.toLowerCase().trim();
      var value;
      if (!p || p === "true" || p === "y" || p === "yes")
        value = true;
      else if (p === "false" || p === "n" || p === "no")
        value = false;
      else
        throw new Error("edit:discoverable doesn't support option " + p);
      await r.db.portals.update(recordURL, {
        discoverable: value
      });
    }
    else
    {
      /*dont-await*/ r.db.feed.update(r.home.portal.archive.url + "/posts/" + option + ".json", {
        editedAt: Date.now(),
        text: p
      });
    }

  }

  this.commands.mirror = async function(p,option)
  {
    var remote = p;
    if(remote.slice(-1) !== "/") { remote += "/" }

    if (!r.home.portal.sameAs)
      r.home.portal.sameAs = [];

    if (hasHash(r.home.portal.sameAs, remote))
      return;

    // create the array if it doesn't exist
    if (!r.home.portal.sameAs) { r.home.portal.sameAs = [] }
    r.home.portal.sameAs.push(remote);
    try {
      var remote_portal = new Portal(remote)
      remote_portal.start().then(r.home.portal.load_remotes)
    } catch (err) {
      console.error("Error when connecting to remote", err)
    }
    
    await r.db.portals.update(r.home.portal.recordURL, {
      sameas: r.home.portal.sameAs
    });
  }

  this.commands.unmirror = async function(p,option)
  {
    var remote = p;
    if(remote.slice(-1) !== "/") { remote += "/" }

    if (!r.home.portal.sameAs)
      r.home.portal.sameAs = [];

    // Remove
    if (r.home.portal.sameAs.indexOf(remote) > -1) {
      r.home.portal.sameAs.splice(r.home.portal.sameAs.indexOf(remote), 1);
    } else {
      console.log("could not find",remote);
      return;
    }

    var portal = r.home.feed.getPortal(remote);
    if (portal && portal.isRemote) {
      r.home.feed.portals.splice(r.home.feed.portals.indexOf(portal), 1);
    }

    await r.db.portals.update(r.home.portal.recordURL, {
      sameas: r.home.portal.sameAs
    });
  }

  this.commands.delete = async function(p,option)
  {
    await r.db.feed.delete(r.home.portal.archive.url + "/posts/" + option + ".json");
    // Delete entry from cache.
    if (r.home.portal.__entries_buffered__) {
      for (var i in r.home.portal.__entries_buffered__) {
        if (r.home.portal.__entries_buffered__[i].id !== option)
          continue;
        r.home.portal.__entries_buffered__.splice(i, 1);
        break;
      }
    }
    if (r.home.portal._.entries) {
      for (var i in r.home.portal._.entries) {
        if (r.home.portal._.entries[i].id !== option)
          continue;
        r.home.portal._.entries.splice(i, 1);
        break;
      }
    }
  }

  this.commands.quote = async function(p,option)
  {
    var message = p.trim();
    var {name, ref} = this.split_nameref(option);

    var portals = this.lookupName(name);
    if (portals.length === 0) return;

    var quote = await portals[0].entryBuffered(ref);
    if (!quote) return;

    var target = portals[0].url;
    if (target === r.url) {
      target = "$rotonde";
    }
    
    var targets = [target];
    if (target === r.home.portal.url && quote.target[0]) {
      // We can quote ourselves, but still target the previous author.
      if (quote.target[0] === r.home.portal.url && quote.target.length > 1) {
        // We're quoting ourself quoting ourself quoting someone...
        if (!hasHash(targets, quote.target[1])) targets.push(quote.target[1]);
      } else {
        if (!hasHash(targets, quote.target[0])) targets.push(quote.target[0]);        
      }
    }
    this.send(message, {
      quote: quote,
      target: targets,
      ref: ref,
      media: quote.media,
      whisper: quote.whisper
    });
  }

  this.commands.whisper = function(p,option)
  {
    var name = option;
    var portals = this.lookupName(name);
    if (portals.length === 0) {
      return;
    }

    var target = portals[0].url;
    if (target === r.url) {
      target = "$rotonde";
    }
    this.send(p.trim(), {
      target: [target],
      whisper: true
    });
  }

  this.commands['++'] = async function(p, option) {
    await this.commands.page('++');
  }
  this.commands['--'] = async function(p, option) {
    await this.commands.page('--');
  }
  this.commands.page = async function(p, option) {
    if (p === '' || p == null)
      p = option;
    if (p === '' || p == null)
      throw new Error('No parameter given for page command!');

    var page = parseInt(p);
    if (p.length >= 1 && (p[0] == '+' || p[0] == '-')) {
      if (isNaN(page))
          page = p[0] == '+' ? 1 : -1;
      page += r.home.feed.page;
    } else {
      page -= 1;
    }

    if (isNaN(page))
      throw new Error('No valid parameter given for page command!');
    if (page < 0)
      page = 0;
    await r.home.feed.page_jump(page, false); // refresh = false, as we refresh again on command validation
  }

  this.commands.network_refresh = function(p, option) {
    r.home.discover();
  }

  this.commands.discovery = function(p, option) {
    r.home.discover();
    this.commands.filter("", "discovery");
  }

  this.commands.enable_discovery = function(p, option) {
    localStorage.setItem("discovery_enabled", true);
    r.home.discovery_enabled = true;
    r.home.discover();
    this.commands.filter("", "discovery");
  }

  this.commands.disable_discovery = function(p, option) {
    localStorage.setItem("discovery_enabled", false);
    r.home.discovery_enabled = false;
  }

  this.commands.embed_expand = async function(p, option)
  {
    var {name, ref} = this.split_nameref(option);

    var portals = this.lookupName(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entryBuffered(ref);
    if (!entry) return;

    entry.embed_expanded = true;
  }

  this.commands.embed_collapse = async function(p, option)
  {
    var {name, ref} = this.split_nameref(option);

    var portals = this.lookupName(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entryBuffered(ref);
    if (!entry) return;

    entry.embed_expanded = false;
  }

  this.commands.big = async function(p, option)
  {
    if (!p && !option) {
      r.home.feed.bigpicture_hide();
      return;
    }

    var {name, ref} = this.split_nameref(option);

    var portals = this.lookupName(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entryBuffered(ref);
    if (!entry) return;

    entry.big();
  }
}
