function Rotonde(client_url)
{
  this.client_url = client_url;

  // SETUP

  this.requirements = {style:["reset","fonts","main"],script:["portal","feed","entry","operator"]};
  this.includes = {script:[]};

  this.install = function()
  {
    for(id in this.requirements.script){
      var name = this.requirements.script[id];
      this.install_script(name);
    }
    for(id in this.requirements.style){
      var name = this.requirements.style[id];
      this.install_style(name);
    }
    this.install_style("custom", true);
  }

  this.install_style = function(name, is_user_side)
  {
    var href = "links/"+name+'.css';
    if(!is_user_side) href = this.client_url+href;
    var s = document.createElement('link');
    s.rel = 'stylesheet';
    s.type = 'text/css';
    s.href = href;
    document.getElementsByTagName('head')[0].appendChild(s);
  }

  this.install_script = function(name)
  {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = this.client_url+"scripts/"+name+'.js';
    document.getElementsByTagName('head')[0].appendChild(s);
  }

  this.confirm = function(type,name)
  {
    console.log("Included:",type,name)
    this.includes[type].push(name);
    this.verify();
  }

  this.verify = function()
  {
    var remaining = [];

    console.log(this.requirements.script)

    for(id in this.requirements.script){
      var name = this.requirements.script[id];
      if(this.includes.script.indexOf(name) < 0){ remaining.push(name); }
    }

    if(remaining.length == 0){
      this.start();
    }
  }

  // START

  this.el = document.createElement('div');
  this.el.className = "rotonde";

  this.portal = null;
  this.feed = null;
  this.operator = null;

  this.start = function()
  {
    console.info("Start")
    document.body.appendChild(this.el);
    document.addEventListener('mousedown',r.mouse_down, false);

    this.operator = new Operator();
    this.operator.install(this.el);
    this.load_account();
  }

  this.load_account = async function()
  {
    var dat = window.location.toString();
    var archive = new DatArchive(dat);
    var info = await archive.getInfo();
    var portal_str;
    var portal_data;

    // Read or make file
    try {
      portal_str = await archive.readFile('/portal.json');
    } catch (err) {
      await archive.writeFile('/portal.json', JSON.stringify(r.create_portal(), null, 2));
      portal_data = r.create_portal();
    }

    try {
      portal_data = JSON.parse(portal_str);      
      // append slash to port entry so that .indexOf works correctly in other parts
      portal_data.port = portal_data.port.map(function(portal_entry) {
        if (portal_entry.slice(-1) !== "/") { portal_entry += "/";}
        return portal_entry
      })
    } catch (err) {
      console.error("Malformed JSON in portal.json")
    }

    portal_data.dat = dat;
    this.portal = new Portal(portal_data);
    this.portal.install(this.el);

    if(!info.isOwner){
      this.operator.el.style.display = "none";
    }
  }

  this.create_portal = async function(name = "new_name")
  {
    var archive = new DatArchive(window.location.toString())
    var portal_str = await r.portal.archive.readFile('/dat.json');
    var name = JSON.parse(portal_str).title.replace(/\W/g, '');
    return {name: name,desc: "new_desc",port:[],feed:[],site:"",dat:""}
  }

  this.load_feed = async function(feed)
  {
    this.feed = new Feed(feed);
    this.feed.install(this.el);
  }

  this.mouse_down = function(e)
  {
    if(!e.target.getAttribute("data-operation")){ return; }
    e.preventDefault();
    r.operator.inject(e.target.getAttribute("data-operation"));
    window.scrollTo(0, 0);
  }

  this.reset = function()
  {
    this.reset_with_name();
  }

  this.reset_with_name = async function()
  {
    var archive = new DatArchive(window.location.toString())
    var portal_str = await r.portal.archive.readFile('/dat.json');
    var name = JSON.parse(portal_str).title.replace(/\W/g, '');
    this.portal.data = {name: name,desc: "new_desc",port:[],feed:[],site:"",dat:""}
    this.portal.save();
  }
}
