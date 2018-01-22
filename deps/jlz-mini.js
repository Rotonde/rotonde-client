// This is jlz-mini, a miniature Vanilla JS JSON-LZ helper.
// Visit https://github.com/pfrazee/json-lz to learn what JSON-LZ is about.

(() => {

var regexEscapePattern = /[-\/\\^$*+?.()|[\]{}]/g;
function regexEscape(s) {
  return s.replace(regexEscapePattern, "\\$&");
}

function wildcardToRegex(pattern) {
  return new RegExp("^" +
      pattern.split("*")
        .map(s => regexEscape(s))
        .join(".*")
    + "$");
}

function matchPattern(str, patterns) {
  if (typeof patterns === "string")
    return str.match(wildcardToRegex(patterns));
  for (var i in patterns)
    if (matchPattern(str, patterns[i]))
      return true;
  return false;
}

window.jlz = window.JSONLZ = {
  
  detectSupport(doc, supported) {
    var schema = doc["@schema"];
    if (!schema)
      return {
        inconclusive: true
      };
    
    if (typeof supported === "string") {
      supported = [supported];
    }

    if (!Array.isArray(schema)) {
      // schema is a single vocab name or object.
      if (supported.indexOf(schema.name || schema) !== -1)
        return {
          full: true
        };
      else if (!schema.required)
        return {
          partial: true
        };
      else
        return {
          incompatible: true
        };
    }

    // schema contains multiple vocabs.

    var flags = {
      full: true,
      partial: false
    };
    
    for (var i in schema) {
      var vocab = schema[i];
      if (supported.indexOf(vocab.name || vocab) !== -1) {
        // Don't modify full or partial.
      } else if (!vocab.required) {
        // Vocab not found but not required - partial support.
        flags.full = false;
        flags.partial = true;
      } else
        // Return early if even a single required vocab isn't supported.
        return {
          incompatible: true
        };
    }

    return flags;
  },

  getSchemaFor(doc, prop) {
    if (prop === "@schema")
      return undefined;
    var schema = doc["@schema"];
    if (!schema)
      return undefined;

    // Check if the path is populated in doc.
    var obj = doc;
    var pathSplit = prop.split(".");
    for (var i in pathSplit) {
      var key = pathSplit[i];
      obj = obj[key];
      if (!obj)
        return undefined;
    }
    
    if (!Array.isArray(schema)) {
      // schema is a single vocab name or object.
      if (!schema.attrs || !schema.attrs.length)
        return schema.name || schema; // Default vocab.
      
      if (matchPattern(prop, vocab.attrs))
        return schema.name || schema; // Is a single vocab with attrs even valid?

      return undefined;
    }

    // schema contains multiple vocabs. Find best match.
    
    var match = undefined;
    var matchLength = 0;

    for (var i in schema) {
      var vocab = schema[i];
      
      if (!vocab.attrs || !vocab.attrs.length) {
        if (!match)
          match = vocab.name || vocab; // First default vocab.
        continue;
      }

      var attrsList = vocab.attrs;
      if (!Array.isArray(attrsList))
        attrsList = [attrsList]; // TODO: Don't lazily go the array codepath.
      for (var attrsi in attrsList) {
        var attrs = attrsList[attrsi];

        var length = attrs.split(".").length;
        if (length < matchLength)
          continue;
        if (!matchPattern(prop, attrs))
          continue;
        
        match = vocab.name || vocab;
        matchLength = length;
      }
    }

    return match;
  },

  iterate(doc, vocab, fnOrMap) {
    var schema = doc["@schema"];
    if (!schema)
      return;

    var vocabFound = null;
    
    if (!Array.isArray(schema)) {
      // schema is a single vocab name or object.
      // TODO: Don't lazily go the array codepath.
      schema = [schema];
    }

    for (var i in schema) {
      if ((schema[i].name || schema[i]) === vocab) {
        vocabFound = schema[i];
        break;
      }
    }

    if (!vocabFound)
      return;

    var isVocab;
    if (vocabFound.attrs && vocabFound.attrs.length) {
      // Check prop path against vocabFound.attrs.
      isVocab = path => matchPattern(path, vocabFound.attrs);
    } else {
      // Check prop path against all other .attrs.
      var attrs = [];
      for (var i in schema) 
        if (schema[i].attrs && schema[i].attrs.length) {
          if (Array.isArray(schema[i].attrs))
            Array.prototype.push.apply(attrs, schema[i].attrs);
          else
            attrs.push(schema[i].attrs);            
        }
      
      if (attrs.length === 0) {
        // No other vocabs found - set isVocab to null, which skips the check.
        isVocab = null;
      } else {

        // Return false if the prop path matches with any other vocab.
        isVocab = path => {
          for (var i in attrs) {
            if (matchPattern(path, attrs[i]))
              return false;
          }
          return true;
        }

      }
    }

    var fn = typeof fnOrMap === "function" ? fnOrMap : null;
    var iterateThrough = function(obj, path, map) {
      if (!fn && !map)
        return;

      for (var key in obj) {
        if (key === "@schema")
          continue;
        
        var pathFull;
        if (path) {
          pathFull = path + "." + key;
        } else {
          pathFull = key;
        }

        // Note: We don't want to continue if !isVocab(pathFull), as that
        // would prevent us from reaching some nested props / long paths.
        
        var value = obj[key];
        if (typeof value !== "object") {
          // Not an object - we don't need to "step through." Just pass it.
          if (map && typeof map[key] === "function")
            isVocab(pathFull) && map[key](value);
          else if (fn)
            isVocab(pathFull) && fn(key, value, pathFull);

        } else {
          // Object - possibly step through.
          if (map && typeof map[key] === "function")
            isVocab(pathFull) && map[key](value);
          else {
            // TODO: How do we determine if we want to pass value to fn or iterate through value?
            if (fn)
              isVocab(pathFull) && fn(key, value, pathFull);
            iterateThrough(value, pathFull, map && map[key]);
          }
        }
      }
    }

    iterateThrough(doc, null, typeof fnOrMap === "object" ? fnOrMap : null);

  },
  
}

})();

// Don't make jlz-mini.js require rotonde.
if (window["r"] && r.confirm) {
  r.confirm("dep", "jlz-mini");
}
