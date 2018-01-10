function Operator(el)
{
  this.el = document.createElement('div'); this.el.id = "operator";
  this.input_wrapper = document.createElement('div'); this.input_wrapper.id = "wrapper"
  this.input_el = document.createElement('textarea'); this.input_el.id = "commander";
  this.input_el.setAttribute("placeholder","Connected as @neauoire");
  this.hint_el = document.createElement('t'); this.hint_el.id = "hint";
  this.options_el = document.createElement('div'); this.options_el.id = "options"
  this.rune_el = document.createElement('div'); this.rune_el.id = "rune"
  this.icon_el = document.createElement('img'); this.icon_el.id = "icon" ; this.icon_el.src = "media/content/icon.svg"; 

  this.input_wrapper.appendChild(this.input_el);
  this.input_wrapper.appendChild(this.hint_el);
  this.input_wrapper.appendChild(this.rune_el)
  this.el.appendChild(this.icon_el)
  this.el.appendChild(this.input_wrapper)
  this.el.appendChild(this.options_el)

  this.name_pattern = new RegExp(/^@(\w+)/, "i");
  this.name_pattern_whisper = new RegExp(/^whisper:(\w+)/, "i");
  this.keywords = ["filter","whisper","quote","edit","delete","pin","page","++","--","help"];

  this.cmd_history = [];
  this.cmd_index = -1;
  this.cmd_buffer = "";

  this.install = function(el)
  {
    el.appendChild(this.el);

    this.input_el.addEventListener('keydown',r.operator.key_down, false);
    this.input_el.addEventListener('input',r.operator.input_changed, false);
    this.input_el.addEventListener('dragover',r.operator.drag_over, false);
    this.input_el.addEventListener('dragleave',r.operator.drag_leave, false);
    this.input_el.addEventListener('drop',r.operator.drop, false);
    this.input_el.addEventListener('paste',r.operator.paste, false);

    this.options_el.innerHTML = "<t data-operation='page:1'>page</t> <t data-operation='filter keyword'>filter</t> <t data-operation='whisper:user_name message'>whisper</t> <t data-operation='quote:user_name-id message'>quote</t> <t data-operation='message >> media.jpg'>media</t> <t class='right' data-operation='edit:id message'>edit</t> <t class='right' data-operation='delete:id'>delete</t>";

    this.update();
  }

  this.update = function()
  {
    this.grow_input_height(this.input_el);

    var input = this.input_el.value.trim();
    var words = input === "" ? 0 : input.split(" ").length;
    var chars = input.length;
    var key = this.input_el.value.split(" ")[this.input_el.value.split(" ").length-1];

    this.hint_el.innerHTML = this.autocomplete_words().length > 0 ? this.autocomplete_words()[0] : chars+"C "+words+"W";
    this.hint_el.className = this.autocomplete_words().length > 0 ? "autocomplete" : "";

    this.rune_el.innerHTML = "";
    this.rune_el.className = "rune rune-operator";
    if(this.keywords.indexOf(input.split(" ")[0]) > -1 || input.indexOf(":") > -1){
      this.rune_el.className += " rune-operator-command";
    } else if(input.indexOf(">>") > -1){
      this.rune_el.className += " rune-operator-media";
    } else {
      this.rune_el.className += " rune-operator-message";
    }

    this.rune_el.className += input.length > 0 ? " input" : "";
  }

  this.update_owner = function(is_owner)
  {
    document.body.className = is_owner == false ? "guest" : "owner";
  }

  this.validate = async function()
  {
    var command = this.input_el.value.indexOf(" ") ? this.input_el.value.split(" ")[0] : this.input_el.value;
    var params  = this.input_el.value.indexOf(" ") ? this.input_el.value.split(' ').slice(1).join(' ') : null;

    var option = command.indexOf(":") > -1 ? command.split(":")[1] : null;
    command = command.indexOf(":") > -1 ? command.split(":")[0] : command;

    if(!this.commands[command]){
      command = "say";
      params = this.input_el.value.trim();
    }

    this.cmd_history.push(this.input_el.value);
    this.cmd_index = -1;
    this.cmd_buffer = "";

    var result = this.commands[command](params,option);
    if (result && result.then)
      result = await result;

    this.input_el.value = "";
    r.home.update();
    r.home.feed.refresh(command+" validated");
  }

  this.inject = function(text)
  {
    this.input_el.value = text;
    this.input_el.focus();
    this.update();
  }

  this.send = function(message, data)
  {
    var media = "";
    // Rich content
    var indexOfMedia = message.lastIndexOf(">>");
    if(indexOfMedia > -1){
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
    var exp = /([@~])(\w+)/g;
    var tmp;
    while((tmp = exp.exec(message)) !== null){
      var portals = r.operator.lookup_name(tmp[2]);
      if (portals.length > 0 && data.target.indexOf(portals[0].url) <= -1) {
        data.target.push(portals[0].url);
      }
    }

    r.home.add_entry(new Entry(data));
  }

  this.commands = {};

  this.commands.say = function(p)
  {
    var message = p.trim();

    if(!message){ return; }

    r.operator.send(message);
  }

  this.commands.edit = async function(p,option)
  {
    var record_url = r.home.portal.record_url;
    if(option == "name"){
      await r.db.portals.update(record_url, {
        name: p.substr(0, 14)
      });
    }
    else if(option == "desc"){
      await r.db.portals.update(record_url, {
        desc: p
      });
    }
    else if(option == "site"){
      await r.db.portals.update(record_url, {
        site: r.operator.validate_site(p)
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
      await r.db.portals.update(record_url, {
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

    if (!r.home.portal.sameas)
      r.home.portal.sameas = [];

    if (has_hash(r.home.portal.sameas, remote))
      return;

    // create the array if it doesn't exist
    if (!r.home.portal.sameas) { r.home.portal.sameas = [] }
    r.home.portal.sameas.push(remote);
    try {
      var remote_portal = new Portal(remote)
      remote_portal.start().then(r.home.portal.load_remotes)
    } catch (err) {
      console.error("Error when connecting to remote", err)
    }
    
    await r.db.portals.update(r.home.portal.record_url, {
      sameas: r.home.portal.sameas
    });
  }

  this.commands.unmirror = async function(p,option)
  {
    var remote = p;
    if(remote.slice(-1) !== "/") { remote += "/" }

    if (!r.home.portal.sameas)
      r.home.portal.sameas = [];

    // Remove
    if (r.home.portal.sameas.indexOf(remote) > -1) {
      r.home.portal.sameas.splice(r.home.portal.sameas.indexOf(remote), 1);
    } else {
      console.log("could not find",remote);
      return;
    }

    var portal = r.home.feed.get_portal(remote);
    if (portal && portal.is_remote) {
      r.home.feed.portals.splice(portal.id, 1)[0];
      for (var id in r.home.feed.portals) {
        r.home.feed.portals[id].id = id;
      }
    }

    await r.db.portals.update(r.home.portal.record_url, {
      sameas: r.home.portal.sameas
    });
  }

  this.commands.dat = async function(p,option)
  {
    option = to_hash(option);

    for(id in r.home.portal.follows){
      var port_url = r.home.portal.follows[id].url;
      if(port_url.indexOf(option) > -1){
        return;
      }
    }
    r.home.portal.follows.push({ name: "rotonde-"+name_from_hash(option), url: "dat://"+option+"/" });
    await r.db.portals.update(r.home.portal.record_url, {
      follows: r.home.portal.follows
    });
    r.home.feed.queue.push("dat://"+option+"/");
    r.home.feed.connect();
  }

  this.commands.undat = async function(p,option)
  {
    var hash = to_hash(option);

    // Remove
    var index = r.home.portal.follows.findIndex(f => to_hash(f.url) == hash);
    if(index == -1){
      console.log("could not find",hash);
      return;
    }
    r.home.portal.follows.splice(index, 1);
    await r.db.portals.update(r.home.portal.record_url, {
      follows: r.home.portal.follows
    });

    var portal = r.home.feed.get_portal(hash);
    if (portal) {
      r.home.feed.portals.splice(portal.id, 1)[0];
      for (var id in r.home.feed.portals) {
        r.home.feed.portals[id].id = id;
      }
    }
  }

  this.commands.delete = async function(p,option)
  {
    await r.db.feed.delete(r.home.portal.archive.url + "/posts/" + option + ".json");
    // Delete entry from cache.
    if (r.home.portal._.entries) {
      for (var i in r.home.portal._.entries) {
        if (r.home.portal._.entries[i].id != option)
          continue;
        r.home.portal._.entries.splice(i, 1);
        break;
      }
    }
  }

  this.commands.filter = function(p,option)
  {
    var target = option || "";
    window.location.hash = target;
    r.home.feed.target = target;
    r.home.feed.el.className = target;
    r.home.feed.filter = p || "";
  }

  this.commands.clear_filter = function()
  {
    r.operator.commands.filter();
  }

  this.commands.quote = async function(p,option)
  {
    var message = p.trim();
    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var quote = await portals[0].entry(ref);
    if (!quote) return;

    var target = portals[0].url;
    if (target === r.client_url) {
      target = "$rotonde";
    }
    
    var targets = [target];
    if (target === r.home.portal.url && quote.target[0]) {
      // We can quote ourselves, but still target the previous author.
      if (quote.target[0] === r.home.portal.url && quote.target.length > 1) {
        // We're quoting ourself quoting ourself quoting someone...
        if (!has_hash(targets, quote.target[1])) targets.push(quote.target[1]);
      } else {
        if (!has_hash(targets, quote.target[0])) targets.push(quote.target[0]);        
      }
    }
    r.operator.send(message, {
      quote: quote,
      target: targets,
      ref: ref,
      media: quote.media,
      whisper: quote.whisper
    });
  }

  this.commands.pin = async function(p,option)
  {
    await r.db.portals.update(r.home.portal.record_url, {
      pinned: option
    });
  }

  this.commands.whisper = function(p,option)
  {
    var name = option;
    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) {
      return;
    }

    var target = portals[0].url;
    if (target === r.client_url) {
      target = "$rotonde";
    }
    r.operator.send(p.trim(), {
      target: [target],
      whisper: true
    });
  }

  this.commands['++'] = function(p, option) {
    r.operator.commands.page('++');
  }
  this.commands['--'] = function(p, option) {
    r.operator.commands.page('--');
  }
  this.commands.page = function(p, option) {
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
    r.home.feed.page_jump(page, false); // refresh = false, as we refresh again on command validation
  }

  this.commands.help = function(p, option) {
      if (p === '' || p == null)
        p = option;

      var life = 1500;
      if (p === '' || p === null) {
          r.home.log(r.operator.keywords.join(' '), life);
      } else {
          var command = p.split(' ')[0];
          if (command == "filter") {
              r.home.log('filter:keyword', life);
          }
          else if (command == "whisper") {
              r.home.log('whisper:user_name message', life);
          }
          else if (command == "quote") {
              r.home.log('quote:user_name-id message', life);
          }
          else if (command == "pin") {
              r.home.log('pin:id', life);
          }
          else if (command == "media") {
              r.home.log('message >> media.jpg', life);
          }
          else if (command == "edit") {
              r.home.log('edit:id message', life);
          }
          else if (command == "delete") {
              r.home.log('delete:id', life);
          }
          else if (command == "page") {
              r.home.log('page:page_number', life);
          }
          else if (command == "help") {
              r.home.log('help:command', life);
          } else {
              throw new Error('Invalid parameter given for help command!');
          }
      }
  }

  this.commands.network_refresh = function(p, option) {
    r.home.discover();
  }

  this.commands.discovery = function(p, option) {
    r.home.discover();
    r.operator.commands.filter("", "discovery");
  }

  this.commands.enable_discovery = function(p, option) {
    localStorage.setItem("discovery_enabled", true);
    r.home.discovery_enabled = true;
    r.home.discover();
    r.operator.commands.filter("", "discovery");
  }

  this.commands.disable_discovery = function(p, option) {
    localStorage.setItem("discovery_enabled", false);
    r.home.discovery_enabled = false;
  }

  this.commands.expand = async function(p, option)
  {
    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entry(ref);
    if (!entry) return;

    entry.expanded = true;
  }

  this.commands.collapse = async function(p, option)
  {
    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entry(ref);
    if (!entry) return;

    entry.expanded = false;
  }

  this.commands.embed_expand = async function(p, option)
  {
    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entry(ref);
    if (!entry) return;

    entry.embed_expanded = true;
  }

  this.commands.embed_collapse = async function(p, option)
  {
    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entry(ref);
    if (!entry) return;

    entry.embed_expanded = false;
  }

  this.commands.big = async function(p, option)
  {
    if (!p && !option) {
      r.home.feed.bigpicture_hide();
      return;
    }

    var {name, ref} = r.operator.split_nameref(option);

    var portals = r.operator.lookup_name(name);
    if (portals.length === 0) return;

    var entry = await portals[0].entry(ref);
    if (!entry) return;

    entry.big();
  }

  this.commands.night_mode = function(p, option)
  {
    var html = document.getElementsByTagName("html")[0];
    if(html.className.indexOf("night") > -1){
      html.className = html.className.replace("night", "").trim();
    }
    else{
      html.className += " night";
    }
  }

  this.autocomplete_words = function()
  {
    var words = r.operator.input_el.value.split(" ");
    var last = words[words.length - 1]
    var name_match = r.operator.name_pattern.exec(last);
    var name_match_whisper = r.operator.name_pattern_whisper.exec(last);

    if(!name_match && !name_match_whisper){ return []; }
    var a = [];
    var name = name_match ? name_match[1] : name_match_whisper[1];
    for(i in r.home.feed.portals){
      var portal = r.home.feed.portals[i];
      if(portal.name && portal.name.substr(0, name.length) == name){
        a.push(portal.name);
      }
    }
    return a
  }

  this.key_down = function(e)
  {
    if(e.key == "Enter" && !e.shiftKey){
      e.preventDefault();
      r.operator.validate().then(() => r.operator.update());
      return;
    }

    if(e.key == "Tab"){
      e.preventDefault();
      var words = r.operator.input_el.value.split(" ");
      var last = words[words.length - 1]
      var name_match = r.operator.name_pattern.exec(last);
      var name_match_whisper = r.operator.name_pattern_whisper.exec(last);
      if(name_match || name_match_whisper) {
        var autocomplete = r.operator.autocomplete_words();
        if (autocomplete.length > 0) {
          words[words.length - 1] = name_match ? ("@" + autocomplete[0]) : ("whisper:" + autocomplete[0]);
          r.operator.inject(words.join(" ")+" ");
          r.operator.update();
          return;
        }
      }
    }

    if(e.key == "ArrowUp" && r.operator.input_el.selectionStart == 0){
      if(r.operator.cmd_history.length > 0){
        e.preventDefault();
      }
      if(r.operator.cmd_index == -1){
        r.operator.cmd_index = r.operator.cmd_history.length-1;
        r.operator.cmd_buffer = r.operator.input_el.value;
      }
      else if(r.operator.cmd_index > 0){
        r.operator.cmd_index -= 1;
      }
      if(r.operator.cmd_history.length > 0){
        r.operator.inject(r.operator.cmd_history[r.operator.cmd_index]);
      }
    }
    if(e.key == "ArrowDown" && r.operator.input_el.selectionStart == r.operator.input_el.value.length){
      if(r.operator.cmd_history.length > 0){
        e.preventDefault();
      }
      if(r.operator.cmd_index == r.operator.cmd_history.length-1 && r.operator.cmd_history.length > 0){
        r.operator.inject(r.operator.cmd_buffer);
        r.operator.cmd_index = -1;
        return;
      }
      else if(r.operator.cmd_index == -1){
        return;
      }
      else if(r.operator.cmd_index < r.operator.cmd_history.length-1){
        r.operator.cmd_index += 1;
      }

      if(r.operator.cmd_history.length > 0){
        r.operator.inject(r.operator.cmd_history[r.operator.cmd_index]);
      }
    }

    r.operator.update();
  }

  this.input_changed = function(e)
  {
    r.operator.update();
  }

  this.drag = function(bool)
  {
    if (bool) {
      this.input_el.classList.add('drag')
    } else {
      this.input_el.classList.remove('drag')
    }
  }

  this.drag_over = function(e)
  {
    e.preventDefault();
    r.operator.drag(true);
  }

  this.drag_leave = function(e)
  {
    e.preventDefault();
    r.operator.drag(false);
  }

  this.drop = function(e)
  {
    e.preventDefault();
    var files = e.dataTransfer.files;
    if (files.length === 1) {
      var file = files[0];
      var type = file.type;

      if (type.startsWith("image/")) {
        r.operator.media_drop(file, file.name);
      }
    }
    r.operator.drag(false);
  }

  this.paste = function(e)
  {
    var items = e.clipboardData.items;
    for (var id in items) {
      var item = items[id];
      var type = item.type;
      if (!type)
        continue;

      if (type.startsWith("image/")) {
        var indexOfPlus = type.indexOf("+");
        if (indexOfPlus < 0)
          indexOfPlus = type.length;
        r.operator.media_drop(item.getAsFile(), "clipboard-" + Date.now() + "." + type.substring(6, indexOfPlus));
        break;
      }

      // Special case: dotgrid (or other compatible app) SVG
      if (type == "text/svg+xml") {
        var indexOfPlus = type.indexOf("+");
        if (indexOfPlus < 0)
          indexOfPlus = type.length;
        r.operator.media_drop(e.clipboardData.getData(type), "clipboard-" + Date.now() + "." + type.substring(5, indexOfPlus));
        break;
      }
    }
  }

  this.media_drop = function(file, name)
  {
    var done = async function (result) {
      var archive = new DatArchive(window.location.toString());
      await archive.writeFile('/media/content/' + name, result);
      await archive.commit();

      var commanderText = 'text_goes_here >> ' + name
      // if there's  already a message written, append ">> name" to it
      if (r.operator.input_el.value) {
          commanderText = r.operator.input_el.value.trim() + " >> " + name;
      }
      r.operator.inject(commanderText);
    };

    if (!file)
      return;

    if (typeof(file) === "string") {
      done(file);
      return;
    }

    name = name || file.name;
    var reader = new FileReader();
    reader.onload = function (e) { done(e.target.result); };
    reader.readAsArrayBuffer(file);
  }

  this.validate_site = function(s)
  {
    if(s){
        //strip trailing slash
      s = s.replace(/\/$/, '');
        //does it have no http/https/dat? default to http
      var has_valid_protocol = s.match(/(^(?:https?:)|(^dat:)){1}/gi);
      if(!has_valid_protocol) s = "http://"+s;
    }
    return s;
  }

  this.grow_input_height = function(el)
  {
    el.style.height = (parseInt(el.value.length / 40) * 20) + (el.value.indexOf("\n") > -1 ? el.value.split("\n").length * 20 : 0) + "px";
  }

  this.lookup_name = function(name)
  {
    // We return an array since multiple people might be using the same name.
    var results = [];
    for(var url in r.home.feed.portals){
      var portal = r.home.feed.portals[url];
      if(portal.name === name){ results.push(portal); }
    }
    if (results.length === 0) {
      // If no results found at all, try searching discovered portals.
      for(var url in r.home.discovered){
        var portal = r.home.discovered[url];
        if(portal.name === name){ results.push(portal); }
      }
    }
    return results;
  }

  this.split_nameref = function(option)
  {
    var index = option.lastIndexOf("-");
    if (index < 0) return;
    return { name: option.substring(0, index), ref: option.substring(index + 1) };
  }
}

r.confirm("script","operator");
