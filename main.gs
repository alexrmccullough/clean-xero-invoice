
function go() {
  var startTime = new Date();
  Logger.log(startTime);
  var appSettings = new AppSettings();
  Logger.log('settings done: ' + new Date());
  var custFees = new CustomFees(appSettings);
  
  var csvImport = FCLib.importCSVstoTable(appSettings.get('INPUT_FID')); 
  if (!csvImport) {
    throw new Error("No CSVs found in input folder."); 
  }
  
  var salesTable = csvImport.table;
  var salesDicts = FCLib.tableToMapArray(salesTable, true);
   
  var errors = [];
  var xeroInvoiceEntries = [];
  var xeroBillEntries = [];
  var xeroBillPaidDirectEntries = [];
  
  var transTypeHeader = appSettings.lookupDynamicSalesHeader('DYN_SH_TRANSTYPE');
  var transTypeInvoiceOverride = {};
  var transTypeBillOverride = {};

  // Variables for special xeroEntry edits
  var hSalePrice = appSettings.get('XH_PRICE');
  var hVendorName = appSettings.get('XH_VENDOR_NAME');
  var hDefaultVendorRate = appSettings.get('XH_DEF_VENDOR_CUT');
  var hCustomVendorRate = appSettings.get('XH_CUST_VENDOR_CUT');
  var hVendorDirectBill = appSettings.get('XH_VENDOR_INVOICES_DIRECT');
  var valVendorDirectBillYes = appSettings.getVendorInvoicesDirectYesResp();
  
  // Override values for entry Transaction Type
  transTypeInvoiceOverride[transTypeHeader] = appSettings.lookupDynamicSalesHeader('DYN_SH_TRANSTYPE_INVOICE');
  transTypeBillOverride[transTypeHeader] = appSettings.lookupDynamicSalesHeader('DYN_SH_TRANSTYPE_BILL');

  for ( var i=0; i<salesDicts.length; i++ ) {
    var salesEntry = salesDicts[i];
    var rulesInvoices = appSettings.getXeroInvoiceRules();
    var rulesBills = appSettings.getXeroBillRules();
    var rulesInvoicesKeys = rulesInvoices.getKeys();
    var rulesBillsKeys = rulesBills.getKeys();
    
    var xeroInvoiceEntry = {};
    var xeroBillEntry = {};
    var invEntrySuccess = true;
    var billEntrySuccess = true;
    var paidDirect = false;
   
    // Invoicing
    for (var j=0; j<rulesInvoicesKeys.length; j++) {
      var key = rulesInvoicesKeys[j];
      try {
        // DEBUG
        if(key == "*Description"){
          var q;
        }
        xeroInvoiceEntry[key] = rulesInvoices.evalRule(key, salesEntry, transTypeInvoiceOverride);
      }
      catch (e) {
        if (e instanceof SettingTreeLookupError) {
          errors.push(e.toString());
          invEntrySuccess = false;
          break;
        }
        else {
          errors.push(e.toString());
          invEntrySuccess = false;
          break;  
          // throw e;  // FIX: GIVE BETTER FEEDBACK ON ERROR e.g. malformed rule
        }
      }
    }
    
    if (invEntrySuccess) { 
      xeroInvoiceEntries.push(xeroInvoiceEntry) 
    };  
    
    // Billing
    for (var k=0; k<rulesBillsKeys.length; k++) {
      var key = rulesBillsKeys[k];
      try {
        xeroBillEntry[key] = rulesBills.evalRule(key, salesEntry, transTypeBillOverride);
      }
      catch (e) {
        if (e instanceof SettingTreeLookupError) {
          errors.push(e.toString());
          billEntrySuccess = false;
          break;
        }
        else {
          errors.push(e.toString());
          billEntrySuccess = false;
          break;
        }
      }
    }
    
    if (billEntrySuccess) {
      // Perform special operations on xeroBillEntry before pushing 
      // 1) Determine whether we should bill for this entry, or whether we pay this vendor by direct invoice
      //    If the latter, add it to xeroBillPaidDirectEntries
      var paidDirect = (xeroBillEntry[hVendorDirectBill] == valVendorDirectBillYes);
      
      // 2) Multiply price by vendor rate to get final price owed to vendor
      var fVendorCut;
      var fDefaultVendorRate;
      var fSalePrice;
      var defaultVendorRate = xeroBillEntry[hDefaultVendorRate];
      var salePrice = xeroBillEntry[hSalePrice];
      var fDefaultFee;
      var oCustomFee;
      var fCustomFee;
      var fCustomVendorCut;

      // If no vendor rate available in settings, it's only a problem if we have to calculate their cut on sales.
      //   Otherwise, if they are paid direct, just set the payment to $0 and continue. 
      if (!defaultVendorRate) {
        if (paidDirect) {
          fVendorCut = 0;
        }
        else{
          var vendorName = xeroBillEntry[hVendorName];
          throw new VendorDataError ('Vendor ' + vendorName + ' supposedly paid by FC-calculated cut on sales, but no sales rate available in settings. Terminating.');  
        }
      }
      else {      
        fDefaultVendorRate = parseFloat(defaultVendorRate);
        fSalePrice = parseFloat(salePrice);
        fVendorCut = fDefaultVendorRate * fSalePrice;

//        // Look for custom fee; compare to default vendor rate; use whichever vendor cut (default vs. custom) is higher.
//        fDefaultFee = fSalePrice - fDefaultVendorRate;    
//        oCustomFee = custFees.findLowestCustomFee(salesEntry);
//        if (oCustomFee) {
//          fCustomFee = oCustomFee.calculate(fSalePrice);
//          fCustomVendorCut = fSalePrice - fCustomFee;
//          if (fCustomVendorCut > fVendorCut) {
//            fVendorCut = fCustomVendorCut;
//            xeroBillEntry[hCustomVendorRate] = oCustomFee.getFeeStr();
//          }
//        }
      }
      
      xeroBillEntry[hSalePrice] = fVendorCut.toString();
           
      // Add the sale to the appropriate billing list
      if (paidDirect) {
        xeroBillPaidDirectEntries.push(xeroBillEntry);
      }
      else {
        xeroBillEntries.push(xeroBillEntry);
      }
    }
  
  }
  Logger.log('initial lookups done: ' + new Date());
  
  // Sanity check
  //   Does # of input sales entries match output?
  var numInputEntries = salesDicts.length;
  var numErrors = errors.length / 2;
  var numInvOutputEntries = 
      xeroInvoiceEntries.length + 
        numErrors;
  var numBillOutputEntries = 
      xeroBillEntries.length + 
        xeroBillPaidDirectEntries.length + 
          numErrors;
  
  if (numInputEntries != numInvOutputEntries) {
    throw new Error("Number of input entries != number of output INVOICE entries. Terminating. Input=" + 
                    numInputEntries + ", Output:" + numInvOutputEntries); 
  }
  if (numInputEntries != numBillOutputEntries) {
    throw new Error("Number of input entries != number of output BILLING entries. Terminating. Input=" +  
                    numInputEntries + ", Output:" + numBillOutputEntries); 
  }
  
  // Write result files
  // 1) Create output directory with unique name based on start time.
  var prettyDateTime = Utilities.formatDate(startTime, 'EST', "EE_yyyy.MM.dd_HH'h'mm'm'ss's'");

  var drvOutDump = FCLib.drvGetFolder(appSettings.get('OUTPUT_FID'));
  var outFolderName = appSettings.get('OUT_FOLDER_PREFIX') + prettyDateTime;
  var drvOutFolder = FCLib.drvMakeFolder(drvOutDump, outFolderName);
  if (!drvOutFolder) {
    throw new Error('Out folder ' + outFolderName + ' could not be created! Terminating.');
  }

  // 2) Prepare output data tables
  var tXeroInvoiceEntries;
  var tXeroBillEntries;
  var tXeroBillPaidDirectEntries;
  
  if(xeroInvoiceEntries.length > 0){ tXeroInvoiceEntries = FCLib.dictArrayToTable (xeroInvoiceEntries); }
  if(xeroBillEntries.length > 0){ tXeroBillEntries = FCLib.dictArrayToTable (xeroBillEntries); }
  if(xeroBillPaidDirectEntries.length > 0){ tXeroBillPaidDirectEntries = FCLib.dictArrayToTable (xeroBillPaidDirectEntries); }
  var tErrors = FCLib.transposeArrayToCol(FCLib.aUnique(errors));
  
  // 3) Prepare for file creation
  var outTypeIsSheet = appSettings.get('OUT_FILETYPE') == 'sheet' || false;
  var suppress = appSettings.get('SUPPRESS_DATA_W_ERRORS') == 'yes' || false;
  var haveErrors = numErrors > 0 || false;
  var createdFiles = [];
  
  // 4) If OUT_FILETYPE == 'sheet', create our single output Spreadsheet
  // Then create sheets in new spreadsheet for required output
  //    If we encountered errors, output only the errors. Do not output successful data.
  //    Errors need to be corrected in settings before we can output final data.
  //  numErrors = 0; 
  // If OUT_FILETYPE != 'sheet', then we write to individual CSV files instead. 
  var outSS = instantiateOutSS(appSettings, outTypeIsSheet, drvOutFolder)
  // if (outTypeIsSheet) {
  //   outSS = FCLib.drvMakeSpreadsheet(drvOutFolder, appSettings.get('OUT_SS_NAME'));
  //   createdFiles.push(outSS);
  // }
    
  if (haveErrors) {
    errorOut = writeErrors(appSettings, tErrors, outTypeIsSheet, outSS, drvOutFolder);
    if (outTypeIsSheet){
      var sheetErrors = errorOut;
    }
    else{
      createdFiles.push(errorOut);
    }
    // var sNameErrors = appSettings.get('OUT_SHEETNAME_ERRORS');
    
    // if (outTypeIsSheet) {
    //   var sheetErrors = FCLib.drvInsertSheet(outSS, sNameErrors, 1, tErrors, true);
    // }
    // else{
    //   var csvErrors = FCLib.writeTableToFile(tErrors, drvOutFolder, sNameErrors + '.csv');
    //   createdFiles.push(csvErrors);
    // }
  }

  if (!haveErrors || haveErrors && !suppress) {
    var sNameInvoices = appSettings.get('OUT_SHEETNAME_INVOICES'); 
    var sNameBills = appSettings.get('OUT_SHEETNAME_BILLS');
    var sNameBillsNoPay = appSettings.get('OUT_SHEETNAME_BILLSNOPAY');
    
    if (outTypeIsSheet) {
      var firstSheetIndex = haveErrors ? 0 : 1;
      var overwriteFirstSheet = !haveErrors;
      
      var sheetInvoices = FCLib.drvInsertSheet(outSS, sNameInvoices, firstSheetIndex, tXeroInvoiceEntries, overwriteFirstSheet);
      var sheetBills = FCLib.drvInsertSheet (outSS, sNameBills, 0, tXeroBillEntries);
      var sheetBillsNoPay = FCLib.drvInsertSheet(outSS, sNameBillsNoPay, 0, tXeroBillPaidDirectEntries);
    }
    else{
      var csvInvoices = FCLib.writeTableToFile(tXeroInvoiceEntries, drvOutFolder, sNameInvoices + '.csv');
      var csvBills = FCLib.writeTableToFile(tXeroBillEntries, drvOutFolder, sNameBills + '.csv');
      var csvBillsNoPay = FCLib.writeTableToFile(tXeroBillPaidDirectEntries, drvOutFolder, sNameBillsNoPay + '.csv');
      createdFiles.push(csvInvoices);
      createdFiles.push(csvBills);
      createdFiles.push(csvBillsNoPay);
    }
  }

  // 2) Create subfolder for archiving input files, then move files
  var inputFilesOutFolderName = appSettings.get('OUT_INPUT_ARCHIVE_NAME');
  var inputFilesOutFolder = FCLib.drvMakeFolder(drvOutFolder, inputFilesOutFolderName);
  if (!inputFilesOutFolder) {
    throw new Error('Input archive output folder ' + inputFilesOutFolderName + ' could not be created! Terminating.');
  } 
  
  var csvFids = csvImport.fids;
  var srcFolder = csvImport.srcFolder;
  for (var i=0; i<csvFids.length; i++) {
    var file = FCLib.drvCopyFile(csvFids[i], inputFilesOutFolder);
    if (appSettings.get('DELETE_INPUTDATA') == 'yes') {
      srcFolder.removeFile(file);  
    }
  }
    
  var results = {
    haveErrors: haveErrors,
    outFolderUrl: drvOutFolder.getUrl(),
  };
  
  var files = {};
  for (var i=0; i<createdFiles.length; i++) {
    var file = createdFiles[i];
    files[i] = {
      name: file.getName(),
      url: file.getUrl()
    };
  }
  results['files'] = files;
  return results;
}

function instantiateOutSS(appSettings, outTypeIsSheet, drvOutFolder){
    var outSS;
    if (outTypeIsSheet) {
      outSS = FCLib.drvMakeSpreadsheet(drvOutFolder, appSettings.get('OUT_SS_NAME'));
    // createdFiles.push(outSS);
    }
    return outSS;
}

function writeErrors(appSettings, tErrors, outTypeIsSheet, outSS, drvOutFolder){
    var sNameErrors = appSettings.get('OUT_SHEETNAME_ERRORS');
    
    if (outTypeIsSheet) {
      var sheetErrors = FCLib.drvInsertSheet(outSS, sNameErrors, 1, tErrors, true);
      return sheetErrors;
    }
    else{
      var csvErrors = FCLib.writeTableToFile(tErrors, drvOutFolder, sNameErrors + '.csv');
      // createdFiles.push(csvErrors);
      return csvErrors;
    }

}

function handleMidstreamErrors(appSettings, tErrors, outTypeIsSheet, drvOutFolder){
  var outSS = instantiateOutSS(appSettings, outTypeIsSheet, drvOutFolder);
  return writeErrors(appSettings, tErrors, outTypeIsSheet, outSS, drvOutFolder);
}

function VendorDataError (message) {
  this.toString = function () {
    return (this.name + ': ' + this.message); 
  }
  this.name = 'VendorDataError';
  this.message = message;

}

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('script_results'); 
  return template.evaluate();
}
