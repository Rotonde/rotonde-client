// This wouldn't be possible without the providers data from https://github.com/nfl/jquery-oembed-all/blob/master/jquery.oembed.js
function EmbedProvider(urlschemes, api, data) {
  this.urlschemes = urlschemes;
  for (var i in this.urlschemes) {
    this.urlschemes[i] = new RegExp(this.urlschemes[i], "i");
  }
  this.api = api;

  data = data || {};
  for (var property in data) {
      this[property] = data[property];
  }

  this.format = this.format || "json";
  this.callbackparameter = this.callbackparameter || "callback";
  this.embedtag = this.embedtag || {tag: ""};
}

Embed.providers = [

  // Video
  new EmbedProvider(["youtube\\.com/watch.+v=[\\w-]+&?", "youtu\\.be/[\\w-]+", "youtube.com/embed"], '//www.youtube.com/embed/$1?wmode=transparent', {
    templateRegex: /.*(?:v\=|be\/|embed\/)([\w\-]+)&?.*/, embedtag: {tag: 'iframe', width: '425', height: '349'}
  }),

  new EmbedProvider(["xtranormal\\.com/watch/.+"], "https://www.xtranormal.com/xtraplayr/$1/$2", {
    templateRegex: /.*com\/watch\/([\w\-]+)\/([\w\-]+).*/, embedtag: {tag: 'iframe', width: '320', height: '269'}}),
  new EmbedProvider(["gametrailers\\.com/video/.+"], "https://media.mtvnservices.com/mgid:moses:video:gametrailers.com:$2", {
    templateRegex: /.*com\/video\/([\w\-]+)\/([\w\-]+).*/, embedtag: {width: '512', height: '288' }}),
  new EmbedProvider(["twitvid\\.com/.+"], "https://www.twitvid.com/embed.php?guid=$1&autoplay=0",
    {templateRegex: /.*twitvid\.com\/(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }}),
  new EmbedProvider(["aniboom\\.com/animation-video/.+"], "https://api.aniboom.com/e/$1",
    {templateRegex: /.*animation-video\/(\d+).*/, embedtag: {width: 594, height: 334}}),
  new EmbedProvider(["vzaar\\.com/videos/.+", "vzaar.tv/.+"], "https://view.vzaar.com/$1/player?",
    {templateRegex: /.*\/(\d+).*/, embedtag: {tag: 'iframe', width: 576, height: 324 }}),
  new EmbedProvider(["snotr\\.com/video/.+"], "https://www.snotr.com/embed/$1",
    {templateRegex: /.*\/(\d+).*/, embedtag: {tag: 'iframe', width: 400, height: 330}, nocache: 1 }),
  new EmbedProvider(["blip\\.tv/.+"], "//blip.tv/oembed/"),
  new EmbedProvider(["animoto.com/play/.+"], "https://animoto.com/services/oembed"),
  new EmbedProvider(["hulu\\.com/watch/.*"], "//www.hulu.com/api/oembed.json"),
  new EmbedProvider(["www\.vimeo\.com\/groups\/.*\/videos\/.*", "www\.vimeo\.com\/.*", "vimeo\.com\/groups\/.*\/videos\/.*", "vimeo\.com\/.*"], "//vimeo.com/api/oembed.json"),
  new EmbedProvider(["dailymotion\\.com/.+"], '//www.dailymotion.com/services/oembed'),
  new EmbedProvider(["revision3\\.com"], "https://revision3.com/api/oembed/"),
  new EmbedProvider(["clikthrough\\.com/theater/video/\\d+"], "https://clikthrough.com/services/oembed"),
  new EmbedProvider(["kinomap\\.com/.+"], "https://www.kinomap.com/oembed"),
  new EmbedProvider(["vhx.tv/.+"], "https://vhx.tv/services/oembed.json"),
  new EmbedProvider(["bambuser.com/.+"], "https://api.bambuser.com/oembed/iframe.json"),
  new EmbedProvider(["vine.co/v/.*"], null,
    {
      templateRegex: /https?:\/\/w?w?w?.?vine\.co\/v\/([a-zA-Z0-9]*).*/,
      template: '<iframe src="https://vine.co/v/$1/embed/postcard" width="600" height="600" allowfullscreen="true" allowscriptaccess="always" scrolling="no" frameborder="0"></iframe>' +
        '<script async src="//platform.vine.co/static/scripts/embed.js" charset="utf-8"></script>',
      nocache: 1
    }),
  new EmbedProvider(["boxofficebuz\\.com\\/embed/.+"], "https://boxofficebuz.com/embed/$1/$2", {templateRegex: [/.*boxofficebuz\.com\/embed\/(\w+)\/([\w*\-*]+)/], embedtag: {tag: 'iframe', width: 480, height: 360 }}),
  new EmbedProvider(["clipsyndicate\\.com/video/play/.+", "clipsyndicate\\.com/embed/iframe\?.+"], "https://eplayer.clipsyndicate.com/embed/iframe?pf_id=1&show_title=0&va_id=$1&windows=1", {templateRegex: [/.*www\.clipsyndicate\.com\/video\/play\/(\w+)\/.*/, /.*eplayer\.clipsyndicate\.com\/embed\/iframe\?.*va_id=(\w+).*.*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["coub\\.com/.+"], "https://www.coub.com/embed/$1?muted=false&autostart=false&originalSize=false&hideTopBar=false&noSiteButtons=false&startWithHD=false", {templateRegex: [/.*coub\.com\/embed\/(\w+)\?*.*/, /.*coub\.com\/view\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["snagplayer\\.video\\.dp\\.discovery\\.com/.+"], "https://snagplayer.video.dp.discovery.com/$1/snag-it-player.htm?auto=no", {templateRegex: [/.*snagplayer\.video\.dp\.discovery\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }}),
  new EmbedProvider(["telly\\.com/.+"], "https://www.telly.com/embed.php?guid=$1&autoplay=0", {templateRegex: [/.*telly\.com\/embed\.php\?guid=(\w+).*/, /.*telly\.com\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }}),
  new EmbedProvider(["minilogs\\.com/.+"], "https://www.minilogs.com/e/$1", {templateRegex: [/.*minilogs\.com\/e\/(\w+).*/, /.*minilogs\.com\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["viddy\\.com/.+"], "https://www.viddy.com/embed/video/$1", {templateRegex: [/.*viddy\.com\/embed\/video\/(\.*)/, /.*viddy\.com\/video\/(\.*)/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["worldstarhiphop\\.com\/embed/.+"], "https://www.worldstarhiphop.com/embed/$1", {templateRegex: /.*worldstarhiphop\.com\/embed\/(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["zapiks\\.fr\/.+"], "https://www.zapiks.fr/index.php?action=playerIframe&media_id=$1&autoStart=fals", {templateRegex: /.*zapiks\.fr\/index.php\?[\w\=\&]*media_id=(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),

  // Audio
  new EmbedProvider(["chirb\\.it/.+"], "https://chirb.it/wp/$1", {templateRegex: [/.*chirb\.it\/wp\/(\w+).*/, /.*chirb\.it\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["huffduffer.com/[-.\\w@]+/\\d+"], "https://huffduffer.com/oembed"),
  new EmbedProvider(["open.spotify.com/(track|album|user)/"], "https://embed.spotify.com/oembed/"),
  new EmbedProvider(["shoudio.com/.+", "shoud.io/.+"], "https://shoudio.com/api/oembed"),
  new EmbedProvider(["rd.io/.+", "rdio.com"], "https://www.rdio.com/api/oembed/"),
  new EmbedProvider(["soundcloud.com/.+", "snd.sc/.+"], "//soundcloud.com/oembed", {format: 'js'}),

  // Photo
  new EmbedProvider(["deviantart.com/.+", "fav.me/.+", "deviantart.com/.+"], "//backend.deviantart.com/oembed", {format: 'jsonp'}),
  new EmbedProvider(["mobypicture.com/user/.+/view/.+", "moby.to/.+"], "https://api.mobypicture.com/oEmbed"),
  new EmbedProvider(["flickr\\.com/photos/.+"], "//flickr.com/services/oembed", {callbackparameter: 'jsoncallback'}),
  new EmbedProvider(["photobucket\\.com/(albums|groups)/.+"], "https://photobucket.com/oembed/"),
  new EmbedProvider(["instagr\\.?am(\\.com)?/.+"], "//api.instagram.com/oembed"),
  new EmbedProvider(["smugmug.com/[-.\\w@]+/.+"], "https://api.smugmug.com/services/oembed/"),
  new EmbedProvider(["dribbble.com/shots/.+"], "https://api.dribbble.com/shots/$1",
    {
      templateRegex: /.*shots\/([\d]+).*/,
      templateData: function (data) {
        if (!data.image_teaser_url) {
          return false;
        }
        return  '<img src="' + data.image_teaser_url + '"/>';
      }
    }),
  new EmbedProvider(["chart\\.ly/[a-z0-9]{6,8}"], "https://chart.ly/uploads/large_$1.png",
    {templateRegex: /.*ly\/([^\/]+).*/, embedtag: {tag: 'img'}, nocache: 1}),
  new EmbedProvider(["circuitlab.com/circuit/.+"], "https://www.circuitlab.com/circuit/$1/screenshot/540x405/",
    {templateRegex: /.*circuit\/([^\/]+).*/, embedtag: {tag: 'img'}, nocache: 1}),
  new EmbedProvider(["img\\.ly/.+"], "//img.ly/show/thumb/$1",
    {templateRegex: /.*ly\/([^\/]+).*/, embedtag: {tag: 'img'}, nocache: 1}),
  new EmbedProvider(["twitgoo\\.com/.+"], "https://twitgoo.com/show/thumb/$1",
    {templateRegex: /.*com\/([^\/]+).*/, embedtag: {tag: 'img'}, nocache: 1}),
  new EmbedProvider([".imgur\\.com/(?!gallery/)(.+)"], "https://i.imgur.com/$1",
    {templateRegex: /.*com\/([^\/]+).*/, embedtag: {tag: 'img'}, nocache: 1}),
  new EmbedProvider(["achewood\\.com\\/index.php\\?date=.+"], "https://www.achewood.com/comic.php?date=$1", {templateRegex: /.*achewood\.com\/index.php\?date=(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["fotokritik\\.com/.+"], "https://www.fotokritik.com/embed/$1", {templateRegex: [/.*fotokritik\.com\/embed\/(\w+).*/, /.*fotokritik\.com\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["giflike\\.com/.+"], "https://www.giflike.com/embed/$1", {templateRegex: [/.*giflike\.com\/embed\/(\w+).*/, /.*giflike\.com\/a\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),

  // Rich
  new EmbedProvider(["twitter.com/.+"], "https://api.twitter.com/1/statuses/oembed.json"),
  new EmbedProvider(["meetup\\.(com|ps)/.+"], "https://api.meetup.com/oembed"),

  new EmbedProvider(["www.google.com/calendar/embed?.+"], "$1",
    {templateRegex: /(.*)/, embedtag: {tag: 'iframe', width: '800', height: '600' }}),
  new EmbedProvider(["jsfiddle.net/[^/]+/?"], "https://jsfiddle.net/$1/embedded/result,js,resources,html,css/?",
    {templateRegex: /.*net\/([^\/]+).*/, embedtag: {tag: 'iframe', width: '100%', height: '300' }}),
  new EmbedProvider(["jsbin.com/.+"], "https://jsbin.com/$1/?",
    {templateRegex: /.*com\/([^\/]+).*/, embedtag: {tag: 'iframe', width: '100%', height: '300' }}),
  new EmbedProvider(["form.jotform.co/form/.+"], "$1?",
    {templateRegex: /(.*)/, embedtag: {tag: 'iframe', width: '100%', height: '507' }}),
  new EmbedProvider(["reelapp\\.com/.+"], "https://www.reelapp.com/$1/embed",
    {templateRegex: /.*com\/(\S{6}).*/, embedtag: {tag: 'iframe', width: '400', height: '338'}}),
  new EmbedProvider(["linkedin.com/pub/.+"], "https://www.linkedin.com/cws/member/public_profile?public_profile_url=$1&format=inline&isFramed=true",
    {templateRegex: /(.*)/, embedtag: {tag: 'iframe', width: '368px', height: 'auto'}}),
  new EmbedProvider(["pastebin\\.com/[\\S]{8}"], "https://pastebin.com/embed_iframe.php?i=$1",
    {templateRegex: /.*\/(\S{8}).*/, embedtag: {tag: 'iframe', width: '100%', height: 'auto'}}),
  new EmbedProvider(["mixlr.com/.+"], "https://mixlr.com/embed/$1?autoplay=ae",
    {templateRegex: /.*com\/([^\/]+).*/, embedtag: {tag: 'iframe', width: '100%', height: 'auto' }}),
  // GitHub is causing issues (rate limiting, "invalid" responses, ...)
  // new EmbedProvider(["gist.github.com/.+"], "https://github.com/api/oembed"),
  // new EmbedProvider(["github.com/[-.\\w@]+/[-.\\w@]+"], "https://api.github.com/repos/$1/$2"
  //   , {templateRegex: /.*\/([^\/]+)\/([^\/]+).*/,
  //     templateData: function (data) {
  //       if (!data.data.html_url)return false;
  //       return  '<div class="oembedall-githubrepos"><ul class="oembedall-repo-stats"><li>' + data.data.language + '</li><li class="oembedall-watchers"><a title="Watchers" href="' + data.data.html_url + '/watchers">&#x25c9; ' + data.data.watchers + '</a></li>'
  //         + '<li class="oembedall-forks"><a title="Forks" href="' + data.data.html_url + '/network">&#x0265; ' + data.data.forks + '</a></li></ul><h3><a href="' + data.data.html_url + '">' + data.data.name + '</a></h3><div class="oembedall-body"><p class="oembedall-description">' + data.data.description + '</p>'
  //         + '<p class="oembedall-updated-at">Last updated: ' + data.data.pushed_at + '</p></div></div>';
  //     }
  //   }),
  new EmbedProvider(["kickstarter\\.com/projects/.+"], "$1/widget/card.html",
    {templateRegex: /([^\?]+).*/, embedtag: {tag: 'iframe', width: '220', height: 380}}),
  new EmbedProvider(["slideshare\.net"], "//www.slideshare.net/api/oembed/2", {format: 'jsonp'}),
  new EmbedProvider(["roomshare\\.jp/(en/)?post/.*"], "https://roomshare.jp/oembed.json"),
  new EmbedProvider(["coveritlive.com/"], null, {
    templateRegex: /(.*)/,
    template: '<iframe src="$1" allowtransparency="true" scrolling="no" width="615px" frameborder="0" height="625px"></iframe>'}),
  new EmbedProvider(["polldaddy.com/"], null, {
    templateRegex: /(?:https?:\/\/w?w?w?.?polldaddy.com\/poll\/)([0-9]*)\//,
    template: '<script async type="text/javascript" charset="utf-8" src="https://static.polldaddy.com/p/$1.js"></script>',
    nocache: 1
  }),
  new EmbedProvider(["360\\.io/.+"], "https://360.io/$1", {templateRegex: /.*360\.io\/(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["on\\.bubb\\.li/.+"], "https://on.bubb.li/$1", {templateRegex: /.*on\.bubb\.li\/(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360}, nocache: 1 }),
  new EmbedProvider(["cloudup\\.com/.+"], "https://cloudup.com/$1?chromeless", {templateRegex: [/.*cloudup\.com\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }}),
  new EmbedProvider(["codepen.io/.+"], "https://codepen.io/$1/embed/$2", {templateRegex: [/.*io\/(\w+)\/pen\/(\w+).*/, /.*io\/(\w+)\/full\/(\w+).*/], embedtag: {tag: 'iframe', width: '100%', height: '300'}, nocache: 1 }),
  new EmbedProvider(["(.*maps\\.google\\.com\\/maps\\?).+(output=svembed).+(cbp=(.*)).*"], "https://maps.google.com/maps?layer=c&panoid=$3&ie=UTF8&source=embed&output=svembed&cbp=$5", {templateRegex: /(.*maps\.google\.com\/maps\?).+(panoid=(\w+)&).*(cbp=(.*)).*/, embedtag: {tag: 'iframe', width: 480, height: 360}, nocache: 1 }),
  new EmbedProvider(["google\\.com\/maps\/place/.+"], "https://maps.google.com/maps?t=m&q=$1&output=embed", {templateRegex: /.*google\.com\/maps\/place\/([\w\+]*)\/.*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["embed\\.imajize\\.com/.+"], "https://embed.imajize.com/$1", {templateRegex: /.*embed\.imajize\.com\/(.*)/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["mapjam\\.com/.+"], "https://www.mapjam.com/$1", {templateRegex: /.*mapjam\.com\/(.*)/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["polarb\\.com/.+"], "https://assets-polarb-com.a.ssl.fastly.net/api/v4/publishers/unknown/embedded_polls/iframe?poll_id=$1", {templateRegex: /.*polarb\.com\/polls\/(\w+).*/, embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1}),
  new EmbedProvider(["ponga\\.com/.+"], "https://www.ponga.com/embedded?id=$1", {templateRegex: [/.*ponga\.com\/embedded\?id=(\w+).*/, /.*ponga\.com\/(\w+).*/], embedtag: {tag: 'iframe', width: 480, height: 360 }, nocache: 1})

];

r.confirm("script","embed_providers");