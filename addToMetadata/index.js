var request = require('request');
var sleep = require('system-sleep');
var AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var matchDataBase = "LOLStats_NAMatches";
var champDataBase = 'LOLStats_NAChampionStats';
var metaDataBase = "LOLStats_NAMetadata";
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };

var metadata = [];
var newData = [];
var champStats = [];

var matchParams = {
  TableName: matchDataBase
};

var params = {
    TableName: metaDataBase,
    Key:{
        meta: "allMatches"
    }
};

// Getting New Data
var scanExecute = function()
{
  docClient.scan(matchParams, function onScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        newData = newData.concat(data.Items);
        if(data.LastEvaluatedKey)
        {
          matchParams.ExclusiveStartKey = data.LastEvaluatedKey;
          sleep(55);
          scanExecute();
        }
        else
        {
          storeChampionStats(newData);
        }
    }
  });
}

scanExecute();

function storeChampionStats(matches) {

  console.log("Processing " + matches.length + " matches");

  matches.forEach(function(curMatch){
    metadata.push(curMatch.gameId);
    if(!("analyzed" in curMatch))
    {
      champStats.push(curMatch.gameId);
    }
  });

  var params1 = {
  TableName: metaDataBase,
  Key:{
      "meta": "allMatches"
  },
  UpdateExpression: "set #matchIds = :matches",
  ExpressionAttributeNames: {
    "#matchIds": "matchIds"
  },
  ExpressionAttributeValues:{
      ":matches": metadata
  },
      ReturnValues:"UPDATED_NEW"
  };

  docClient.update(params1, function (err, data) {
    // Adding if can't update
    if (err) {
      console.log(JSON.stringify(err));
    } else {
        console.log("Updated allMatches");
    }
  });

  var params2 = {
  TableName: metaDataBase,
  Key:{
      "meta": "champWinRates"
  },
  UpdateExpression: "set #matchIds = :matches",
  ExpressionAttributeNames: {
    "#matchIds": "matchIds"
  },
  ExpressionAttributeValues:{
      ":matches": champStats
  },
      ReturnValues:"UPDATED_NEW"
  };

  docClient.update(params2, function (err, data) {
    // Adding if can't update
    if (err) {
      console.log(JSON.stringify(err));
    } else {
        console.log("Updated Champ Win Rates");
    }
  });
}
