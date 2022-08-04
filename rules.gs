/*
This tool is built to allow the user to modify conversion syntax rules using a simple, custom
language. The following function defines the custom language rules and performs all the 
recursive parsing of any given phrase. The user can set and change the rules at any time using
the Script Settings spreadsheet.

A simple example. In our settings file we create a custom setting named LV_CUSTOMVAR_STDBUYER. This 
is meant to be a unique, non-numeric ID for a buyer. For any given buyer record, we 
want to a call to LV_CUSTOMVAR_STDBUYER to return a string in the format <LASTNAME>-<FIRSTNAME>-<BUSINESSNAME>.

So, in our Settings file we will define LV_CUSTOMVAR_STDBUYER using our custom language. The setting will look like:
   {SH_LAST_NAME}-{SH_FIRST_NAME}-{SH_BUSINESSNAME}
The actual output of applying this rule on a row of input data would look something like:
   Smith-Bob-Bob's Restaurant

We can also do lookups on other tables in the Settings file. For example, if we don't want to use the business name
from the source data (SH_BUSINESSNAME) but instead want to look up a standardized or prettified version of it in our Buyers table,
we can modify the above setting to look something like:
   {SH_LAST_NAME}-{SH_FIRST_NAME}-[LT_BUYERINFO: {SH_LAST_NAME}-{SH_FIRST_NAME}-{SH_BIZ_NAME}, PRETTY_BIZNAME]

In the above example, we look up a value in the table whose Named Range is specified at the LT_BUYERINFO setting. 
Our lookup key is our unique buyer ID constructed using the syntax: {SH_LAST_NAME}-{SH_FIRST_NAME}-{SH_BUSINESSNAME}
In that buyer record, we want to return the value in the column with header name specified by the PRETTY_BIZNAME setting.

An OR operator is also included, which allows a table lookup to fall back on a secondary lookup in case the first fails 
to return an appropriate value. 

Language syntax rules are as follows:
  rule := phrase | phrase || phrase

  phrase := phraseelem | phraseelem&phraseelem

  phraseelem := filler
  	    | lookup
  	    | variable
        | setting

  lookup := '['atom ':' lookupkeys ']'
  lookupkeys := phrase | phrase ',' phrase
  variable := '{'atom'}'
  setting := '<'atom'>'
  atom := word+
  filler := char+
*/

function XeroFieldRules (sRulesDict, appSetts) {
  this.sRulesDict = sRulesDict;
  this.rulesDict = {};
  this.appSetts = appSetts;
  this.rulesCount = 0;
  
  this.keys_ = Object.keys(this.sRulesDict);
  
  for (var i=0; i<this.keys_.length; i++) {
    var key = this.keys_[i];
    this.rulesDict[key] = new Rule (this.sRulesDict[key], this.appSetts);
  }
  
  this.getKeys = function () {
    return this.keys_;
  }
  
  this.getRule = function (key) {
    return this.rulesDict[key]; 
  }
  
  this.evalRule = function (ruleKey, salesEntry, overrides) {
    if (overrides) {
      salesEntry = FCLib.joinDicts (salesEntry, overrides);
    }
    var rule = this.rulesDict[ruleKey];
    return rule.eval(salesEntry);
  }
  
  this.evalAllRules = function (salesEntry) {
    var rulesResults = {};
    var keys = this.keys_;
    for (var i=0; i<keys.length; i++) {
      var key = keys[i];  
      rulesResults[key] = this.evalRule(key, salesEntry);
    }
    
    return rulesResults;
  }
};


function Rule (s, appSetts) {
  this.type = "Rule";
  this.appSetts = appSetts;
  // Splits by || into Phrases
  // Evaluate phrase
  this.sPhrases = FCLib.trimArrayStrings ( s.split("||") );
  this.phrases = [];
  for (var i=0; i<this.sPhrases.length; i++) {
    this.phrases.push(new Phrase(this.sPhrases[i], this.appSetts));
  }
 
  this.eval = function (saledata) {
    var defaultResult = "";
    
    for (var i=0; i<this.phrases.length; i++) {
      var curResult = this.phrases[i].eval(saledata);
      if (curResult) {
        return curResult;
      }
    }
    
    return defaultResult;
  };
}

function Phrase (s, appSetts) {
  this.type = "Phrase";
  this.appSetts = appSetts;
  this.tokenize = function (s) {
    var ca = s.trim().split('');
    var elems_ = [];
    var debugElems_ = [];
    var caCurToken = [];
    var curType;
    var c;
    var sfDepth = 0;
    var lookupDepth = 0;  
    var settDepth = 0;
    var dateDepth = 0;
    
    // Break this token into subtokens
    // At the end of the loop through the string characters, determine the type of THIS token
    for (var i=0; i<ca.length; i++) {
      c = ca[i];
      switch (c) {
        case '{':
          // If we see a SaleField inside a Lookup, don't treat it as a SaleField.
          if (lookupDepth > 0 || dateDepth > 0) {
            caCurToken.push(c); 
          }    
          // If we see evidence of a nested SaleField, error. Shouldn't have that. 
          else if (sfDepth > 0) { 
            var msg = "Nested Sale Field ({}) not allowed";
            throw new RuleSyntaxError(s, msg);
          }         
          // If it's a normal start to a SaleField, then we need to save the previous token first.
          // Then, start a new token, increment sfDepth.
          else {           
            if (caCurToken.length > 0) { 
              elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
//              debugElems_.push(caToStr(caCurToken));
              
            }
            caCurToken = [];
            caCurToken.push(c);
          }
          sfDepth++;
          break;
          
        case '}':
          // If we see a SaleField inside a Lookup, don't treat it as a SaleField.
          if (lookupDepth > 0 || dateDepth) {
            caCurToken.push(c);
          }    
          // If we see evidence of a nested SaleField or missing start bracket, throw error. Shouldn't have that. 
          else if (sfDepth != 1) { 
            var msg;
            if (sfDepth > 1) { msg = "Nested Sale Field ({}) not allowed"; }
            else if (sfDepth < 1) { msg = "Sale Field missing opening \"{\""; }
            throw new RuleSyntaxError(s, msg);
          }  
          else {
            caCurToken.push(c);
            elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            caCurToken = [];
          }
          sfDepth--;
          break;
          
        case '[':
          if (sfDepth > 0) {
            var msg = "Unterminated Sale Field ({}) running into Lookup declaration (\"[\")";
            throw new RuleSyntaxError(s, msg);
          }
          else if (lookupDepth > 0) {
            caCurToken.push(c);
          }
          
          else {
            if (caCurToken.length > 0) { 
              elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            }
            caCurToken = [];
            caCurToken.push(c);
          }
          lookupDepth++;
          break;
          
        case ']':
          if (sfDepth > 0 || lookupDepth < 1) {
            var msg = "Sale Field ({}) not terminated before end of Lookup declaration (\"[]\")";
            throw new RuleSyntaxError(s, msg);
          }
          else if (lookupDepth < 1) {
            var msg = "Lookup declaration close (\"]\") has no corresponding open (\"[\")";
            throw new RuleSyntaxError(s, msg);        
          }
          else if (lookupDepth > 1) {
            caCurToken.push(c);
          }
          else {
            caCurToken.push(c);
            elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            caCurToken = [];
          }
          lookupDepth--;
          break;
          
        case '<':
          // If we see a Setting inside a Lookup, don't treat it as a SaleField.
          if (lookupDepth > 0 || dateDepth > 0) {
            caCurToken.push(c); 
          }    
          // If we see evidence of a nested setting, throw error. Shouldn't have that. 
          else if (settDepth > 0) { 
            var msg = "Nested Setting declaration (\"<>\") not allowed";
            throw new RuleSyntaxError(s, msg);
          }         
          // If it's a normal start to a Setting, then we need to save the previous token first.
          // Then, start a new token, increment sfDepth.
          else {           
            if (caCurToken.length > 0) { 
              elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            }
            caCurToken = [];            
            caCurToken.push(c);
          }
          settDepth++;
          break;
          
        case '>':
          // If we see a Setting inside a Lookup, don't treat it as a SaleField.
          if (lookupDepth > 0 || dateDepth > 0) {
            caCurToken.push(c);
          }    
          // If we see evidence of a nested Setting or missing start bracket, throw error. Shouldn't have that. 
          else if (settDepth != 1) { 
            var msg;
            if (settDepth > 1) { msg = "Nested Setting declaration (\"<>\") not allowed"; }
            else if (settDepth < 1) { msg = "Setting declaration missing opening \"<\""; }
            throw new RuleSyntaxError(s, msg); 
          }  
          else {
            caCurToken.push(c);
            elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            caCurToken = [];
          }
          settDepth--;
          break;
          
        case '~':
          // Date token open
          if (sfDepth > 0) {
            var msg = "Cannot have Date token inside of a Sale Field ({}( token.";
            throw new RuleSyntaxError(s, msg);
          }
          if (settDepth > 0) { 
            var msg = "Cannot have Date token inside a Settings (<>) token.";
            throw new RuleSyntaxError(s, msg);
          }
          if (dateDepth == 0) {
            dateDepth++;
            caCurToken.push(c);
          }
          else if (dateDepth == 1) {
            caCurToken.push(c);
            elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
            caCurToken = [];           
            dateDepth--;
          }
          else {          
            throw new RuleSyntaxError(s, "Non-matching date markers (~) in Rule string");
          }
          break;
          
        default:
          if (sfDepth < 0 || lookupDepth < 0 || settDepth < 0) {
            var badDelims = [];
            if (sfDepth) { badDelims.push ('{}'); }
            if (lookupDepth) { badDelims.push ('[]'); }               
            if (settDepth) { badDelims.push ('<>'); }
            if (dateDepth) { badDelims.push ('~'); }
            
            if (badDelims.length > 0) {
              var sDelims = badDelims.join(', ');
              var msg = "Unmatched delimiters in rule. Delims: " + sDelims; 
              throw new RuleSyntaxError(s, msg);
            }
          }
          caCurToken.push(c);
          break;
      }
    }
    // Look for unmatched SaleField / Lookup / Setting delimiters
    var badDelims = [];
    if (sfDepth) { badDelims.push ('{}'); }
    if (lookupDepth) { badDelims.push ('[]'); }               
    if (settDepth) { badDelims.push ('<>'); }
    
    if (badDelims.length > 0) {
      var sDelims = badDelims.join(', ');
      var msg = "Unmatched delimiters in rule. Delims: " + sDelims; 
        throw new RuleSyntaxError(s, msg);
    }
        
    // Process the last token, if needed
    if (caCurToken.length > 0) {
      elems_.push(new Elem(FCLib.caToStr(caCurToken), this.appSetts));
    }
    return elems_;
  };
  
  this.eval = function (saledata) {
    var resultTokens = [];
    for (var i=0; i<this.elems.length; i++) {
      resultTokens.push( this.elems[i].eval(saledata) );
    }
    var sResult = resultTokens.join('');
    return sResult;
  };
  
  /// CONSTRUCTOR
  this.s = s;
  this.elems = this.tokenize(s);
};

function Elem (s, appSetts) {
  this.type = "Elem";
  this.appSetts = appSetts;
  this.s = s;
  
  // Filler, SaleField, Lookup, Setting
  var trimmed = s.trim();
  if (SaleField.test(trimmed)) {
    return new SaleField (trimmed, this.appSetts);
  }
  if (Lookup.test(trimmed)) {
    return new Lookup (trimmed, this.appSetts);
  }
  if (Setting.test(trimmed)) {
    return new Setting (trimmed, this.appSetts); 
  }
  if (DateToken.matchBasic(trimmed)) {
    return new DateToken (trimmed, this.appSetts);
  }
  return new Filler (s, this.appSetts);
};

function Lookup (s, appSetts) {
  this.type = "Lookup";
  this.appSetts = appSetts;
  this.s = s;
  
  // Of form [table: lookupHeader (, lookupHeader...)]
  
  // FIX: THROW BETTER ERROR
  if (!Lookup.test(s)) { throw new Error(); }
  var match = s.match(Lookup.splitExp);
  if (!match) { 
    throw new Error("Settings Lookup expression invalid: " + s); 
  }
  this.appSetts = appSetts;
  this.tableName = match[1];
  var sLookupKeys = FCLib.trimArrayStrings (match[2].split(','));
  this.lookupKeys = [];
  
  for (var i=0; i<sLookupKeys.length; i++) {
    this.lookupKeys.push(new Phrase(sLookupKeys[i], this.appSetts));  
  }

  
  this.eval = function (saledata) {
    var lookupHeaders = [];
    var r;
    for (var i=0; i<this.lookupKeys.length; i++) {
      r = this.lookupKeys[i].eval(saledata);
      if (!r) {
        throw new Error();
      }
      lookupHeaders.push(r);
    }
    
    var result = this.appSetts.treeLookup (this.tableName, lookupHeaders);   
    return result;
  }
};

function SaleField (s, appSetts) {
  this.type = "SaleField";
  this.appSetts = appSetts;
  if (!SaleField.test(s)) { 
    throw new RuleSaleFieldError("Malformed SaleField setting:" + s); 
  }
  
  this.value = s.slice(1,-1);    // FIX: REPLACE WITH REGEXP
  this.eval = function (saledata) {
    return this.appSetts.salesDataLookup (saledata, this.value);
  };
};

function Setting (s, appSetts) {
  this.type = "Setting";
  this.appSetts = appSetts;
  var match = Setting.test(s)
  if (!match) { 
    throw new RuleSettingError("Received invalid string for Rule/Setting creation :" + s);
  }
  
  this.id = match[1];
  this.value = this.appSetts.get(this.id);
  
  if (this.value == null) {
    throw new RuleSettingError("No setting value found for Setting ID: " + this.id);
  }
  
  this.eval = function (saledata) {
    return this.value;
  };
};


function DateToken (s, appSetts) {
  // Syntax: #SaleField: "to_parse_str"#
  this.type = "DateToken";
  this.appSetts = appSetts;
  this.s = s;
  
  // FIX: THROW BETTER ERRORS
  if (!DateToken.matchBasic(s)) { throw new Error(s); }
  
  var splitMatch = DateToken.matchSplit(s);
  if (!splitMatch) { 
    throw new Error(s);
  }
  
  var mathMatch = DateToken.matchDateMath(splitMatch[1]);
  if (!mathMatch) {
    throw new Error(s);
  }
  
  this.dateParseTo = splitMatch[2];
  this.baseDate = new Elem(mathMatch[1], appSetts);
  this.plusMinusDays;
  if(mathMatch[2]) {
    this.plusMinusDays = parseFloat(mathMatch[2]);
  }
  
  this.doMath = function (date) {
    if (this.plusMinusDays) {
      var result = FCLib.addDaysToDate(date, this.plusMinusDays);
    }
    return date;
  }
  
  this.eval = function (saledata) {
    var base = this.baseDate.eval(saledata);
    // Split raw date by '+' to pull out any date math
    var d = new Date(Date.parse(base));
    this.doMath (d);    
    // FIX: CATCH DATE PARSE ERROR
    var sOutDate= Utilities.formatDate(d, 'GMT', this.dateParseTo);
    return sOutDate;
  }
}


function Filler (s, appSetts) {
  this.type = "Filler";
  this.appSetts = appSetts;
  this.value = s;
  this.eval = function () {
    return this.value; 
  }
};

SaleField.exp = /^\{(.+)\}$/;
SaleField.test = function (s) {
  if (s.match(SaleField.exp)) {
    return true;
  }
  return false;
};

Lookup.splitExp = /^\s*\[\s*(\w+)\s*\:\s*(.+)\]/;
Lookup.exp = /^\[.+\]$/;
Lookup.test = function (s) {
  if (s.match(Lookup.exp)) {
    return true;
  }
  return false;
};

Setting.exp = /^\<(.+)\<$/;
Setting.test = function (s) {
  if (s.match(Setting.exp)) {
    return true;
  }
  return false;
};

DateToken.dateMathExp = /^([\w{}\[\]<>~]+)(?:([-+]\d+)d)?$/;
//DateToken.splitExp = /^\s*~\s*([\w{}\[\]<>~]+)\s*\:\s*(.+)~$/;
DateToken.splitExp = /^\s*~\s*([^:]+)\s*\:\s*(.+)~$/;
DateToken.exp = /^~.+~$/;
DateToken.matchBasic = function (s) {
  if (s.match(DateToken.exp)) {
    return true
  }
  return false;
}

DateToken.matchSplit = function (s) {
 return s.match(DateToken.splitExp);
}

DateToken.matchDateMath = function (s) {
 return s.match(DateToken.dateMathExp); 
}



// Error Classes

function RuleSyntaxError (rule, msg) { 
  this.toString = function () {
    return ("Rule syntax error in rule " + rule + ". " + msg);
  }

  this.name = 'RuleSyntaxError';
  this.message = (msg || "");
  this.rule = rule;
  const err = Error();
  this.stack = err.stack;
}

function RuleValueError () {}
RuleValueError.prototype = new Error();


function RuleSaleFieldError () {}
RuleSaleFieldError.prototype = new RuleValueError();


function RuleLookupError () {}
RuleLookupError.prototype = new RuleValueError();


function RuleSettingError () {}
RuleSettingError.prototype = new RuleValueError();

