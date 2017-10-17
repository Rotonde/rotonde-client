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
  }

  this.install_style = function(name)
  {
    var s = document.createElement('link');
    s.rel = 'stylesheet';
    s.type = 'text/css';
    s.href = this.client_url+"links/"+name+'.css';
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

  this.create_portal = function()
  {
    console.log("Create portal");
    return {name: "new_name",desc: "new_desc",port:[window.location.toString()],feed:[],site:"",dat:""};
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
  }

  this.reset = function()
  {
    this.portal.data = {name:"Newly Joined",desc:"Click on this text to edit your description.",site:"Anywhere",port:[],feed:[]};
    this.portal.save();
    console.log(this.portal.data)
  }
}
