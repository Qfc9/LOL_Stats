var request = require('request');
var AWS = require('aws-sdk');
AWS.config.update({
    region: "us-east-1"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var championStats;
var userDataBase = "LOLStats_User";
var apiTokenLOL = {
    "X-Riot-Token": "RGAPI-d72c91f7-7d37-4293-b599-f52131e65881"
  };

exports.handle = (event, context, callback) => {

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
};

function fetchLOLMatches(event, callback, users)
{
    users.forEach(function(user)
    {
      var options = {
          url: 'https://na1.api.riotgames.com/lol/match/v3/matchlists/by-account/' + user.userData.accountId + '?endIndex=3',
          method: 'GET',
          headers: apiTokenLOL,
      };
      // Start the request
      request(options, function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log("Getting Match Details");
              var parsedBody = JSON.parse(body);
              parsedBody.matches.forEach(function(match){
                 fetchLOLMatch(event, callback, match);
              });
              callback(null, "DONE");
          }
          else{
            callback(error);
          }
      });
    });
}

function fetchLOLMatch(event, callback, match)
{
  var options = {
      url: 'https://na1.api.riotgames.com/lol/match/v3/matches/' + match.gameId,
      method: 'GET',
      headers: apiTokenLOL,
  };
  // Start the request
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
          console.log("Getting User Info");
          var parsedBody = JSON.parse(body);
          parsedBody.participantIdentities.forEach(function(id){
            console.log("a");
            setLOLUser(id);
          });
      }
      else{
        callback(error);
      }
    });
}


function setLOLUser(id) {
  var params = {
  TableName: userDataBase,
  Key:{
      "username": id.player.summonerName.toLowerCase()
  },
  UpdateExpression: "set updateTime = :time, userData = :data",
  ExpressionAttributeValues:{
      ":data":id.player,
      ":time":Date.now()
  },
      ReturnValues:"UPDATED_NEW"
  };

  docClient.update(params, function (err, data) {
      if (err) {
          console.error("Unable to update item. Creating Item");
          var params = {
              TableName:table,
              Item:{
                  "username": id.player.summonerName.toLowerCase(),
                  "updateTime": Date.now(),
                  "userData": id.player
              }
          };
          docClient.put(params, function(err, data) {
              if (err) {
                  console.error("Unable to add item.");
              } else {
                  console.log("Add succeeded:");
              }
          });
      } else {
          console.log("UpdateItem succeeded:");
      }
  });
}

function getLOLUser(event, callback, user)
{
      var options = {
          url: 'https://na1.api.riotgames.com/lol/summoner/v3/summoners/by-name/' + user.username,
          method: 'GET',
          headers: apiTokenLOL,
      };
      // Start the request
      request(options, function (error, response, body) {
          if (!error && response.statusCode == 200) {
              var parsedBody = JSON.parse(body);

              var params = {
              TableName: userDataBase,
              Key:{
                  "username": user.username,
              },
              UpdateExpression: "set updateTime = :time, userData = :data",
              ExpressionAttributeValues:{
                  ":data":parsedBody,
                  ":time":Date.now()
              },
                  ReturnValues:"UPDATED_NEW"
              };

              docClient.update(params, function(err, data) {
                  if (err) {
                      console.error("Unable to update item. Error JSON:");
                      callback(null, err);
                  } else {
                      console.log("UpdateItem succeeded:");
                      callback(null, data);
                  }
              });
          }
          else{
            callback(error);
          }
      });
}
