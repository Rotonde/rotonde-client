// require() any npm packages in this file and set them up here.
// Three step Rotonde npm dependency process:
// npm install -g browserify
// npm install
// browserify deps/required-pre.js -o deps/required.js

var r = window.r; // Just in case browserify or something else starts leaking their own r

window.WebDB = require("@beaker/webdb");

// Already create and setup the instance, which can be used by all other scripts.
r.install_db(new WebDB("rotonde"));

r.confirm("dep","required");
