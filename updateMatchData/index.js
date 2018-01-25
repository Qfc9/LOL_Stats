var request = require('request');
var sleep = require('system-sleep');
var AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var championStats;
var userDataBase = "LOLStats_User";
var matchDataBase = "LOLStats_NAMatches";
var champDataBase = 'LOLStats_NAChampionStats';
var metaDataBase = "LOLStats_NAMetadata";
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };

var allMetadata;
var champMetadata;
var allUsers = [];
// Five Days
var updateWaitTimer = 432000000;

var metaAllParams = {
    TableName: metaDataBase,
    Key:{
        meta: "allMatches"
    }
};

var metaChampParams = {
    TableName: metaDataBase,
    Key:{
        meta: "champWinRates"
    }
};

docClient.get(metaAllParams, function(err, data) {
    if (err) {
        console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        allMetadata = data.Item.matchIds;
        docClient.get(metaChampParams, function(err, data) {
            if (err) {
                console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
            } else {
                champMetadata = data.Item.matchIds;
                startSearching();
            }
        });
    }
});

var initParams = {
  TableName: userDataBase,
  ProjectionExpression: "username, updateTime, userData",
  FilterExpression: "updateTime < :time",
  ExpressionAttributeValues: {
       ":time": Date.now() - updateWaitTimer
  }
};

function startSearching()
{
    docClient.scan(initParams, function onScan(err, data) {
        if (err) {
            console.error("Unable to scan the table. Error JSON: " + JSON.stringify(err, null, 2));
        } else {
            allUsers = allUsers.concat(data.Items);
            if(data.LastEvaluatedKey)
            {
              initParams.ExclusiveStartKey = data.LastEvaluatedKey;
              sleep(55);
              startSearching();
            }
            else
            {
              console.log("Scan succeeded.");
              fetchLOLMatches(allUsers);
              console.log("FINISHED!!!!!!!!!!!");
            }
        }
    });
}

function fetchLOLMatches(users)
{
    // var user = users[0];
    var counter = 0;
    users.forEach(function(user)
    {
      var userUpdate = {
          url: 'https://na1.api.riotgames.com/lol/league/v3/positions/by-summoner/' + user.userData.summonerId,
          method: 'GET',
          headers: apiTokenLOL
      };

      var options = {
          // url: 'https://na1.api.riotgames.com/lol/match/v3/matchlists/by-account/' + user.userData.accountId + '?endIndex=3',
          url: 'https://na1.api.riotgames.com/lol/match/v3/matchlists/by-account/' + user.userData.accountId + '?endIndex=10',
          method: 'GET',
          headers: apiTokenLOL,
      };
      // Start the request
      request(options, function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log("Processing " + user.userData.summonerName);
              var parsedBody = JSON.parse(body);

              var matchCounter = 1;
              parsedBody.matches.forEach(function(match){
                console.log("Processing match " + matchCounter + "/" + parsedBody.matches.length);
                if(match.season > 9)
                {
                  matchCounter = matchCounter + 1;
                  sleep(1500);
                  matchExists(match.gameId, function(){
                    fetchLOLMatch(match);
                  });
                }
              });

              // Updating timer on people with all match data already stored
              var id = {};
              id.player = user.userData;
              setLOLUser(id);

              counter = counter + 1;
              console.log("\nFinished user " +counter+ "/" + users.length + "\n");
          }
          else if(response.statusCode == 429){
            console.log("HIT LIMIT, WAITING...");
            sleep(30000);
          }
      });
      sleep(1500);
    });
}

function matchExists(id, cb) {
  var params = {
      TableName: matchDataBase,
      Key:{
          "gameId": id
      }
  };

  docClient.get(params, function(err, data) {
      if (err) {
        console.log("ERROR matchExists(): " + JSON.stringify(err));
      } else {
        if(Object.keys(data).length === 0)
        {
          cb();
        }
      }
  });
}

function logMatch(match) {
  var params = {
    TableName: matchDataBase,
    Item: match
  };

  docClient.put(params, function(err, data) {
    if (err) {
        console.log("Unable to add item. Error JSON:" + JSON.stringify(err));
    } else {
        setMetadata(match.gameId);
        //console.log("Added item:", JSON.stringify(data, null, 2));
      }
  });
}

function fetchLOLMatch(match)
{
  var options = {
      url: 'https://na1.api.riotgames.com/lol/match/v3/matches/' + match.gameId,
      method: 'GET',
      headers: apiTokenLOL
  };
  // Start the request
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
          var parsedBody = JSON.parse(body);

          // Checking for Bot games
          if(parsedBody.queueId < 800 || parsedBody.queueId > 899)
          {
              logMatch(parsedBody);
          }

          parsedBody.participantIdentities.forEach(function(id){
            sleep(1000);
            setLOLUser(id);
          });
      }
      else{
        console.log("ERROR fetchLOLMatch");
      }
    });
}

function setChampionStats(data) {

  var verIndex = data.gameVersion.indexOf(".", 2)
  data.gameVersion = data.gameVersion.substring(0, verIndex);

  var params = {
  TableName: champDataBase,
  Key:{
      "patch": data.gameVersion,
      "queueID": data.queueId
  },
  UpdateExpression: "set userData = :data",
  ExpressionAttributeValues:{
      ":data":data.player,
  },
      ReturnValues:"UPDATED_NEW"
  };

  docClient.update(params, function (err, data) {
      if (err) {
          console.log("Unable to update item. Creating Item");
      } else {
          //console.log("UpdateItem succeeded:");
      }
  });
}

// ONLY ADDS NEW PLAYERS
function setLOLUser(id) {

  var params = {
      TableName: userDataBase,
      Key:{
          "username": id.player.summonerName.toLowerCase()
      }
  };

  docClient.get(params, function(err, data) {
      if (err) {
        console.log("ERROR setLOLUser(): " + JSON.stringify(err));
      }
      else
      {

        var options = {
            url: 'https://na1.api.riotgames.com/lol/league/v3/positions/by-summoner/' + id.player.summonerId,
            method: 'GET',
            headers: apiTokenLOL
        };

        if(Object.keys(data).length === 0)
        {
          addLOLUser(id, options);
        }
        else if(data.Item.updateTime < (Date.now() - updateWaitTimer))
        {
          updateLOLUser(id, options);
        }
      }
  });
}

function updateLOLUser(id, options)
{
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {

          var rankedData = JSON.parse(body);

          var params = {
          TableName: userDataBase,
          Key:{
              "username": id.player.summonerName.toLowerCase()
          },
          UpdateExpression: "set #updateTime = :time, #rank = :rank, #userData = :data",
          ExpressionAttributeNames: {
            "#updateTime": "updateTime",
            "#rank": "rank",
            "#userData": "userData"
          },
          ExpressionAttributeValues:{
              ":data":id.player,
              ":rank": rankedData,
              ":time": Date.now()
          },
              ReturnValues:"UPDATED_NEW"
          };

          docClient.update(params, function (err, data) {
              // Adding if can't update
              if (err) {
                console.log("UPDATE ERR");
                console.log(JSON.stringify(err));
              } else {
                  //console.log("UpdateItem succeeded:");
              }
          });

      }
      else{
        console.log("LOL FetchERR");
      }
  });
}

function addLOLUser(id, options)
{
  // Start the request
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {

          var rankedData = JSON.parse(body);

          var params = {
              TableName: userDataBase,
              Item:{
                  "username": id.player.summonerName.toLowerCase(),
                  "rank":rankedData,
                  "userData":id.player,
                  "updateTime": Date.now()
              }
          };
          docClient.put(params, function(err, data) {
              if (err) {
                  console.log("Unable to add item. Error JSON:" + JSON.stringify(err, null, 2));
              } else {
                  //console.log("Added item:", JSON.stringify(data, null, 2));
              }
          });
      }
      else{
        //callback(error);
      }
  });
}

function setMetadata(gameId) {

  champMetadata.push(gameId);
  allMetadata.push(gameId);

  var updateAllMeta = {
  TableName: metaDataBase,
  Key:{
      "meta": "allMatches"
  },
  UpdateExpression: "set #matchIds = :matches",
  ExpressionAttributeNames: {
    "#matchIds": "matchIds"
  },
  ExpressionAttributeValues:{
      ":matches": allMetadata
  },
      ReturnValues:"UPDATED_NEW"
  };

  var updateChampMeta = {
  TableName: metaDataBase,
  Key:{
      "meta": "champWinRates"
  },
  UpdateExpression: "set #matchIds = :matches",
  ExpressionAttributeNames: {
    "#matchIds": "matchIds"
  },
  ExpressionAttributeValues:{
      ":matches": champMetadata
  },
      ReturnValues:"UPDATED_NEW"
  };

  docClient.update(updateAllMeta, function (err, data) {
    // Adding if can't update
    if (err) {
      console.log(JSON.stringify(err));
    } else {
        //console.log("Updated allMatches");
    }
  });

  docClient.update(updateChampMeta, function (err, data) {
    // Adding if can't update
    if (err) {
      console.log(JSON.stringify(err));
    } else {
        //console.log("Updated Champ Win Rates");
    }
  });
}
