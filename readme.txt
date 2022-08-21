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