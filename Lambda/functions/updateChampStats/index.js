var request = require('request');
var sleep = require('system-sleep');
var AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var matchDataBase = "LOLStats_NAMatches";
var champDataBase = 'LOLStats_NAChampionStats';
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };



var params = {
  TableName: matchDataBase,
  ProjectionExpression: "gameId, gameDuration, gameVersion, participants, queueId, seasonId, teams",
  FilterExpression: "analyzed.champStats <> :bool",
  ExpressionAttributeValues: {
      ":bool": true
  }
};

docClient.scan(params, function onScan(err, data) {
  if (err) {
      console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
      callback(err);
  } else {
      console.log("Scan succeeded.");
      storeChampionStats(data.Items);
  }
});


function storeChampionStats(matches) {

  var pkMatches = [];

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
      addMatch(pkMatch, curMatch);
    }
    else
    {
      //console.log("found: " + match.gameVersion);
    }
  });

  //addChampionStats(packagedMatches);
  console.log("");

}

function asdf()
{
  var game = {};
  game.patch = match.gameVersion;
  game.queueId = match.queueId;
  game.duration = {};
  game.duration.totalTime = match.gameDuration;
  game.duration.totalGames = 1;
  game.bans = [];
  game.lanes = {};

  match.teams.forEach(function(team){
    team.bans.forEach(function(ban){
      if(checkChampionBanned(ban.championId, match.teams))
      {
        var theBan = {};
        theBan.championId = ban.championId;
        theBan.counter = 1;
        bans.push(theBan);
      }
    });
  });

  match.participants.forEach(function(player){
    var theLane = "";
    if(player.timeline.role == "DUO_SUPPORT" || player.timeline.role == "SUPPORT")
    {
      theLane = "SUPPORT"
    }
    else
    {
        theLane = player.timeline.lane;
    }

    game.lanes[theLane] = [];

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

    game.lanes[theLane].push(champInfo);
  });

  packagedMatches.push(game);
  //console.log("NO: " + match.gameVersion);
}

function updateMatch(pkMatch, curMatch)
{
  matchPackage.duration.totalTime += match.gameDuration;
  matchPackage.duration.totalGames += 1;

  match.teams.forEach(function(team){
    team.bans.forEach(function(tBan){
      var banFound = false;
      matchPackage.bans.forEach(function(mBan){
        if(mBan.championId == tBan.championId)
        {
          mBan.counter += 1;
          banFound = true;
          return;
        }
      });
      if(!banFound)
      {
        var theBan = {};
        theBan.championId = tBan.championId;
        theBan.counter = 1;
        matchPackage.bans.push(theBan);
      }
    });
  });

  match.participants.forEach(function(player){
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
    if(theLane in matchPackage.lanes)
    {
      matchPackage.lanes[theLane].forEach(function(champ){
        if(player.championId == champ.championId)
        {
          champFound = true;
          champ.counter += 1;

          if(player.stats.win)
          {
            champ.wins += 1;
          }
        }
      });
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

      if(!(theLane in matchPackage.lanes))
      {
        matchPackage.lanes[theLane] = [];
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

      matchPackage.lanes[theLane].push(champInfo);
    }
  });
}


function checkChampionBanned(championId, teams)
{
  teams.forEach(function(team){
    team.bans.forEach(function(ban){
      if(championId == ban.championId)
      {
        return true;
      }
    });
  });
  return false;
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
    UpdateExpression: "set duration = :time, bans = :rank, lanes = :data",
    ExpressionAttributeValues:{
        ":duration": match.duration,
        ":bans": match.bans,
        ":lanes": match.lanes
    },
        ReturnValues:"UPDATED_NEW"
    };

    docClient.update(params, function (err, data) {
      // Adding if can't update
      if (err) {
          var params = {
              TableName:champDataBase,
              Item:{
                "patch": match.patch,
                "queueId": match.queueId,
                "duration": match.duration,
                "bans": match.bans,
                "lanes": match.lanes
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
          //console.log("UpdateItem succeeded:");
      }
    });
  });
}
