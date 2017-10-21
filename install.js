(async function(){
  var hash = await DatArchive.resolveName(document.currentScript.src);
  var index_html = "";
  index_html += "<!doctype html>\n";
  index_html += "<html>\n";
  index_html += "  <head>\n";
  index_html += "    <script src='dat://" + hash + "/rotonde.js'></script>\n";
  index_html += "  </head>\n";
  index_html += "  <body></body>\n";
  index_html += "  <script>\n";
  index_html += "    var r = new Rotonde('dat://" + hash + "/'); r.install();\n";
  index_html += "  </script>\n";
  index_html += "</html>\n";
  var archive = new DatArchive(window.location.toString());
  await archive.writeFile("/index.html", index_html);
  await archive.commit();
  window.location.reload();
})();
