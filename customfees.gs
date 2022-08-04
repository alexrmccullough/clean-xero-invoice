// DEV NOTES
// FIX:
//    - Verify fee amounts are legal
//    - Need to maintain pointer to fee entry info at every step of the way so that we get descriptive return values; e.g. we know what fee is being applied.
//         - Convert dict array to tree lookup on Fee ID, then maintain link to fee id? Need to verify that all fee ids are unique



var EMPTYFIELD = "";

function CustomFees(appsetts) {
  this.appsetts = appsetts;
  this.appsetts.custfeeHeaders = {
    hkeyID: appsetts.get('CUSTFEE_HEADER_ID'),
    hkeyNote: appsetts.get('CUSTFEE_HEADER_NOTE'),
    hkeySrcType: appsetts.get('CUSTFEE_HEADER_SOURCETYPE'),
    hkeySrcVal: appsetts.get('CUSTFEE_HEADER_SOURCES'),
    hkeyTgtType: appsetts.get('CUSTFEE_HEADER_TARGETTYPE'),
    hkeyTgtVal: appsetts.get('CUSTFEE_HEADER_TARGETS'),
    hkeyFee: appsetts.get('CUSTFEE_HEADER_FEE'),
    hkeyStartDate: appsetts.get('CUSTFEE_HEADER_STARTDATE'),
    hkeyEndDate: appsetts.get('CUSTFEE_HEADER_ENDDATE')
  };

  
  // FIX: SHOULD THESES BE HERE OR ABOVE?  
  var rulesTreeSources = FCLib.nrToLookupTree (appsetts.get('CUSTFEE_NR_SRCTYPES'), this.appsetts.ss);
  this.appsetts.custFeeRulesSources = new XeroFieldRules (rulesTreeSources.tree, this.appsetts);
  
  var rulesTreeTargets = FCLib.nrToLookupTree (appsetts.get('CUSTFEE_NR_TGTTYPES'), this.appsetts.ss);
  this.appsetts.custFeeRulesTargets = new XeroFieldRules (rulesTreeTargets.tree, this.appsetts);
  
  var rulesTreeSalesEntries = FCLib.nrToLookupTree (appsetts.get('CUSTFEE_NR_SALESENTRYRULES'), this.appsetts.ss);
  this.appsetts.custFeeRulesSalesEntries = new XeroFieldRules (rulesTreeSalesEntries.tree, this.appsetts);
  
  
  var rawData = FCLib.tableToMapArray(
    FCLib.nrToTable(appsetts.get('CUSTFEE_NR_DATA'), this.appsetts.ss)
  );
    
  this.feeLookupTree = new FeeTree (this.appsetts);
   
  for (i=0; i<rawData.length; i++) {
    this.feeLookupTree.add(new FeeEntry(rawData[i], this.appsetts));
  }
  
  // FIX: FINISH
  
  this.findLowestCustomFee = function (salesEntry) {
    // Get sale list 
    var saleAmt = this.appsetts.custFeeRulesSalesEntries.evalRule('CUSTFEE_SALESENTRY_BASEAMT', salesEntry, null);
    
    // Get all applicable fee entries
    var feeEntries = this.feeLookupTree.eval(salesEntry);
    
    // Find minimum fee object
    var minObj = null;
    var minVal = 10000000000;      // Arbitrarily large number
    var curObj = null;
    
    for (i=0; i<feeEntries.length; i++) {
      curObj = feeEntries[i];
      if (curObj.calculate(saleAmt) <= minVal) {
        minObj = curObj;
      }
    }
    
    return minObj;
  }
}

function FeeEntry (entryRaw, appsetts) {
  this.id = entryRaw[appsetts.custfeeHeaders.hkeyID];
  this.srctype = entryRaw[appsetts.custfeeHeaders.hkeySrcType];
  this.srcval = entryRaw[appsetts.custfeeHeaders.hkeySrcVal];
  this.tgttype = entryRaw[appsetts.custfeeHeaders.hkeyTgtType];
  this.tgtval = entryRaw[appsetts.custfeeHeaders.hkeyTgtVal];
  this.fee = entryRaw[appsetts.custfeeHeaders.hkeyFee];
  this.startdate = entryRaw[appsetts.custfeeHeaders.hkeyStartDate];
  this.enddate = entryRaw[appsetts.custfeeHeaders.hkeyEndDate];
  this.note = entryRaw[appsetts.custfeeHeaders.hkeyNote];
}


function FeeTree (appsetts) {
  this.appsetts = appsetts;
  this.tree = {};
  
//  this.srcTypes = appsetts.custFeeRulesSources.getKeys();
//  this.srcTypes.push(EMPTYFIELD);
//    
//  for(i=0; i<this.srcTypes.length; i++) {
//    var srcType = this.srcTypes[i];
//    this.tree[srcType] = new SourceType(appsetts, ss, srcType, appsetts.custFeeRulesSources[srcType]);
//  }
  
//  this.add = function (srctype, srcval, tgttype, tgtval, fee, startdate, enddate) {
  this.add = function (feeEntry) {
//    if(srctype == EMPTYFIELD && srcval != EMPTYFIELD) { 
    if(feeEntry.id == EMPTYFIELD && feeEntry.srcval != EMPTYFIELD) {
      throw new Error();
    }
    if(feeEntry.tgttype == EMPTYFIELD && feeEntry.tgtval != EMPTYFIELD) {
      throw new Error();
    }
    
    var curtype = null;
    if(!this.tree.hasOwnProperty(feeEntry.srctype)) {
      curtype = new SourceType(
        this.appsetts, 
        feeEntry.srctype
      );
      this.tree[feeEntry.srctype] = curtype;
    }
    else{
      curtype = this.tree[feeEntry.srctype];
    }
    curtype.add(feeEntry);
  }
  
  this.eval = function (salesEntry) {
    var resultsDeep = [];
    
    for(i=0; i<this.types; i++){
      var type = types[i];
      resultsDeep.push( this.tree[type].eval(salesEntry) );
    }
    
    var results = FCLib.flatten(resultsDeep, null);
    return results;
  }
}
  
function SourceType (appsetts, srctype) {
  this.appsetts = appsetts;
  this.srctype = srctype;
  this.srcrule = appsetts.custFeeRulesSources.getRule(srctype);    
  this.cSourceVals = {};
  
  this.add = function (feeEntry) {
    if(!this.cSourceVals.hasOwnProperty(feeEntry.srcval)){
      this.cSourceVals[feeEntry.srcval] = new SourceVal(this.appsetts, feeEntry.srcval);
    }
    
    this.cSourceVals[feeEntry.srcval].add(feeEntry);
  };
  
  this.eval = function (salesEntry) {
    var entrySourceVal = this.srcrule.eval(salesEntry);
    if(this.cSourceVals.hasOwnProperty(entrySourceVal)){
      return this.cSourceVals[entrySourceVal].eval(salesEntry);
    }
    else {
      return null;
    }
  }
}
  
function SourceVal (appsetts, srcval) {
  this.appsetts = appsetts;
  this.srcval = srcval;
  this.cTgtTypes = {};
  this.typeKeys = [];
  
  this.add = function (feeEntry) {
    if (!this.cTgtTypes.hasOwnProperty(feeEntry.tgttype)){
      this.cTgtTypes[feeEntry.tgttype] = new TargetType(this.appsetts, feeEntry.tgttype);
      this.typeKeys.push(feeEntry.tgttype);
    }
    
    this.cTgtTypes[feeEntry.tgttype].add(feeEntry);
  };
  
  this.eval = function (salesEntry){
    var results = [];
    
    for(i=0; i<this.typeKeys.length; i++){
      var type = this.typeKeys[i];
      results.push( this.cTgtTypes[type].eval(salesEntry) );
    }
    
    return results;
  }
}
  
function TargetType (appsetts, tgttype){
  this.appsetts = appsetts;
  this.tgttype = tgttype;
  this.tgtrule = appsetts.custFeeRulesTargets.getRule(tgttype);
  this.cTgtVals = {};

  this.add = function (feeEntry) {
    if (!this.cTgtVals.hasOwnProperty(feeEntry.tgtval)){
      this.cTgtVals[feeEntry.tgtval] = new TargetVal(this.appsetts, feeEntry.tgtval);
    }
    
    this.cTgtVals[feeEntry.tgtval].add(feeEntry);
  };
  
  this.eval = function (salesEntry) {
    var entryTgtVal = this.tgtrule.eval(salesEntry);
    if(this.cTgtVals.hasOwnProperty(entryTgtVal)){
      return this.cTgtVals[entryTgtVal].eval(salesEntry);
    }
    else {
      return null;
    }
  }
}

function TargetVal (appsetts, tgtval){
  this.appsetts = appsetts;
  this.tgtval = tgtval;
  this.cFees = [];

  this.add = function (feeEntry) {
    this.cFees.push( new Fee(this.appsetts, feeEntry, feeEntry.fee, feeEntry.startdate, feeEntry.enddate) );
  }
  
  this.eval = function (salesEntry) {
    var results = [];
    for(i=0; i<this.cFees.length; i++){
      var feeObj = this.cFees[i];
      results.push( this.feeObj.eval(salesEntry) );
    }
    return results;
  }
}


function Fee (appsetts, feeEntry, fee, startdate, enddate){
  this.appsetts = appsetts;
  this.feeEntry = feeEntry;
  this.feeObj = null;
  this.startdate = feeEntry.startdate;
  this.enddate = feeEntry.enddate;

  var expFixedFee = /^\$([0-9]+(?:\.[0-9]+)?)$/;
  var expPercFee = /^(\d+(?:\.\d+)?)\%$/;
  
  if (this.feeEntry.fee.match(expFixedFee)){
    this.feeObj = new FeeFixed (this.feeEntry);
  }
  else if (this.feeEntry.fee.match(expPercFee)){
    this.feeObj = new FeePerc (this.feeEntry); 
  }
  else {
    // FIX!!
    throw new Error();
  }
  
  this.eval = function (salesEntry) {
    // Get date of entry, translate to commmon Date form
    var sEntryDate = this.appsetts.evalRule('SH_DELIV_DATE', salesEntry, null);
    var entryDate = Date.parse(sEntryDate);
    
    if(!validateDate(entrydate)) {
      return null;
    }

    return this.feeObj;
  }
  
  this.validateDate = function (d) {
    var pass1 = true;
    var pass2 = true;
    
    if(this.startdate && d < this.startdate){
      pass1 = false;
    }
    if(this.enddate && d > this.enddate){
      pass2 = false;
    }
    
    return pass1 && pass2;
  }
}



function FeeFixed (feeEntry) {
  this.type = 'fixed';
  this.feeEntry = feeEntry;
  this.val = Number(feeEntry.fee.replace(/[^0-9\.-]+/g,""));
  
  this.calculate = function (baseVal) {
    return this.val;
  }
  
  this.getFeeStr = function() {
    return this.feeEntry.fee; 
  }
}


function FeePerc (feeEntry) {
  this.type = 'perc';
  this.feeEntry = feeEntry;
  this.val = parseFloat(feeEntry.fee)/100.0;
  
  this.calculate = function (baseVal) {
    return baseVal * this.val; 
  }
  
  this.getFeeStr = function() {
    return this.feeEntry.fee; 
  }
}

