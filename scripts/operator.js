function Operator(el)
{
  this.el = document.createElement('div'); this.el.id = "operator";
  this.input_el = document.createElement('input'); this.input_el.id = "commander";
  this.input_el.setAttribute("placeholder","Input command here");
  this.hint_el = document.createElement('t'); this.hint_el.id = "hint";
  this.el.appendChild(this.input_el);
  this.el.appendChild(this.hint_el);
  this.name_pattern = new RegExp(/^@(\w+)/, "i");

  this.install = function(el)
  {
    el.appendChild(this.el);

    this.input_el.addEventListener('keydown',r.operator.key_down, false);
    this.input_el.addEventListener('input',r.operator.input_changed, false);
    this.input_el.addEventListener('dragover',r.operator.drag_over, false);
    this.input_el.addEventListener('dragleave',r.operator.drag_leave, false);
    this.input_el.addEventListener('drop',r.operator.drop, false);
    this.update();
  }

  this.update = function()
  {
    var words = this.input_el.value.trim().split(" ").length;
    var chars = this.input_el.value.trim().length;
    var key = this.input_el.value.split(" ")[this.input_el.value.split(" ").length-1];
    var autocomplete = key ? this.find_portal_with_key(key) : null;

    if((key.substr(0,1) == "@" || key.substr(0,1) == "~") && autocomplete && autocomplete != "@"+key && autocomplete != "~"+key){
      this.hint_el.innerHTML = this.find_portal_with_key(key);
    }
    else{
      this.hint_el.innerHTML = chars+"C "+words+"W";
    }
  }

  this.find_portal_with_key = function(key)
  {
    key = key.replace("@","").replace("@","").trim();
    for(name in r.feed.portals){
      if(name.substr(0,key.length) == key){
        return name;
      }
    }
  }

  this.validate = function()
  {
    var command = this.input_el.value.indexOf(" ") ? this.input_el.value.split(" ")[0] : this.input_el.value;
    var params  = this.input_el.value.indexOf(" ") ? this.input_el.value.split(' ').slice(1).join(' ') : null;

    var option = command.indexOf(":") > -1 ? command.split(":")[1] : null;
    command = command.indexOf(":") > -1 ? command.split(":")[0] : command;

    if(this.commands[command]){
      this.commands[command](params,option);
    }
    else{
      this.commands.say(this.input_el.value.trim());
    }
    this.input_el.value = "";
  }

  this.inject = function(text)
  {
    this.input_el.value = text;
    this.input_el.focus();
  }

  this.commands = {};

  // catches neauoire from @neauoire
  this.commands.say = function(p)
  {
    var message = p;
    var media = null;
    // Rich content
    if(message.indexOf(" >> ") > -1){
      media = message.split(" >> ")[1].split(" ")[0].trim();
      message = message.split(" >> ")[0].trim();
    }

    var data = {message:message,timestamp:Date.now()};
    if(media){
      data.media = media;
    }
    // if message starts with an @ symbol, then we're doing a mention
    if(message.indexOf("@") == 0){
      var name = message.split(" ")[0]
      // execute the regex & get the first matching group (i.e. no @, only the name)
      name = r.operator.name_pattern.exec(name)[1]
      if(r.feed.portals[name]){
        data.target = r.feed.portals[name].dat;
      }
    }
    r.portal.add_entry(new Entry(data));
  }

  this.commands.edit = function(p,option)
  {
    if(option == "name"){
      r.portal.data.name = p.substr(0,14);
    }
    else if(option == "desc"){
      r.portal.data.desc = p;
    }
    else if(option == "site"){
      r.portal.data.site = r.operator.validate_site(p);
    }
    else{
      r.portal.data.feed[option].message = p;
      r.portal.data.feed[option].editstamp = Date.now();
    }

    console.log(r.portal.data.site);

    r.portal.save();
    r.portal.update();
    r.feed.update();
  }

  this.commands.undat = function(p,option)
  {
    var path = "dat:"+option;

    // Remove
    if(r.portal.data.port.indexOf(path) > -1){
      r.portal.data.port.splice(r.portal.data.port.indexOf(path), 1);
    }
    else{
      console.log("could not find",path)
    }

    r.portal.save();
    r.portal.update();
    r.feed.update();
  }

  this.commands.dat = function(p,option)
  {
    var path = "dat:"+option;
    if(r.portal.data.dat == path){ return; }
    // resolve dns shortnames to their actual dat:// URIs
    DatArchive.resolveName(path).then(function(result) {
        path = "dat://" + result + "/";

        // Remove
        if(r.portal.data.port.indexOf(path) == -1){
          r.portal.data.port.push(path);
        }

        r.portal.save();
        r.portal.update();
        r.feed.update();
    }).catch(function(e) { console.error("Error when resolving added portal in operator.js", e) })
  }

    this.commands.fix_port = function() {
        var promises = r.portal.data.port.map(function(portal) {
            return new Promise(function(resolve, reject) {
                console.log("first promise")
                if(portal.slice(-1) !== "/") { portal += "/" }
                if(r.portal.data.dat == portal){ return; }
                // resolve dns shortnames to their actual dat:// URIs
                DatArchive.resolveName(portal).then(function(result) {
                    result = "dat://" + result + "/";
                    resolve(result);
                }).catch(function(e) { console.error("Error when resolving in fix_port:operator.js", e, portal); resolve(portal) })
            })
        })
        Promise.all(promises).then(function(fixed_ports) {
            r.portal.data.port = fixed_ports;
            r.portal.save();
        }).catch(function(e) {
            console.error("Error when fixing ports; probably offline or malformed json", e)
        })
    }

  this.commands.delete = function(p,option)
  {
    r.portal.data.feed.splice(option, 1)
    r.portal.save();
    r.feed.update();
  }

  this.commands.filter = function(p) {
    r.feed.filter = p;
    r.feed.update();
  }

  this.commands.clear_filter = function() {
    r.feed.filter = "";
    r.feed.update();
  }

  this.commands.mentions = function() {
    r.feed.filter = "@" + r.portal.data.name;
    r.feed.update();
  }

  this.key_down = function(e)
  {
    //console.log(e);

    if(e.key == "Enter"){
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
        for (var portal_name in r.feed.portals) {
          if (portal_name && portal_name.substr(0, name_match[1].length) === name_match[1]) {
            words[words.length - 1] = "@" + portal_name;
            r.operator.inject(words.join(" ")+" ");
            r.operator.update();
            return;
          }
        }
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
}


r.confirm("script","operator");
