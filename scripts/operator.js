// @ts-check

import { r } from "./rotonde.js";
import { toOperatorArg, toKey, hasKey } from "./util.js";
import { rd$, rdom } from "./rdom.js";

export class OperatorCommand {
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

export class Operator {
  constructor() {
    this._isDragging = false;

    this.prefix = localStorage.getItem("command_prefix") || "/";
  
    this.patternName = /^@(\S+)/i;
    this.patternNameWhisper = new RegExp(`^${this.prefix}whisper:(\\S+)`, "i");
    this.patternMention = /([@~])(\S+)/g;
    this.patternNameCommand = new RegExp(`^${this.prefix}(\\S+)`, "i");
    this.patternHelpPrefix = /\:\:/g;
  
    this.history = [];
    this.historyIndex = -1;
    this.historyBuffer = "";

    /** @type OperatorCommand[] */
    this.commands = [];

    // commands
    {
      this.commands.push(new OperatorCommand("say", "message\nmessage >> media.jpg", async (p, option) => {
        this.send(p.trim());
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
          r.home.log(`unknown command: ${p.split(" ")[0]}`, life);
          return;
        }

        r.home.log(cmd.help.replace(this.patternHelpPrefix, this.prefix), life);
      }));

      this.commands.push(new OperatorCommand("intro", "::intro", async (p, option) => {
        let value = localStorage.getItem("intro_hidden");
        localStorage.setItem("intro_hidden", ""+!(value === "true"));
        r.home.feed.render();
      }));

      this.commands.push(new OperatorCommand("edit", "::edit:name name\n::edit:desc description\n::edit:id message", async (p, option) => {
        // FIXME: Citizen: Edit.

        let profileURL = r.home.portal.recordURL;
        if (option === "name") {
          /*
          await r.db.portals.update(profileURL, {
            name: p
          });
          */
          r.render("edited: name");
          return;
        }

        if (option === "bio" || option === "desc") {
          /*
          await r.db.portals.update(profileURL, {
            bio: p
          });
          */
          r.render("edited: bio");
          return;
        }

        let url = r.home.portal.user.url + "/posts/" + option + ".json";

        if (r.home.portal.entries.indexOf(url) === -1) {
          r.home.log(`post or option not found: ${option}`, -1);
          return;
        }

        /*
        await r.db.feed.update(url, {
          editedAt: Date.now(),
          text: p
        });
        */
        r.render("edited: "+option);
      }));

      this.commands.push(new OperatorCommand("delete", "::delete:id", async (p, option) => {
        // Delete entry from cache.
        let entry = r.home.feed.entryMap[option];
        if (entry) {
          r.home.feed.entryMap[option] = null;
          r.home.feed.entries.splice(r.home.feed.entries.indexOf(entry), 1);
        }
        // FIXME: Citizen: Delete.
        // await r.db.feed.delete(r.home.portal.archive.url + "/posts/" + option + ".json");
        r.render("deleted: "+option)
      }));

      this.commands.push(new OperatorCommand("quote", "::quote:id message", async (p, option) => {
        let quote = r.home.feed.entryMap[option];
        if (!quote)
          return;
        
        let targets = [quote.host.url];
        if (targets[0] === r.home.portal.url && quote.target[0]) {
          // We can quote ourselves, but still target the previous author.
          if (quote.target[0] === r.home.portal.url && quote.target.length > 1) {
            // We're quoting ourself quoting ourself quoting someone...
            if (!hasKey(targets, quote.target[1]))
              targets.push(quote.target[1]);
          } else {
            if (!hasKey(targets, quote.target[0]))
              targets.push(quote.target[0]);
          }
        }

        this.send(p.trim(), {
          quote: quote.toJSON(),
          threadParent: quote.url,
          target: targets,
          whisper: quote.whisper
        });
      }));

      this.commands.push(new OperatorCommand("whisper", "::whisper:user_name message", async (p, option) => {
        let name = option;
        let portals = this.lookupName(name);
        if (portals.length === 0)
          return;
    
        this.send(p.trim(), {
          target: [portals[0].url],
          whisper: true
        });
      }));

      this.commands.push(new OperatorCommand("filter", "::filter search query\n::filter:user_name_or_category\n::filter:", async (p, option) => {
        let target = option || "";
        let filter = p || "";
        window.location.hash = target;
        window.scrollTo(0, 0);
        r.home.feed.target = target;
        r.home.feed.el.className = target;
        r.home.feed.filter = filter;
        r.home.feed.bigpictureEntry = null;
        await r.home.render();
        await r.home.feed.fetchFeed(true, true);
        window.scrollTo(0, 0); // Required to work around a bug where getBoundingClientRect scrolls up.
      }));

      this.commands.push(new OperatorCommand("dat", "dat://...", async (p, option) => {
        let key = toKey(option);

        if (hasKey(r.home.portal, key)) {
          console.warn("[op:dat]", "Can't follow yourself.");
          return;
        }
    
        let index = r.home.portal.follows.findIndex(f => toKey(f.url) === key);
        if (index !== -1) {
          console.warn("[op:dat]", "Already following:", key);
          return;
        }

        r.home.portal.follows.push({ name: r.getName(key), url: "dat://"+key });
        // FIXME: Citizen: Update portal follows list.
        /*
        await r.db.portals.update(r.home.portal.recordURL, {
          follows: r.home.portal.follows
        });
        */
        r.home.feed.connectQueue.splice(0, 0, "dat://"+key);
        await r.home.feed.connectNext();

        r.render("followed");
      }));

      this.commands.push(new OperatorCommand("undat", "undat://...", async (p, option) => {
        let key = toKey(option);
    
        let index = r.home.portal.follows.findIndex(f => toKey(f.url) === key);
        if (index === -1) {
          console.warn("[op:undat]", "Not following:", key);
          return;
        }

        r.home.portal.follows.splice(index, 1);
        // FIXME: Citizen: Update portal follows list.
        /*
        await r.db.portals.update(r.home.portal.recordURL, {
          follows: r.home.portal.follows
        });
        */
    
        let portal = r.home.feed.getPortal(key, false);
        if (!portal)
          return;
        
        r.home.feed.portals.splice(r.home.feed.portals.indexOf(portal), 1);
        // Note: The archive can still appear in discovery.
        // FIXME: Citizen: Unindex.
        // await r.db.unindexArchive(portal.archive);

      r.render("unfollowed");
      }));

      this.commands.push(new OperatorCommand("pin", "::pin:id\n::pin:", async (p, option) => {
        // FIXME: Citizen: Edit.
        /*
        await r.db.portals.update(r.home.portal.recordURL, {
          pinned: option
        });
        */
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

      this.commands.push(new OperatorCommand("big", "::big:id\n::big:", async (p, option) => {
        let indexOfDepth = option ? option.indexOf("/") : -1;
        let depth = 0;
        if (indexOfDepth !== -1) {
          depth = parseInt(option.slice(indexOfDepth + 1));
          option = option.slice(0, indexOfDepth);
        }

        let entry = r.home.feed.entryMap[option];

        while (entry && --depth > 0)
          entry = entry.quote;

        if (!entry) {
          r.home.feed.bigpictureEntry = null;
          return;
        }

        r.home.feed.bigpictureEntry = entry;
      }));
    
      this.commands.push(new OperatorCommand("nightmode", "::nightmode", async (p, option) => {
        let html = document.body.parentElement;
        if (html.classList.contains("night"))
          html.classList.remove("night");
        else
          html.classList.add("night");
      }));

      this.commands.push(new OperatorCommand("eval", "/eval javascript", async (p, option) => {
        eval(p);
      }));
      
    }

    this.el = rd$`
      <div id="operator">
        <img id="icon" rdom-get="icon" src="media/content/icon.svg">

        <div id="wrapper" rdom-get="wrapper">
          <textarea rdom-get="input" id="commander" placeholder="Loading"></textarea>
          <t id="hint" rdom-get="hint"></t>
          <div id="rune" rdom-get="rune"></div>
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
    this.icon = this.wrapper = this.input = this.hint = this.rune = null;
    rdom.get(this.el, this);
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
      this.wrapper.classList.add("drag")
    } else {
      this.wrapper.classList.remove("drag")
    }
  }

  get autocompleteWords() {
    let words = this.input.value.split(" ");
    let last = words[words.length - 1];
    let match;

    if (match = (this.patternName.exec(last) || this.patternNameWhisper.exec(last))) {
      let name = match[1].toLowerCase();
      return r.home.feed.portals.filter(p => p.name.slice(0, name.length).toLowerCase() === name).map(p => p.name);
    }

    if (match = (this.patternNameCommand.exec(last))) {
      let name = match[1].toLowerCase();
      return this.commands.filter(c => c.name.slice(0, name.length).toLowerCase() === name).map(c => c.name);
    }

    return [];
  }

  getCommand(input) {
    return this.commands.find(cmd => cmd.name === input);
  }

  render() {
    if (r.home && r.home.portal && this.icon.src !== r.home.portal.icon)
      this.icon.src = r.home.portal.icon;

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

  send(text, data) {
    let media = "";
    // Rich media content.
    let indexOfMedia = text.lastIndexOf(">>");
    if (indexOfMedia > -1) {
      media = text.substring(indexOfMedia + 2).trim();
      text = text.substring(0, indexOfMedia).trim();
    }

    data = data || {};
    data.media = data.media || media;
    data.text = data.text || text;
    data.createdAt = data.createdAt || Date.now();
    data.target = data.target || [];
    data.mentions = data.mentions || [];

    // Handle mentions.
    let tmp;
    while ((tmp = this.patternMention.exec(text)) !== null) {
      let portals = this.lookupName(tmp[2]);
      if (portals.length <= 0)
        continue;
      if (data.target.indexOf(portals[0].url) <= -1) {
        data.target.push(portals[0].url);
      }
      if (data.mentions.findIndex(m => m.url === portals[0].url) <= -1) {
        data.mentions.push({ url: portals[0].url, name: portals[0].name });
      }
    }

    r.home.postEntry(data);
  }

  lookupName(name) {
    name = toOperatorArg(name);
    // We return an array since multiple people might be using the same name.
    return r.index.listProfiles().filter(p => toOperatorArg(p.name) === name);
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
      let nameMatchCommand = this.patternNameCommand.exec(last);
      if (nameMatch || nameMatchWhisper || nameMatchCommand) {
        let fill = this.autocompleteWords;
        if (fill.length > 0) {
          if (nameMatch)
            words[words.length - 1] = `@${fill[0]}`;
          else if (nameMatchWhisper)
            words[words.length - 1] = `${this.prefix}whisper:${toOperatorArg(fill[0])}`;
          else if (nameMatchCommand)
            words[words.length - 1] = `${this.prefix}${fill[0]}`;
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
        this.historyIndex = this.history.length;
        this.historyBuffer = this.input.value;
      }
      if (this.historyIndex > 0) {
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
    this.isDragging = false;
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
    // @ts-ignore
    reader.onload = e => done(e.target.result);
    reader.readAsArrayBuffer(file);
  }

}
