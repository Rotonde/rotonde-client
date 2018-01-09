function Rotonde(client_url)
{
  this.client_url = client_url;
  this.client_version = "0.4.0-WebDB-b1";

  // SETUP

  this.requirements = {style:["reset","fonts","main"],dep:["required"],script:["util","rdom","home","portal","feed","entry","operator","oembed","status"]};
  this.includes = {dep:[],script:[]};
  this.is_owner = false;

  this.install = function()
  {
    // Install deps before scripts.
    for(id in this.requirements.dep){
      var name = this.requirements.dep[id];
      this.install_dep(name);
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

  this.install_dep = function(name)
  {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = this.client_url+"deps/"+name+'.js';
    document.getElementsByTagName('head')[0].appendChild(s);
  }

  this.install_script = function(name)
  {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = this.client_url+"scripts/"+name+'.js';
    document.getElementsByTagName('head')[0].appendChild(s);
  }

  this.install_db = function(db)
  {
    r.db = db;

    // The following table definitions are based on Fritter.
    db.define("portals",
    {
      filePattern: ["/portal.json", "/profile.json"],
      index: [":origin", "name"],
      validate(record)
      {
        // TODO: Set up profile.json validation.
        return true;
      },
      preprocess(record)
      {
        // Assuming no other dat social network than rotonde used client_version...
        record.rotonde_version = record.rotonde_version || record.client_version || r.client_version;

        record.bio = record.bio || record.desc || "";

        if (record.follows)
        {
          // Fritter format.
          record.followUrls = record.followUrls || record.follows.map(f => f.url);
        }
        else if (record.port || record.followUrls)
        {
          // Rotonde legacy format.
          record.followUrls = record.followUrls || record.port;

          // Names will be resolved on maintenance.
          
          record.follows = record.followUrls.map(url => {
            var hash = url;
            if (
              hash.length > 6 &&
              hash[0] == 'd' && hash[1] == 'a' && hash[2] == 't' && hash[3] == ':'
            )
              // We check if length > 6 but remove 4.
              // The other 2 will be removed below.
              hash = hash.substring(4);
            
            if (
              hash.length > 2 &&
              hash[0] == '/' && hash[1] == '/'
            )
              hash = hash.substring(2);
          
            var index = hash.indexOf("/");
            hash = index == -1 ? hash : hash.substring(0, index);
          
            hash = hash.toLowerCase().trim();

            if (hash.length > 16)
              hash = hash.substr(0,12)+".."+hash.substr(hash.length-3,2);

            return { name: "rotonde:"+hash, url: url };
          });
        }
        else
        {
          record.follows = [];
          record.followUrls = [];
        }

        record.avatar = record.avatar || "media/content/icon.svg";
        record.sameas = record.sameas || record.sameAs;
        record.pinned = record.pinned || record.pinned_entry;

      },
      serialize(record)
      {
        return {
          name: record.name,
          bio: record.bio,
          site: record.site,
          avatar: record.avatar,
          follows: record.follows,
          pinned: record.pinned,
          rotonde_version: record.rotonde_version,
          sameas: record.sameas,
          feed: record.feed // Preserve legacy feed.
        };
      }
    });

    db.define("feed",
    {
      filePattern: "/posts/*.json",
      index: ["timestamp", ":origin+timestamp", "threadRoot"],
      validate(record)
      {
        // TODO: Set up post .json validation.
        return true;
      },
      preprocess(record)
      {
        // Fritter -> rotonde
        record.message = record.message || record.text;
        record.timestamp = record.timestamp || record.createdAt;
        record.editstamp = record.editstamp || record.editedAt;
      },
      serialize(record)
      {
        // rotonde -> Fritter
        return {
          text: record.text || record.message,
          threadRoot: record.threadRoot,
          threadParent: record.threadParent,
          ref: record.ref,
          target: record.target,
          whisper: record.whisper,
          media: record.media
        };
      }
    });

    db.open();
  }

  this.confirm = function(type,name)
  {
    console.log("Included:",type,name)
    this.includes[type].push(name);
    if (type === "dep") {
      this.verify_deps();
    } else {
      this.verify();
    }
  }

  this.verify_deps = function()
  {
    var remaining = [];

    for(id in this.requirements.dep){
      var name = this.requirements.dep[id];
      if(this.includes.dep.indexOf(name) < 0){ remaining.push(name); }
    }

    if(remaining.length == 0){
      // Start installing scripts after installing all deps.
      for(id in this.requirements.script){
        var name = this.requirements.script[id];
        this.install_script(name);
      }
    }
  }

  this.verify = function()
  {
    var remaining = [];

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

  this.home = null;
  this.portal = null;
  this.operator = null;
  this.status = null;

  this.start = function()
  {
    console.info("Start")
    document.body.appendChild(this.el);
    document.addEventListener('mousedown',r.mouse_down, false);
    document.addEventListener('keydown',r.key_down, false);

    this.operator = new Operator();
    this.operator.install(this.el);
    this.status = new Status();
    this.status.install(this.el);

    this.home = new Home(); this.home.setup();
  }

  this.mouse_down = function(e)
  {
    if (e.button != 0) { return; } // We only care about the main mouse button.
    if(!e.target.getAttribute("data-operation")){ return; }
    e.preventDefault();

    r.operator.inject(e.target.getAttribute("data-operation"));
    if(!e.target.getAttribute("data-validate")){ return; }
    r.operator.validate();
  }

  this.key_down = function(e)
  {
    if (e.which === 27) { // ESC
      r.home.feed.bigpicture_hide();
    }
  }

  this.reset = function()
  {
    this.reset_with_name();
  }

  this.reset_with_name = async function()
  {
    // TODO: Reimplement reset_with_name
    r.home.feed.refresh("reset_with_name");
  }
}

// Make this accessible for jest
window.Rotonde = Rotonde;
