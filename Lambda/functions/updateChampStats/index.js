var request = require('request');
var sleep = require('system-sleep');
var AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var matchDataBase = "LOLStats_NAMatches";
var champDataBase = 'LOLStats_NAChampionStats';
var userDataBase = "LOLStats_User";
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };

var pkMatches = [];
var newData = [];

var paramsMatches = {
  TableName: matchDataBase
};

// var params = {
//   TableName: matchDataBase,
//   ProjectionExpression: "gameId, gameDuration, gameVersion, participants, queueId, seasonId, teams",
//   FilterExpression: "analyzed.champStats <> :bool",
//   ExpressionAttributeValues: {
//       ":bool": true
//   }
// };

var params = {
  TableName: champDataBase
};

// Getting New Data
var scanExecute = function()
{
  docClient.scan(paramsMatches, function onScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        newData = newData.concat(data.Items);
        // if(data.LastEvaluatedKey)
        // {
        //   paramsMatches.ExclusiveStartKey = data.LastEvaluatedKey;
        //   scanExecute();
        // }
        // else
        // {
          storeChampionStats(newData);
        // }
    }
  });
}

// Getting Current Data
docClient.scan(params, function onScan(err, data) {
  if (err) {
      console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
      callback(err);
  } else {
      console.log("Pulled past stats");
      pkMatches = data.Items;
      scanExecute();
  }
});

function storeChampionStats(matches) {

  console.log("Processing " + matches.length + " matches");

  matches.forEach(function(curMatch){
    var found = false;

    // Fixing patch number
    var firstDot = curMatch.gameVersion.indexOf(".") + 1;
    var secondDot = curMatch.gameVersion.indexOf(".", firstDot);
    curMatch.gameVersion = curMatch.gameVersion.substring(0, secondDot);

    pkMatches.forEach(function(pkMatch){
      if (curMatch.gameVersion == pkMatch.patch && curMatch.queueId == pkMatch.queueId)
      {
        updateMatch(pkMatch, curMatch);
        found = true;
      }
    });

    // IF NOT FOUND
    if(!found)
    {
      addMatch(pkMatches, curMatch);
    }
    else
    {
      //console.log("found: " + match.gameVersion);
    }
  });

  addChampionStats(pkMatches);
  console.log("");

}

function addMatch(pkMatches, curMatch)
{
  var game = {};
  game.patch = curMatch.gameVersion;
  game.queueId = curMatch.queueId;
  game.overall = {};
  game.overall.duration = {};
  game.overall.duration.totalTime = curMatch.gameDuration;
  game.overall.duration.totalGames = 1;
  game.overall.bans = {};
  game.overall.lanes = {};

  curMatch.teams.forEach(function(team){
    team.bans.forEach(function(ban){
      game.overall.bans["c"+ban.championId] = {}
      game.overall.bans["c"+ban.championId].championId = ban.championId;
      game.overall.bans["c"+ban.championId].counter = 1;
    });
  });

  curMatch.participants.forEach(function(player){
    var theLane = "";
    if(player.timeline.role == "DUO_SUPPORT" || player.timeline.role == "SUPPORT")
    {
      theLane = "SUPPORT"
    }
    else
    {
        theLane = player.timeline.lane;
    }

    game.overall.lanes[theLane] = {};

    var champInfo = {};
    champInfo.championId = player.championId;
    champInfo.counter = 1;

    if(player.stats.win)
    {
      champInfo.wins = 1;
    }
    else
    {
      champInfo.wins = 0;
    }

    game.overall.lanes[theLane]["c"+champInfo.championId] = champInfo;
  });

  pkMatches.push(game);
  //console.log("NO: " + match.gameVersion);
}

function updateMatch(pkMatch, curMatch)
{
  pkMatch.overall.duration.totalTime += curMatch.gameDuration;
  pkMatch.overall.duration.totalGames += 1;

  curMatch.teams.forEach(function(team){
    team.bans.forEach(function(tBan){

      if(pkMatch.overall.bans["c"+tBan.championId])
      {
        pkMatch.overall.bans["c"+tBan.championId].counter += 1;
        banFound = true;
      }
      else
      {
        pkMatch.overall.bans["c"+tBan.championId] = {};
        pkMatch.overall.bans["c"+tBan.championId].championId = tBan.championId;
        pkMatch.overall.bans["c"+tBan.championId].counter = 1;
      }
    });
  });

  curMatch.participants.forEach(function(player){
    var theLane = "";
    if(player.timeline.role == "DUO_SUPPORT" || player.timeline.role == "SUPPORT")
    {
      theLane = "SUPPORT";
    }
    else
    {
        theLane = player.timeline.lane;
    }

    var champFound = false;
    if(theLane in pkMatch.overall.lanes && pkMatch.overall.lanes[theLane]["c"+player.championId])
    {
          champFound = true;
          pkMatch.overall.lanes[theLane]["c"+player.championId].counter += 1;

          if(player.stats.win)
          {
            pkMatch.overall.lanes[theLane]["c"+player.championId].wins += 1;
          }
    }
    if(!champFound)
    {
      var theLane = "";
      if(player.timeline.role == "DUO_SUPPORT" || player.timeline.role == "SUPPORT")
      {
        theLane = "SUPPORT";
      }
      else
      {
          theLane = player.timeline.lane;
      }

      if(!(theLane in pkMatch.overall.lanes))
      {
        pkMatch.overall.lanes[theLane] = [];
      }

      var champInfo = {};
      champInfo.championId = player.championId;
      champInfo.counter = 1;

      if(player.stats.win)
      {
        champInfo.wins = 1;
      }
      else
      {
        champInfo.wins = 0;
      }

      pkMatch.overall.lanes[theLane]["c"+champInfo.championId] = champInfo;
    }
  });
}

function addChampionStats(packagedMatches)
{
  packagedMatches.forEach(function(match){
    var params = {
    TableName: champDataBase,
    Key:{
        "patch": match.patch,
        "queueId": match.queueId
    },
    UpdateExpression: "set #overall = :overall",
    ExpressionAttributeNames: {
      "#overall": "overall"
    },
    ExpressionAttributeValues:{
        ":overall": match.overall
    },
        ReturnValues:"UPDATED_NEW"
    };

    docClient.update(params, function (err, data) {
      // Adding if can't update
      if (err) {
        console.log(JSON.stringify(err));
          var params = {
              TableName:champDataBase,
              Item:{
                "patch": match.patch,
                "queueId": match.queueId,
                "overall": match.overall
              }
          };
          docClient.put(params, function(err, data) {
              if (err) {
                  console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
              } else {
                  //console.log("Added item:", JSON.stringify(data, null, 2));
              }
          });
      } else {
          console.log("UpdateItem succeeded:");
      }
    });
  });
}
