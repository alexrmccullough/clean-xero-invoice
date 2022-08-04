/* 
Converts a Named Range in Sheets to a table / 2d array of trimmed values 
*/
function nrToTable (rangeName, ss) {
    var range = ss.getRangeByName(rangeName);
    return trimTable(range.getValues());
  };

/* 
Converts a Named Range identified by its name to a multi-level search tree. 
Purpose is to allow for easy lookups of values in tables that involve 
  more than two dependent fields / categories. 
The resulting tree is used to answer questions like: 
  What account code should we assign if MarketName = Market 1, Type = Invoice, and TaxType = Tax Exempt?
*/
function nrToLookupTree (rangeName, ss) {
  // Match header with * as first character.
  // Indicates the primary lookup column. 
  var lookupExp = /^\*((?:\w|\s)+)$/;
  var table = nrToTable (rangeName, ss);
  var headers = table[0];
  var lookupHeaders = [];
  for (var i=0; i<headers.length; i++) {
    var h = headers[i];
    var match = h.match(lookupExp);
      if (match) {
        lookupHeaders.push(match[0]);
      }
  }
  return {
    lookupHeaders: lookupHeaders,
    tree: tableToLookupTreeByHeaders (table, lookupHeaders)
  };
};

/*
Removes duplicate values from an array. 
Returns array with duplicates removed. 
*/ 
function removeDuplicatesA (a) {
  var unique = a.filter(function(elem, index, self) {
    return index == self.indexOf(elem);
  });
  return unique;
};

/*
Returns leaf value of a tree given a list of nested search values. 
*/
function searchTree (node, headers) {
  if (node == null) {
    throw new TreeSearchNotFoundError(node, headers);
  }
  if (headers.length == 0) {
    return node;
  }
  else if (headers.length == 1) {
    var result = node[headers[0]];
    if (result == null) {
      throw new TreeSearchNotFoundError(node, headers);
    }
    return result;
  }
  else {
    var headers_ = headers.slice();
    var header = headers_.splice(0, 1);
    var child = node[header];
    
    var nextSearch;
    try {
      nextSearch = searchTree (child, headers_);
    }
    catch (e) {
      if (e instanceof TreeSearchNotFoundError) {
        e.setKeys ([header].concat(headers));
        e.node = node;
        throw e;
      }
      else {
        throw e; 
      }
    }
    
    return nextSearch;
  }
}

/*
Error function for failed tree search. 
*/ 
function TreeSearchNotFoundError(node, keys, failKey, msg) {
  this.setKeys = function (keys) {
    if (Array.isArray(keys)) {
      this.keys = keys;
      this.failKey = keys[0];
    }
    else {
      this.keys = [keys];
      this.failKey = keys;
    } 
  }
  
  this.toString = function () {
    return (
      this.name + ': KEY PATH: ' + this.keys + ' \nFAILED AT: ' + 
      JSON.stringify(this.failKey) + ' \nNODE:' + JSON.stringify(node)
    );
  }
  
  this.name = 'TreeSearchNotFoundError';
  this.message = (msg || "");
  this.node = node;
  this.keys;
  this.failKey = '';
  this.setKeys (keys);
  const err = Error();
  this.stack = err.stack;
}


/* 
Converts a table to a multi-level lookup tree. Layers of tree specified by list of table headers. 
Purpose is to allow for easy lookups of values in tables that involve 
  more than two dependent fields / categories. 
The resulting tree is used to answer questions like: 
  What account code should we assign if MarketName = Market 1, Type = Invoice, and TaxType = Tax Exempt?
*/
function tableToLookupTreeByHeaders (table, lookupHeaders) {
  if (lookupHeaders.length <= 0) { throw new Error(); }
  
  var mapArray = tableToMapArray(table);
  var headers = table[0];
  
  var tree = {};
  
  function addToTree_ (dict_, tree_, headers_) {
    if (!headers_ || headers_.length<1) {
      Object.assign(tree_, dict_);
      return true;
    }

    var lookupHeaders_ = headers_.slice();
    var header_ = lookupHeaders_.splice(0, 1);
    var key_ = dict_[header_];
    if (!(delete dict_[header_])) { throw new Error(); }   

    if (!(key_ in tree_)) { 
      tree_[key_] = {};
    }
    
    var hitLeaf = addToTree_ (dict_, tree_[key_], lookupHeaders_);
    var lastKeys = Object.keys(tree_[key_]);
    if (hitLeaf && lastKeys.length == 1) {
      tree_[key_] = tree_[key_][lastKeys[0]];
    }
  }; 
    
  for (var i=0; i<mapArray.length; i++) {
    var elem = mapArray[i];
    addToTree_ (elem, tree, lookupHeaders);
  }
  
  return tree;
};


/*
Merges two dictionaries together.  Modifies target param in place. 
@return {Dict} Target param, with src merged into it. 
*/
function joinDicts (target, src) {
  var keys = Object.keys(src);
  for (var i=0; i<keys.length; i++) {
    key = keys[i];
    target[key] = src[key];
  };
  return target;
};

/*
Converts a table to an array of dicts, one dict for each line of the table. 
Each dict contains key/value pairs corresponding to header_name/value.
*/
function tableToMapArray(table, trimValues) {
  var result = [];
  var value;
  trimValues = trimValues || false; 
  
  var headers = table[0];

  var hlen = headers.length;
  var tlen = table.length;

  for (var i=1; i<tlen; i++) {
    var entry = {};
    
    for (var j=0; j<hlen; j++) {
      value = table[i][j];
      if(trimValues) { value = value.trim(); }
      entry[ headers[j] ] = value;
    }
    
    result.push( entry );
  }
  
  return result;
};

/*
Converts a table to a dictionary. Keys of the dict will be the unique set
of values at table[colNum][0 through n]. The value for each key will be
the array of all the values in that row, with the column at colNum removed. 
*/
function tableToDict (table, colNum) {
  var dict = {};

  if (colNum >= table[0].length) { throw new Error(); }
  
  for (var i=0; i<table.length; i++) {
    var row = table[i];
    var key = row[colNum];
    if (typeof key === 'string') {
      key = key.trim();
    }
    row.splice(colNum, 1); 
    
    var value = '';
    var len = row.length;
    
    if (len === 1)    { 
      value = row[0]; 
      if (typeof value === 'string') {
        value = value.trim();
      }
    }
    else if (len > 1) { value = row; }
    
    dict[key] = value;
  }
  return dict;
};

/*
Performs a reverse converstion from an array of dictionaries with each dict
representing a row of the table and each key/value pair corresponding to the 
table header / value for that row. 
*/
function dictArrayToTable (a) {
  var table = [];
  var keys = Object.keys(a[0]);
  
  for (var i=0; i<a.length; i++) {
    var row = [];
    for (var j=0; j<keys.length; j++) {
      var key = keys[j];
      row[j] = a[i][key];
    }
    table[i] = row;
  }
  
  table.unshift(keys);
  return table;
}

/*
Converts a simple array into a 2d format, where:
[1, 2, 3] becomes
[ [1], 
  [2],
  [3] ]
Each new array contains a single value from the original array.
*/
function transposeArrayToCol (a) {
  var table = [];
  for (var i=0; i<a.length; i++) {
    table[i] = [a[i]]; 
  }
  return table;
}

/*
Generates a table with trailing blank cells removed. 
*/  
function trimTable (t) {
  var row = 0;
  for (var row=0; row<t.length; row++) {
    if (!t[row].join("")) break;
  }
  return t.slice(0, row);
};

/*
Trims leading and trailing white space from all strings in an array
*/
function trimArrayStrings (a) {
  for (var i=0; i<a.length; i++) {
    a[i] = a[i].trim();  
  }
  return a;
};

/*
Test for equivalency by properties between objects.
*/
function isEquivalent(a, b) {
    // Create arrays of property names
    var aProps = Object.getOwnPropertyNames(a);
    var bProps = Object.getOwnPropertyNames(b);

    // If number of properties is different,
    // objects are not equivalent
    if (aProps.length != bProps.length) {
        return false;
    }

    for (var i = 0; i < aProps.length; i++) {
        var propName = aProps[i];

        // If values of same property are not equal,
        // objects are not equivalent
        if (a[propName] !== b[propName]) {
            return false;
        }
    }

    // If we made it this far, objects
    // are considered equivalent
    return true;
};


/* 
Shim to replicate Object.assign()
*/
if (typeof Object.assign != 'function') {
  Object.assign = function(target) {
    'use strict';
    if (target == null) {
      throw new TypeError('Cannot convert undefined or null to object');
    }

    target = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var source = arguments[index];
      if (source != null) {
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
    }
    return target;
  };
}

/*
Convert an array of characters to a string.
*/
function caToStr (ca) {
  return ca.join('');
}

/*
Given a source array, return an array composed only of unique values from the source array.
*/
function aUnique (a) {
  var seen = {};
  var out = [];
  var len = a.length;
  var j = 0;
  for(var i = 0; i < len; i++) {
    var item = a[i];
    if(seen[item] !== 1) {
      seen[item] = 1;
      out[j++] = item;
    }
  }
  return out;
}

/*
Standardized day-of-the-week lookup.
*/
function dayOfWeek (i) {
  const daymap = {
    0: 'Sun',
    1: 'Mon',
    2: 'Tues',
    3: 'Wed',
    4: 'Thurs',
    5: 'Fri',
    6: 'Sat'
  };
  
  return daymap[i];
}

/*
Get the actual date a specified number of days after (or before) a given date. 
*/
function addDaysToDate (date, numdays) {
  return date.setTime( date.getTime() + numdays * 86400000 );
}

/*
Convert a YYYYMMDD date string to a Date object. 
*/
function parseDateYYYYMMDD (datestr, delim) {
  var dElems = datestr.split(delim);
  var d =  Date(
    parseInt(dElems[0]), 
    parseInt(dElems[1])-1, 
    parseInt(dElems[2])
  );  // -1 because months are from 0 to 11
  return d;
}

/*
Determine whether given value falls between two values. 
*/
function isBetween (v, first, last) {
  if( v >= first && v <= last){
    return true;
  }
  else{
    return false;
  }
}

/*
Convert a 2d (or higher-dimension) array into a 1d array.
*/
function flatten (a, deleteVal) {
  var flat = [];
  for (var i = 0; i < a.length; i++) {
      if (a[i] instanceof Array) {
          flat.push.apply(flat, flatten.apply(this, a[i]));
      } else {
        var val = a[i];
        if (val != deleteVal) {
          flat.push(arguments[i]);
        }
      }
  }
  return flat;
}




String.prototype.replaceAll = function(str1, str2, ignore) 
{
    return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
} 