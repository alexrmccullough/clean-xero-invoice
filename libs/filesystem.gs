function drvGetFolder (driveFID) {
  return DriveApp.getFolderById(driveFID); 
}

function drvCopyFile (fileID, destFolderObj) {
  var file = DriveApp.getFileById(fileID);
  // var folder = destFolderObj.addFile(file);
  file.makeCopy(destFolderObj);
  return file;
}


function drvMakeFolder (folderObj, foldName) {
  var folditer = folderObj.getFoldersByName(foldName);
  if (folditer.hasNext()) {
    return false;
  }
  
  return folderObj.createFolder(foldName);
}

function drvMakeSpreadsheet (folderObj, ssName) {
  var ss = SpreadsheetApp.create (ssName);
  var f = DriveApp.getFileById(ss.getId());
  folderObj.addFile(f);
  DriveApp.removeFile(f); 
  return ss;
}

/**
 * Wrapper for Spreadsheet.insertSheet() method to support customization.
 * All parameters are optional & positional.
 *
 * @param (Spreadsheet) ss        Obj reference to existing Google Spreadsheet
 * @param {String}  sheetName     Name of new sheet (defaults to "Sheet #")
 * @param {Number}  sheetIndex    Position for new sheet (default 0 means "end")
 * @param {Number}  rows          Vertical dimension of new sheet (default 0 means "system default", 1000)
 * @param {Number}  columns       Horizontal dimension of new sheet (default 0 means "system default", 26)
 * @param {String}  template      Name of existing sheet to copy (default "" means none)
 *
 * @returns {Sheet}               Sheet object for chaining.
 */
function drvInsertSheet( ss, sheetName, sheetIndex, table, overwriteSheet ) {
  // Check parameters, set defaults
  var sheets = ss.getSheets();
  var numSheets = sheets.length;
  overwriteSheet = overwriteSheet || false;
  
  if ((!sheetIndex || sheetIndex > numSheets) && overwriteSheet) {
    throw new Error ('Cannot overwrite sheet without valid sheet index to overwrite.');
  }
  sheetIndex = sheetIndex || (numSheets + 1);
  sheetName = sheetName || "Sheet " + sheetIndex;
  
  var rows = table.length;
  var columns = table[0].length;
   
  var newSheet;
  
  if (overwriteSheet) {
    newSheet = sheets[sheetIndex-1];  
    newSheet.setName(sheetName)
  }
  
  else {
    var newSheet = ss.insertSheet(sheetName, sheetIndex);
  }

  if (rows !== 0) {
    // Adjust dimension: rows
    var newSheetRows = newSheet.getMaxRows();

    if (rows < newSheetRows) {
      // trim rows
      newSheet.deleteRows(rows+1, newSheetRows-rows);
    }
    else if (rows > newSheetRows) {
      // add rows
      newSheet.insertRowsAfter(newSheetRows, rows-newSheetRows);
    }
  }

  if (columns !== 0) {
    // Adjust dimension: columns
    var newSheetColumns = newSheet.getMaxColumns();
    
    if (columns < newSheetColumns) {
      // trim rows
      newSheet.deleteColumns(columns+1, newSheetColumns-columns);
    }
    else if (columns > newSheetColumns) {
      // add rows
      newSheet.insertColumnsAfter(newSheetColumns,columns-newSheetColumns);
    }
  }

  var rng = newSheet.getRange(1, 1, rows, columns);
  rng.setValues(table);  
  
  // Return new Sheet object
  return newSheet;
}

function importCSVstoTable(drive_fid) {
  // source: https://stackoverflow.com/questions/26854563/how-to-automatically-import-data-from-uploaded-csv-or-xls-file-into-google-sheet
  
  var fSource = DriveApp.getFolderById(drive_fid); // reports_folder_id = id of folder where csv reports are saved
  var fi = fSource.getFilesByType(MimeType.CSV)
  var fids = [];
  var fobjs = [];
  var comboData = [];
  var comboHeaders = [];
  
  while ( fi.hasNext() ) { 
    //  if ( fi.hasNext() ) { // proceed if "report.csv" file exists in the reports folder
    var file = fi.next();
    fids.push(file.getId());
    fobjs.push(file);
    var csvData = Utilities.parseCsv(file.getBlob().getDataAsString(), ",");
    var headers = csvData.shift();   // Also removes the headers line so all we save is order data
    
    // Compare header array against other files'. If there are any differences, then we have inconsistent
    // input files and need to break. 
    if(comboHeaders.length === 0)
      comboHeaders = headers;
    
    else if(!isEquivalent(headers, comboHeaders)){
      var msg = "CSV headers do not match:" + headers.join() + "\n" + comboHeaders.join();
      Logger.log(msg);
      throw new Error(msg);
    }
    
    comboData = comboData.concat(csvData);                     
  }
  
  if(comboData.length <= 0) {
    return false;
  }
  
  comboData.unshift(comboHeaders);
  return {
    table: comboData,
    fids: fids,
    fobjs: fobjs,
    srcFolder: fSource
  };
//  return { headers: comboHeaders, data: comboData };
};


function writeTableToFile (table, folderObj, outFileName) {
  var build = [];
  var csv = "";
  const quoteExp = /"/;
  
  // loop through the data in the range and build a string with the csv data
  if (table) {
    for (var row = 0; row < table.length; row++) {
      for (var col = 0; col < table[row].length; col++) {
        var val = table[row][col].toString();
        val = val.replaceAll('"', '""');
        if (val.indexOf(",") != -1) {
          table[row][col] = '"' + val + '"';
        }
      }
       
      build[row] = table[row].join(",");
    }
    
    csv = build.join("\r\n");
  }
  
  var newFile = folderObj.createFile(outFileName, csv);
  return newFile;
}

