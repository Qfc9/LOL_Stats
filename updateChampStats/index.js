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
var userDataBase = "LOLStats_User";
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };

var pkMatches = [];
var newChamps = [];
var allDone = false;

var metadataParams = {
    TableName: metaDataBase,
    Key:{
        meta: "champWinRates"
    }
};

var matchParams = {
    TableName: matchDataBase,
    Key: {}
};

// var paramsMatches = {
//   TableName: matchDataBase,
//   FilterExpression: "analyzed.champStats <> :bool",
//   ExpressionAttributeValues: {
//       ":bool": true
//   }
// };

var champStatsParams = {
  TableName: champDataBase
};

// Getting Current Data
docClient.scan(champStatsParams, function onScan(err, data) {
  if (err) {
      console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
      callback(err);
  } else {
      console.log("Pulled past stats");
      pkMatches = data.Items;
      scanExecute();
  }
});

// Getting New Data
var scanExecute = function()
{
  docClient.get(metadataParams, function onScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        storeChampionStats(data.Item.matchIds);
        console.log("Done");
    }
  });
}

function storeChampionStats(newMatchIds) {

  console.log("Processing " + newMatchIds.length + " matches");
  var theKey = "overall";
  var allGames = 0;

  pkMatches.forEach(function(match){
    allGames += match.overall.duration.totalGames
  });

  console.log("Starting with " + allGames);
  console.log("Should End with " + (allGames + newMatchIds.length));
  allGames = 0;

  while(true) {
    sleep(25);
    newMatchIds.splice(getMatch(newMatchIds[0], false), 1);
    newMatchIds.splice(0, 1);

    if(newMatchIds.length == 1)
    {
      break;
    }
  }

  newMatchIds.splice(getMatch(newMatchIds[0], true), 1);
  newMatchIds.splice(0, 1);

  while(!allDone)
  {
    sleep(10000);
  }

  sleep(5000);

  pkMatches.forEach(function(match){
    allGames += match.overall.duration.totalGames
  });

  console.log("Ending with " + allGames);

  //console.log(pkMatches);
  addChampionStats(pkMatches);

}

function processMatch(curMatch)
{
  var found = false;
  var theKey = "overall";

  if(curMatch.queueId >= 500)
  {
    return "invalid queue id";
  }

  // Bot game filter
  if((curMatch.queueId >= 400 && curMatch.queueId <= 500) && curMatch.queueId != 450)
  {
    theKey = currentMatchRank(curMatch);
  }

  // Fixing patch number
  var firstDot = curMatch.gameVersion.indexOf(".") + 1;
  var secondDot = curMatch.gameVersion.indexOf(".", firstDot);
  curMatch.gameVersion = curMatch.gameVersion.substring(0, secondDot);

  pkMatches.forEach(function(pkMatch){
    if (curMatch.gameVersion == pkMatch.patch && curMatch.queueId == pkMatch.queueId)
    {
      updateMatch(pkMatch, curMatch, theKey);
      if(theKey != "overall")
      {
        updateMatch(pkMatch, curMatch, "overall");
      }
      found = true;
    }
  });
  // IF NOT FOUND
  if(!found)
  {
    addMatch(pkMatches, curMatch, theKey);
  }
}

function getMatch(matchId, setDone)
{
  matchParams.Key.gameId = matchId;
  docClient.get(matchParams, function onScan(err, data) {
    if (err) {
        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      //console.log(data.Item);
      processMatch(data.Item);
      if(setDone)
      {
        allDone = true;
      }
        //storeChampionStats(data.Item.matchIds);
    }
  });
}

function addMatch(pkMatches, curMatch, theKey)
{
  var game = {};
  game.patch = curMatch.gameVersion;
  game.queueId = curMatch.queueId;
  game[theKey] = {};
  game[theKey].duration = {};
  game[theKey].duration.totalTime = curMatch.gameDuration;
  game[theKey].duration.totalGames = 1;
  game[theKey].bans = {};
  game[theKey].lanes = {};

  curMatch.teams.forEach(function(team){
    team.bans.forEach(function(ban){
      game[theKey].bans["c"+ban.championId] = {}
      game[theKey].bans["c"+ban.championId].championId = ban.championId;
      game[theKey].bans["c"+ban.championId].counter = 1;
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

    game[theKey].lanes[theLane] = {};

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

    game[theKey].lanes[theLane]["c"+champInfo.championId] = champInfo;
  });

  pkMatches.push(game);

  if(theKey != "overall")
  {
    pkMatches.forEach(function(pkMatch){
      if(curMatch.gameVersion == pkMatch.patch && curMatch.queueId == pkMatch.queueId)
      {
        updateMatch(pkMatch, curMatch, "overall");
      }
    });
  }
}

function updateMatch(pkMatch, curMatch, theKey)
{
  if(!(theKey in pkMatch))
  {
    pkMatch[theKey] = {};
    pkMatch[theKey].duration = {};
    pkMatch[theKey].duration.totalTime = 0;
    pkMatch[theKey].duration.totalGames = 0;
    pkMatch[theKey].bans = {};
    pkMatch[theKey].lanes = {};
  }

  pkMatch[theKey].duration.totalTime += curMatch.gameDuration;
  pkMatch[theKey].duration.totalGames += 1;

  curMatch.teams.forEach(function(team){
    team.bans.forEach(function(tBan){

      if(pkMatch[theKey].bans["c"+tBan.championId])
      {
        pkMatch[theKey].bans["c"+tBan.championId].counter += 1;
        banFound = true;
      }
      else
      {
        pkMatch[theKey].bans["c"+tBan.championId] = {};
        pkMatch[theKey].bans["c"+tBan.championId].championId = tBan.championId;
        pkMatch[theKey].bans["c"+tBan.championId].counter = 1;
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
    if(theLane in pkMatch[theKey].lanes && pkMatch[theKey].lanes[theLane]["c"+player.championId])
    {
          champFound = true;
          pkMatch[theKey].lanes[theLane]["c"+player.championId].counter += 1;

          if(player.stats.win)
          {
            pkMatch[theKey].lanes[theLane]["c"+player.championId].wins += 1;
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

      if(!(theLane in pkMatch[theKey].lanes))
      {
        pkMatch[theKey].lanes[theLane] = {};
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

      pkMatch[theKey].lanes[theLane]["c"+champInfo.championId] = champInfo;
    }
  });
}

function addChampionStats(packagedMatches)
{
  var counter = 0;
  packagedMatches.forEach(function(match){

    console.log(match.overall.duration.totalGames);
    sleep(1000);

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

    Object.keys(match).forEach(function(key){
      if(key != "queueId" && key != "patch" && key != "overall")
      {
        params.UpdateExpression += ", #" + key + " = :" + key;
        params.ExpressionAttributeNames["#"+key] = key;
        params.ExpressionAttributeValues[":"+key] = match[key];
      }
    });

    docClient.update(params, function (err, data) {
      // Adding if can't update
      if (err) {
        console.log(JSON.stringify(err));
          // var params = {
          //     TableName:champDataBase,
          //     Item:{
          //       "patch": match.patch,
          //       "queueId": match.queueId,
          //       "overall": match.overall
          //     }
          // };
          // docClient.put(params, function(err, data) {
          //     if (err) {
          //         console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
          //     }
          //     else
          //     {
          //         //console.log("Added item:", JSON.stringify(data, null, 2));
          //     }
          // });
      } else {
          console.log("Setting " + counter + "/" + packagedMatches.length);
      }
    });
    counter += 1;
  });

}

function currentMatchRank(curMatch)
{
  var rank = "bronze";
  var gameRank = 0;
  var playerCounter = 0;
  curMatch.participants.forEach(function(player){
    if(player.highestAchievedSeasonTier == "CHALLENGER")
    {
      gameRank += 7;
    }
    else if(player.highestAchievedSeasonTier == "MASTER")
    {
      gameRank += 6;
    }
    else if(player.highestAchievedSeasonTier == "DIAMOND")
    {
      gameRank += 5;
    }
    else if(player.highestAchievedSeasonTier == "PLATINUM")
    {
      gameRank += 4;
    }
    else if(player.highestAchievedSeasonTier == "GOLD")
    {
      gameRank += 3;
    }
    else if(player.highestAchievedSeasonTier == "SILVER")
    {
      gameRank += 2;
    }
    else
    {
      gameRank += 1;
    }
    playerCounter += 1;
  });

  var total = (gameRank/playerCounter).toFixed();

  switch (total) {
    case "2":
        rank = "SILVER";
        break;
    case "3":
        rank = "GOLD";
        break;
    case "4":
        rank = "PLATINUM";
        break;
    case "5":
        rank = "DIAMOND";
        break;
    case "6":
        rank = "MASTER";
        break;
    case "7":
        rank = "CHALLENGER";
        break;
    }

  return rank.toLowerCase();
}
