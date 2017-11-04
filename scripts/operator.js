function Operator(el)
{
  this.el = document.createElement('div'); this.el.id = "operator";
  this.input_wrapper = document.createElement('div'); this.input_wrapper.id = "wrapper"
  this.input_el = document.createElement('textarea'); this.input_el.id = "commander";
  this.input_el.setAttribute("placeholder","Connected as @neauoire");
  this.hint_el = document.createElement('t'); this.hint_el.id = "hint";
  this.options_el = document.createElement('div'); this.options_el.id = "options"
  this.rune_el = document.createElement('div'); this.rune_el.id = "rune"
  this.input_wrapper.appendChild(this.input_el);
  this.input_wrapper.appendChild(this.hint_el);
  this.input_wrapper.appendChild(this.rune_el)
  this.el.appendChild(this.input_wrapper)
  this.el.appendChild(this.options_el)

  this.name_pattern = new RegExp(/^@(\w+)/, "i");

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

    this.options_el.innerHTML = "<t data-operation='filter keyword'>filter</t> <t data-operation='whisper:user_name message'>whisper</t> <t data-operation='quote:user_name-id message'>quote</t> <t data-operation='message >> media.jpg'>media</t> <t class='right' data-operation='edit:id message'>edit</t> <t class='right' data-operation='delete:id'>delete</t>";

    this.update();
  }

  this.update = function()
  {
    this.grow_input_height(this.input_el);

    var input = this.input_el.value.trim();
    var words = input === "" ? 0 : input.split(" ").length;
    var chars = input.length;
    var key = this.input_el.value.split(" ")[this.input_el.value.split(" ").length-1];

    this.hint_el.innerHTML = chars+"C "+words+"W";
    this.rune_el.innerHTML = ">";
    this.rune_el.className = input.length > 0 ? "input" : "";

    var keywords = ["filter","whisper","quote","edit","delete"]

    if(keywords.indexOf(input.split(" ")[0]) > -1 || input.indexOf(":") > -1){
      this.rune_el.innerHTML = "$";
    }
    if(input.indexOf(">>") > -1){
      this.rune_el.innerHTML = "!";
    }
  }

  this.validate = function()
  {
    var command = this.input_el.value.indexOf(" ") ? this.input_el.value.split(" ")[0] : this.input_el.value;
    var params  = this.input_el.value.indexOf(" ") ? this.input_el.value.split(' ').slice(1).join(' ') : null;

    var option = command.indexOf(":") > -1 ? command.split(":")[1] : null;
    command = command.indexOf(":") > -1 ? command.split(":")[0] : command;

    this.cmd_history.push(this.input_el.value);
    this.cmd_index = -1;
    this.cmd_buffer = "";

    if(this.commands[command]){
      this.commands[command](params,option);
    }
    else{
      this.commands.say(this.input_el.value.trim());
    }
    this.input_el.value = "";
    setTimeout(r.home.feed.refresh, 250);
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
      media = encodeURIComponent(message.split(" >> ")[1].trim());
      message = message.split(" >> ")[0].trim();
    }

    var data = {media:"", message:"", timestamp:Date.now(), target:[]};
    if(media){
      data.media = media;
    }
    // handle mentions
    var finalmsg = message;
    var exp = /@(\w+)/g;
    var tmp;
    var counter = 0;
    while((tmp = exp.exec(message)) !== null){
      var name = tmp[1];
      finalmsg = finalmsg.replace(tmp[1], counter.toString());
      counter++;

      var portals = r.operator.lookup_name(tmp[1]);
      if(portals.length > 0){
        data.target.push(portals[0].url);
      }
    }
    data.message = finalmsg;

    r.home.add_entry(new Entry(data));
    setTimeout(r.home.feed.refresh, 250);
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
    r.home.update();
    setTimeout(r.home.feed.refresh, 250);
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

    r.home.save();
    r.home.update();
    setTimeout(r.home.feed.refresh, 250);
  }

  this.commands.dat = function(p,option)
  {
    option = option.replace("dat://","").replace(/\//g,"").trim();
    if(option.length != 64){ console.log("Invalid url: ",option); return; }

    for(id in r.home.portal.json.port){
      var port_url = r.home.portal.json.port[id];
      if(port_url.indexOf(option) > -1){
        return;
      }
    }
    r.home.portal.json.port.push("dat://"+option+"/");
    r.home.save();
    r.home.update();
    setTimeout(r.home.feed.refresh, 250);
  }

  this.commands.fix_port = function()
  {
    var promises = r.home.portal.json.port.map(function(portal) {
        return new Promise(function(resolve, reject) {
            console.log("first promise")
            if(portal.slice(-1) !== "/") { portal += "/" }
            if(r.home.portal.url == portal){ return; }
            // resolve dns shortnames to their actual dat:// URIs
            DatArchive.resolveName(portal).then(function(result) {
                result = "dat://" + result + "/";
                resolve(result);
            }).catch(function(e) { console.error("Error when resolving in fix_port:operator.js", e, portal); resolve(portal) })
        })
    })
    Promise.all(promises).then(function(fixed_ports) {
        r.home.portal.json.port = fixed_ports;
        r.home.save();
    }).catch(function(e) {
        console.error("Error when fixing ports; probably offline or malformed json", e)
    })
  }

  this.commands.delete = function(p,option)
  {
    r.home.portal.json.feed.splice(option, 1)
    r.home.save();
    setTimeout(r.home.feed.refresh, 250);
  }

  this.commands.filter = function(p,option)
  {
    window.location.hash = option;
    r.home.feed.filter = p;
    r.home.feed.target = option;
    setTimeout(r.home.feed.refresh, 250);
  }

  this.commands.clear_filter = function()
  {
    window.location.hash = "";
    r.home.feed.filter = "";
    r.home.feed.target = "";
    setTimeout(r.home.feed.refresh, 250);
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

    var media = null;
    // Rich content
    if(message.indexOf(" >> ") > -1){
      media = message.split(" >> ")[1].split(" ")[0].trim();
      message = message.split(" >> ")[0].trim();
    }

    var data = {message:message,timestamp:Date.now(),quote:quote,target:target,ref:ref};
    if(media){
      data.media = media;
    }
    r.home.add_entry(new Entry(data));

    r.home.save();
    r.home.update();
    setTimeout(r.home.feed.refresh, 250);
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

  this.commands.mentions = function()
  {
    r.home.feed.filter = "@" + r.home.portal.json.name;

    setTimeout(r.home.feed.refresh, 250);
  }

  this.key_down = function(e)
  {
    //console.log(e);

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
      // TODO: match regex starting at cursor position

      var words = r.operator.input_el.value.split(" ");
      var last = words[words.length - 1]
      var name_match = r.operator.name_pattern.exec(last);
      if(name_match) {
        var autocomplete = [];
        var name = name_match[1];
        for(i in r.home.feed.portals){
          var portal = r.home.feed.portals[i];
          if(portal.json.name && portal.json.name.substr(0, name.length) == name){
            autocomplete.push(portal.json.name);
          }
        }
        if (autocomplete.length > 0) {
          words[words.length - 1] = "@" + autocomplete[0];
          r.operator.inject(words.join(" ")+" ");
          r.operator.update();
          return;
        }
      }
    }

    if(e.key == "ArrowUp"){
      e.preventDefault();
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
      e.preventDefault();
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
    if(s)
    {
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
