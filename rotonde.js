function Rotonde(client_url)
{
  this.client_url = client_url;
  this.client_version = "0.4.2";

  // SETUP

  this.requirements = {style:["reset","fonts","main"],dep:["rotondb","jlz-mini"],script:["util","rdom","home","portal","feed","entry","operator","embed","status"]};
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

  this.install_db = async function(db)
  {
    r.db = db;

    // The portals and feed definitions are based on Fritter.
    db.define("portals",
    {
      filePattern: ["/portal.json", "/profile.json"],
      index: [":origin", "name"],
      validate(record)
      {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return false;
        }

        if (record["@schema"]) {
          // JSON-LZ

          if (jlz.detectSupport(record, [
            // Profile "features" (vocabs) we support
            "fritter-profile",
            "rotonde-profile-version",
            "rotonde-profile-site",
            "rotonde-profile-pinned",
            "rotonde-profile-sameas",
            "rotonde-profile-discoverable",
            "rotonde-profile-legacy",
          ]).incompatible)
            return false;

        }

        // TODO: Set up profile.json validation.
        // This will become more important in the future.
        return true;
      },
      preprocess(record)
      {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return;
        }
        
        if (record["@schema"]) {
          // JSON-LZ

          // rotonde-profile-* natively supported.

          return;
        }

        // Legacy / unknown data.

        // Assuming no other dat social network than rotonde used client_version...
        record.rotonde_version = record.rotonde_version || record.client_version;

        record.bio = record.bio || record.desc || "";

        if (record.follows)
        {
          record.followUrls = record.followUrls || record.follows.map(f => f.url); // Fritter format.
        }
        else if (record.port || record.followUrls)
        {
          record.followUrls = record.followUrls || record.port; // Rotonde legacy format.

          record.follows = record.followUrls.map(url => { // Names will be resolved on maintenance.
            var hash = url;
            if (
              hash.length > 6 &&
              hash[0] == 'd' && hash[1] == 'a' && hash[2] == 't' && hash[3] == ':'
            )
              hash = hash.substring(4); // We check if length > 6 but remove 4. The other 2 will be removed below.
            
            if (
              hash.length > 2 &&
              hash[0] == '/' && hash[1] == '/'
            )
              hash = hash.substring(2);
          
            var index = hash.indexOf("/");
            hash = index == -1 ? hash : hash.substring(0, index);
          
            hash = hash.toLowerCase().trim();

            if (hash.length > 16)
              hash = hash.substr(0,12)+".."+hash.substr(hash.length-3,3);

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

        // This previously was in home.save
        if (record.follows) {
          var portals_updated = {};
          for (var id in r.home.feed.portals){
            var portal = r.home.feed.portals[id];
            portals_updated[to_hash(portal.archive ? portal.archive.url : portal.url)] = portal.last_timestamp;
          }
          record.follows = record.follows.sort((a, b) => {
            a = portals_updated[to_hash(a.url)] || 0;
            b = portals_updated[to_hash(b.url)] || 0;
            return b - a;
          });
        }

        return {
          "@schema": [
            "rotonde-profile-fritter",
            {
              "name": "rotonde-profile-version",
              "attrs": ["rotonde_version"],
              "required": false
            },
            {
              "name": "rotonde-profile-site",
              "attrs": ["site"],
              "required": false
            },
            {
              "name": "rotonde-profile-pinned",
              "attrs": ["pinned"],
              "required": false
            },
            {
              "name": "rotonde-profile-sameas",
              "attrs": ["sameas"],
              "required": false
            },
            {
              "name": "rotonde-profile-discoverable",
              "attrs": ["discoverable"],
              "required": false
            },
            {
              "name": "rotonde-profile-legacy",
              "attrs": ["feed"],
              "required": false
            },
          ],

          // fritter-profile
          name: record.name,
          bio: record.bio,
          avatar: record.avatar,
          follows: record.follows,

          // rotonde-profile-version
          rotonde_version: record.rotonde_version,

          // rotonde-profile-site
          site: record.site,

          // rotonde-profile-pinned
          pinned: record.pinned,

          // rotonde-profile-sameas
          sameas: record.sameas,

          // rotonde-profile-discoverable
          discoverable: record.discoverable === null || record.discoverable === undefined ? true : false,

          // rotonde-profile-legacy
          feed: record.feed // Preserve legacy feed.
        };
      }
    });

    db.define("feed",
    {
      filePattern: "/posts/*.json",
      index: ["createdAt", ":origin+createdAt", "threadRoot"],
      validate(record)
      {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return false;
        }

        if (record["@schema"]) {
          // JSON-LZ

          if (jlz.detectSupport(record, [
            // Profile "features" (vocabs) we support
            "rotonde-post-fritter",
            "rotonde-post-media",
            "rotonde-post-target",
            "rotonde-post-quotechain",
            "rotonde-post-whisper",
          ]).incompatible)
            return false;

        }

        // TODO: Set up post .json validation.
        // This will become more important in the future.        
        return true;
      },
      preprocess(record)
      {
        if (record["@context"]) {
          // JSON-LD - not supported.
          return;
        }
        
        if (record["@schema"]) {
          // JSON-LZ

          // rotonde-post-* natively supported.

          return;
        }

        // rotonde -> Fritter
        record.text = record.text || record.message;
        record.createdAt = record.createdAt || record.timestamp;
        record.editedAt = record.editedAt || record.editstamp;

        // rotonde legacy -> rotonde-post-quotechain
        record.quote = record.quote;
      },
      serialize(record)
      {
        return {
          "@schema": [
            "rotonde-post-fritter",
            {
              "name": "rotonde-post-media",
              "attrs": ["media"],
              "required": false
            },
            {
              "name": "rotonde-post-target",
              "attrs": ["target"],
              "required": false
            },
            {
              "name": "rotonde-post-quotechain",
              "attrs": ["quote"],
              "required": false
            },
            {
              "name": "rotonde-post-whisper",
              "attrs": ["whisper"],
              "required": record.whisper // Require only if this is a whisper.
            }
          ],

          // rotonde-post-fritter
          text: record.text || "",
          createdAt: record.createdAt,
          editedAt: record.editedAt,
          threadRoot: record.threadRoot,
          threadParent: record.threadParent,

          // rotonde-post-media
          media: record.media,

          // rotonde-post-target
          target: record.target,

          // rotonde-post-quotechain
          quote: record.quote,

          // rotonde-post-whisper
          whisper: record.whisper,
        };
      }
    });

    await db.open();
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
    var target = e.target;
    while (target && !target.getAttribute("data-operation"))
      target = target.parentElement;
    if(!target || !target.getAttribute("data-operation")){ return; }
    e.preventDefault();

    var prev_text = r.operator.input_el.value;
    r.operator.inject(target.getAttribute("data-operation"));
    if(!target.getAttribute("data-validate")){
      return;
    }
    r.operator.validate().then(() => {
      r.operator.inject(prev_text);
    });
  }

  this.key_down = function(e)
  {
    if (e.which === 27) { // ESC
      r.home.feed.bigpicture_hide();
      return;
    }

    if((e.key == "Backspace" || e.key == "Delete") && (e.ctrlKey || e.metaKey) && e.shiftKey){
      r.home.select_archive();
      return;
    }
  }

}

// Make this accessible for jest
window.Rotonde = Rotonde;
