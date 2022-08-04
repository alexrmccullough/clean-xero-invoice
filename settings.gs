/////////////// CLASSES /////////////////////////////
function AppSettings () {
  this.bsGenSettingRangeKeys = ['BS_SS_UNIV_GENSETTINGS_NR', 'BS_SS_H2MXERO_GENSETTINGS_NR', 'NR_CUSTFEE_GENSETTINGS'];

  this.doBootstrap = function () {
    var ss = SpreadsheetApp.openById(this.get('BOOTSTRAP_FILEID'));
    var sheet = ss.getSheets()[0];
    var table = FCLib.trimTable(sheet.getDataRange().getValues());                   // Should be 2 col x ? rows
    FCLib.joinDicts (this.settingsGen, FCLib.tableToDict(table, 0)); 
  }  
  
  this.get = function (settingID) {
    var result = this.settingsGen[settingID];
    if (result == null) {
      throw new FatalSettingsError ('Script setting name not recognized: ' + settingID); 
    }
    return result;
  };
  
  this.set = function (settingID, value) {
    this.settingsGen[settingID] = value;
    return this.settingsGen;
  };
  
  this.readSettingsGen = function () {
    for (var i=0; i<this.bsGenSettingRangeKeys.length; i++) {
      var table = FCLib.nrToTable (this.get(this.bsGenSettingRangeKeys[i]), this.ss);
      this.settingsGen = FCLib.joinDicts (this.settingsGen, FCLib.tableToDict(table, 0));
    }
  };
  
//  this.nrToTable = function (rangeName, ss) {
//    var range = ss.getRangeByName(rangeName);
//    return FCLib.trimTable(range.getValues());
//  };
//  
//  this.nrToLookupTree = function (rangeName, ss) {
//    var lookupExp = /^\*((?:\w|\s)+)$/;
//    var table = this.nrToTable (rangeName);
//    var headers = table[0];
//    var lookupHeaders = [];
//    for (var i=0; i<headers.length; i++) {
//      var h = headers[i];
//      var match = h.match(lookupExp);
//      if (match) {
//        lookupHeaders.push(match[0]);
//      }
//    }
//    return {
//      lookupHeaders: lookupHeaders,
//      tree: FCLib.tableToLookupTreeByHeaders (table, lookupHeaders)
//    };
//  };
  
  this.salesDataLookup = function (salesData, shHeader) {
    var fieldName = this.treeLookup('LT_H2MSALESENTRYHEADERS', [shHeader]);
    if (!fieldName) {
      throw new FatalSettingsError(
        "Setting not found by setting ID \"" + shHeader + "\"" +
        "   Sales data entry: " + JSON.stringify(salesData)
      );
    }
    
    var result = salesData[fieldName];
    if (result == null) {
      throw new SalesDataLookupError(fieldName, salesData);
    }
    
    return result;
  };
  
  
  this.evalAllXeroInvoiceRules = function (salesEntry) {
    var xeroEntry = this.xeroRulesInvoices.evalAllRules (salesEntry);
    return xeroEntry;
  };
  
  this.evalAllXeroBillRules = function (salesEntry) {
    var xeroEntry = this.xeroRulesBills.evalAllRules (salesEntry);
    return xeroEntry;
  };
  
  this.treeLookup = function (tableName, headers) {
    var result;
    if (!Array.isArray(headers)) {
      throw new TypeError ('Expecting arg #2 (headers) to be of type Array');
    }
    try {
      result =  FCLib.searchTree (this.lookupTrees[tableName].tree, headers);
    }
    catch (e) {
      if (e instanceof FCLib.TreeSearchNotFoundError) {
        throw new SettingTreeLookupError (tableName, headers, e.failKey);
      }
      else {
        throw e;
      }
    }
    return result;
  };
  
  this.lookupSalesHeader = function (key) {
    return this.treeLookup('LT_H2MSALESENTRYHEADERS', [key]);
  }
  
  this.lookupDynamicSalesHeader = function (key) {
    return this.treeLookup('LT_DYNSALESHEADERS', [key]);  
  }
  
  this.getXeroInvoiceRules = function() {
    return this.xeroRulesInvoices;
  }
  
  this.getXeroBillRules = function() {
    return this.xeroRulesBills;
  }
  
  this.getVendorInvoicesDirectYesResp = function () {
    return this.treeLookup('LT_VENDORINFOHEADERS', ['VENDOR_INVOICES_DIRECTLY_YES']); 
  }
                     
  //
  // CONSTRUCTOR ROUTINE
  // 
  this.settingsGen = {};
  this.lookupTrees = {};
  this.set('BOOTSTRAP_FILEID', "1lhNwJQ_TwFKFPjuuVVdh17armb8LCqgTV2k3e_oV7Xo");
  this.doBootstrap();

  this.ss = SpreadsheetApp.openById(this.get('BS_SS_FILEID'));
  this.readSettingsGen();
  
  // Build settings lookup tables by matching General Settings against lookup table expression 
  var lookupTableNameExp = /^LT_\w+$/;
  var keys = Object.keys(this.settingsGen);
  
  for (var i=0; i<keys.length; i++) {
    var key = keys[i];
    var match = key.match(lookupTableNameExp);
    if (match) {
      this.lookupTrees[key] = FCLib.nrToLookupTree(this.get(key), this.ss);
    }
  }
 
  Logger.log('settings lookups done: ' + new Date());
  
  // Build Xero import table rules
  var xeroRulesTreeInvoices = FCLib.nrToLookupTree (this.get('RULES_XERO_INVOICES'), this.ss);
  var xeroRulesTreeBills = FCLib.nrToLookupTree (this.get('RULES_XERO_BILLS'), this.ss);
  this.xeroRulesInvoices = new XeroFieldRules (xeroRulesTreeInvoices.tree, this);
  this.xeroRulesBills = new XeroFieldRules (xeroRulesTreeBills.tree, this);
  
  return this;
};

function SettingTreeLookupError (tableName, headers, failLevel, msg) { 
  this.toString = function () {
    return (this.name + ": TABLE: " + tableName + ", HEADERS:" + JSON.stringify(headers) +
      ", FAILED AT: " + JSON.stringify(failLevel)
      );
  }
  
  this.name = 'SettingTreeLookupError';
  this.message = (msg || "");
  this.tableName = tableName;
  this.headers = headers;
  this.failLevel = failLevel;
  const err = Error();
  this.stack = err.stack;
}
  
function SalesDataLookupError (key, salesData) { 
  this.toString = function () {
    return ("Key \"" + this.key + "\" not present in sales data entry: " + JSON.stringify(this.salesData));
  }
  
  this.name = 'SalesDataLookupError';
  this.key = key;
  this.salesData = salesData;
  const err = Error();
  this.stack = err.stack;
}



function FatalSettingsError (message) {
  this.toString = function () {
    return (this.name + ': ' + this.message); 
  }
  this.name = 'FatalSettingsError';
  this.message = message;

}



