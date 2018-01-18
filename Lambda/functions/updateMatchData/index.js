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
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-0db09ba6-a288-4d0c-86f0-0b48c2c7f035"
  };

var params = {
  TableName: userDataBase,
  ProjectionExpression: "username, updateTime, userData",
  FilterExpression: "updateTime < :time",
  ExpressionAttributeValues: {
       ":time": Date.now()
  }
};

docClient.scan(params, function onScan(err, data) {
      if (err) {
          console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
          callback(err);
      } else {
          console.log("Scan succeeded.");

          fetchLOLMatches(event, callback, data.Items);
      }
  });

function fetchLOLMatches(users)
{
    // var user = users[0];
    var counter = 0;
    users.forEach(function(user)
    {
      var options = {
          // url: 'https://na1.api.riotgames.com/lol/match/v3/matchlists/by-account/' + user.userData.accountId + '?endIndex=3',
          url: 'https://na1.api.riotgames.com/lol/match/v3/matchlists/by-account/' + user.userData.accountId + '?endIndex=10',
          method: 'GET',
          headers: apiTokenLOL,
      };
      // Start the request
      request(options, function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log("Getting Match history");
              var parsedBody = JSON.parse(body);

              parsedBody.matches.forEach(function(match){
                matchExists(match.gameId, function(){
                  sleep(10000);
                  console.log('Exucute wait' + Date.now());
                  fetchLOLMatch(callback, match);
                });
              });

              counter = counter + 1;
              console.log("Finished user " +counter+ "/" + users.length);
          }
          else{
            console.log(error);
          }
      });
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
        console.log(err);
      } else {
        if(Object.keys(data).length === 0)
        {
          cb()
        }
      }
  });
}

function logMatch(match) {
  var params = {
    TableName:matchDataBase,
    Item:  match
  };

  docClient.put(params, function(err, data) {
    if (err) {
        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        //console.log("Added item:", JSON.stringify(data, null, 2));
      }
  });
}

function fetchLOLMatch(callback, match)
{
  var options = {
      url: 'https://na1.api.riotgames.com/lol/match/v3/matches/' + match.gameId,
      method: 'GET',
      headers: apiTokenLOL,
  };
  // Start the request
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
          console.log("Getting Match Details: ");
          var parsedBody = JSON.parse(body);
          //setChampionStats(parsedBody);
          logMatch(parsedBody);
          parsedBody.participantIdentities.forEach(function(id){
            setLOLUser(id);
          });
      }
      else{
        callback(error);
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
          console.error("Unable to update item. Creating Item");
      } else {
          //console.log("UpdateItem succeeded:");
      }
  });
}

function setLOLUser(id) {

  var params = {
      TableName: userDataBase,
      Key:{
          "username": id.player.summonerName.toLowerCase()
      }
  };

  docClient.get(params, function(err, data) {
      if (err) {
        console.log(err);
        return 0;
      } else {
        //if((Object.keys(data).length === 0) || ((Date.now() - data.updateTime) > 10000))
        if(Object.keys(data).length === 0)
        {

          var options = {
              url: 'https://na1.api.riotgames.com/lol/league/v3/positions/by-summoner/' + id.player.summonerId,
              method: 'GET',
              headers: apiTokenLOL,
          };

          // Start the request
          request(options, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                  var rankedData = JSON.parse(body);

                  var params = {
                  TableName: userDataBase,
                  Key:{
                      "username": id.player.summonerName.toLowerCase()
                  },
                  UpdateExpression: "set updateTime = :time, rank = :rank, userData = :data",
                  ExpressionAttributeValues:{
                      ":data":id.player,
                      ":rank": rankedData,
                      ":time":Date.now()
                  },
                      ReturnValues:"UPDATED_NEW"
                  };

                  docClient.update(params, function (err, data) {
                      // Adding if can't update
                      if (err) {
                          var params = {
                              TableName:userDataBase,
                              Item:{
                                  "username": id.player.summonerName.toLowerCase(),
                                  "rank":rankedData,
                                  "userData":id.player,
                                  "updateTime":Date.now()
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

              }
              else{
                //callback(error);
              }
          });
        }
      }
  });
}
