function Operator(el)
{
  this.el = document.createElement('div'); this.el.id = "operator";
  this.input_wrapper = document.createElement('div'); this.input_wrapper.id = "wrapper"
  this.input_el = document.createElement('textarea'); this.input_el.id = "commander";
  this.input_el.setAttribute("placeholder","Connected as @neauoire");
  this.hint_el = document.createElement('t'); this.hint_el.id = "hint";
  this.options_el = document.createElement('div'); this.options_el.id = "options"
  this.rune_el = document.createElement('div'); this.rune_el.id = "rune"
  this.icon_el = document.createElement('img'); this.icon_el.id = "icon" ; this.icon_el.src = "media/content/icon.svg"; this.icon_el.setAttribute("data-operation","clear_filter"); this.icon_el.setAttribute("data-validate","true");
  this.input_wrapper.appendChild(this.input_el);
  this.input_wrapper.appendChild(this.hint_el);
  this.input_wrapper.appendChild(this.rune_el)
  this.el.appendChild(this.icon_el)
  this.el.appendChild(this.input_wrapper)
  this.el.appendChild(this.options_el)

  this.name_pattern = new RegExp(/^@(\w+)/, "i");
  this.keywords = ["filter","whisper","quote","edit","delete","page","++","--","help"];

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

  this.validate = function()
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

    this.commands[command](params,option);

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

  this.commands = {};

  this.commands.say = function(p)
  {
    var message = p.trim();
    var media = null;

    if(message == ""){ return; }
    // Rich content
    if(message.indexOf(" >> ") > -1){
      // encode the file names to allow for odd characters, like spaces
      // Encoding the URI needs to happen here.
      // We can't encode it in entry.rmc as that'd break previously encoded URIs.
      media = encodeURIComponent(message.split(" >> ")[1].trim());
      message = message.split(" >> ")[0].trim();
    }

    var data = {media:"", message:message, timestamp:Date.now(), target:[]};
    if(media){
      data.media = media;
    }
    // handle mentions
    var exp = /([@~])(\w+)/g;
    var tmp;
    while((tmp = exp.exec(message)) !== null){
      var portals = r.operator.lookup_name(tmp[2]);
      if(portals.length > 0){
        data.target.push(portals[0].url);
      }else{
        data.target.push("");
      }
    }

    r.home.add_entry(new Entry(data));
  }

  this.commands.edit = function(p,option)
  {
    if(option == "name"){
      r.home.portal.json.name = p.substr(0,14);
    }
    else if(option == "desc"){
      r.home.portal.json.desc = p;
    }
    else if(option == "site"){
      r.home.portal.json.site = r.operator.validate_site(p);
    }
    else{
      r.home.portal.json.feed[option].message = p;
      r.home.portal.json.feed[option].editstamp = Date.now();
    }

    r.home.save();
  }

  this.commands.undat = function(p,option)
  {
    var path = "dat:"+option;
    if(path.slice(-1) !== "/") { path += "/" }

    // Remove
    if(r.home.portal.json.port.indexOf(path) > -1){
      r.home.portal.json.port.splice(r.home.portal.json.port.indexOf(path), 1);
    }
    else if(r.home.portal.json.port.indexOf(path+"/") > -1){
      r.home.portal.json.port.splice(r.home.portal.json.port.indexOf(path+"/"), 1);
    }
    else{
      console.log("could not find",path)
    }

    var portal = r.home.feed.get_portal(path);
    if (portal) {
      r.home.feed.portals.splice(portal.id, 1)[0];
      for (var id in r.home.feed.portals) {
        r.home.feed.portals[id].id = id;
      }
      portal.badge_remove();
      portal.entries_remove();
    }

    r.home.save();
    r.home.feed.refresh("unfollowing: "+option);
  }

  this.commands.dat = function(p,option)
  {
    option = to_hash(option);

    for(id in r.home.portal.json.port){
      var port_url = r.home.portal.json.port[id];
      if(port_url.indexOf(option) > -1){
        return;
      }
    }
    r.home.portal.json.port.push("dat://"+option+"/");
    r.home.feed.queue.push("dat://"+option+"/");
    r.home.feed.next();
    r.home.save();
  }

  this.commands.delete = function(p,option)
  {
    r.home.portal.json.feed.splice(option, 1)
    r.home.save();
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

  this.commands.quote = function(p,option)
  {
    var message = p;
    var name = option.split("-")[0];
    var ref = parseInt(option.split("-")[1]);

    var portals = r.operator.lookup_name(name);

    if(portals.length === 0 || !portals[0].json.feed[ref]){
      return;
    }

    var quote = portals[0].json.feed[ref];
    var target = portals[0].url;

    var media = portals[0].json.feed[ref].media;

    var data = {message:message,timestamp:Date.now(),quote:quote,target:target,ref:ref,media:media};

    r.home.add_entry(new Entry(data));

    r.home.save();
  }

  this.commands.whisper = function(p,option)
  {
    var name = option;
    var portal = r.operator.lookup_name(name);
    var target = portal[0].url;

    var message = p;
    var media = null;

    // Rich content
    if(message.indexOf(" >> ") > -1){
      media = message.split(" >> ")[1].split(" ")[0].trim();
      message = message.split(" >> ")[0].trim();
    }

    var data = {message:message,timestamp:Date.now(),media:media,target:target,whisper:true};
    if(media){
      data.media = media;
    }

    r.home.add_entry(new Entry(data));
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

  this.commands.portals_refresh = function(p, option) {
    for (var id in r.home.portal.json.port) {
      var url = r.home.portal.json.port[id];
      var loaded = false;
      for (var id_loaded in r.home.feed.portals) {
        var portal = r.home.feed.portals[id_loaded];
        if (!has_hash(portal, url))
          continue;
        loaded = true;
        portal.refresh();
        break;
      }
      if (!loaded) {
        r.home.feed.queue.push(url);
      }
    }
    if (r.home.feed.queue.length > 0)
      r.home.feed.next();
  }

  this.commands.discovery_refresh = function(p, option) {
    r.home.discover();
  }

  this.commands.expand = function(p, option)
  {
    var name = option.split("-")[0];
    var ref = parseInt(option.split("-")[1]);

    var portals = r.operator.lookup_name(name);

    if(portals.length === 0 || !portals[0].json.feed[ref]){
      return;
    }

    if(portals[0].expanded.indexOf(ref) < 0){ portals[0].expanded.push(ref+""); }
  }

  this.commands.collapse = function(p, option)
  {
    var name = option.split("-")[0];
    var ref = parseInt(option.split("-")[1]);

    var portals = r.operator.lookup_name(name);

    if(portals.length === 0 || !portals[0].json.feed[ref]){
      return;
    }

    var index = portals[0].expanded.indexOf(ref+"");
    if(index > -1){ portals[0].expanded.splice(index, 1); }
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

    if(!name_match){ return []; }
    var a = [];
    var name = name_match[1];
    for(i in r.home.feed.portals){
      var portal = r.home.feed.portals[i];
      if(portal.json.name && portal.json.name.substr(0, name.length) == name){
        a.push(portal.json.name);
      }
    }
    return a
  }

  this.key_down = function(e)
  {
    if(e.key == "Enter" && !e.shiftKey){
      e.preventDefault();
      r.operator.validate();
    }

    if((e.key == "Backspace" || e.key == "Delete") && (e.ctrlKey || e.metaKey) && e.shiftKey){
      e.preventDefault();
      r.reset();
      return;
    }

    if(e.key == "Tab"){
      e.preventDefault();
      var words = r.operator.input_el.value.split(" ");
      var last = words[words.length - 1]
      var name_match = r.operator.name_pattern.exec(last);
      if(name_match) {
        var autocomplete = r.operator.autocomplete_words();
        if (autocomplete.length > 0) {
          words[words.length - 1] = "@" + autocomplete[0];
          r.operator.inject(words.join(" ")+" ");
          r.operator.update();
          return;
        }
      }
    }

    if(e.key == "ArrowUp"){
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
    if(e.key == "ArrowDown"){
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

      if (type === 'image/jpeg' || type === 'image/png' || type === 'image/gif') {
        var reader = new FileReader();
        reader.onload = async function (e) {
          var result = e.target.result;

          var archive = new DatArchive(window.location.toString());
          await archive.writeFile('/media/content/' + file.name, result);
          await archive.commit();

          var commanderText = 'text_goes_here >> ' + file.name
          // if there's  already a message written, append ">> file.name" to it
          if (r.operator.input_el.value) {
              commanderText = r.operator.input_el.value.trim() + " >> " + file.name;
          }
          r.operator.inject(commanderText);
        }
        reader.readAsArrayBuffer(file);
      }
    }
    r.operator.drag(false);
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
    el.style.height = (parseInt(el.value.length / 40) * 20) + "px";
  }

  this.lookup_name = function(name)
  {
    // We return an array since multiple people might be using the same name.
    var results = [];
    for(var url in r.home.feed.portals){
      var portal = r.home.feed.portals[url];
      if(portal.json.name === name){ results.push(portal); }
    }
    return results;
  }
}

r.confirm("script","operator");
