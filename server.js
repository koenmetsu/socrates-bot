require('newrelic');

var Botkit = require('botkit');
var chrono = require('chrono-node');
var schedule = require('node-schedule');

var controller = Botkit.slackbot({
    debug: false,
    json_file_store: 'reminders.json'
    //include "log: false" to disable logging
    //or a "logLevel" integer from 0 to 7 to adjust logging verbosity
});

controller.spawn({
    token: process.env.TOKEN,
}).startRTM(function (err, bot) {
    doleOutRemindersAtStart(controller, bot);


    // give the bot something to listen for.
    controller.hears(
        '(.*)[Rr]emind me (.*) (blog|post)(.*)(.*)',
        ['direct_message', 'direct_mention', 'mention'],
        function processMessage(bot, message) {
            logMessage(message);
            var parsedDate = chrono.parseDate(message.match[4]);
            if (parsedDate === null) {
                bot.startConversation(message, function (err, convo) {
                    askWhichTime(bot, convo);
                });
            }
            else {
                setUpReminder(bot, message, parsedDate);
            }
        });
});

function doleOutRemindersAtStart(controller, bot) {
    controller.storage.users.all(function (err, all_user_data) {
        if(all_user_data){
            all_user_data.forEach(function(entry) {
                var data = all_user_data[0];
                var date = data.date;
                
                scheduleReminder(bot, data, date);
            });
        }
    });
}

function scheduleReminder(bot, reminder, parsedDate) {
    var job = schedule.scheduleJob(parsedDate, function () {
        bot.startConversation(reminder.message, function (err, convo) {
            convo.ask({
                text: 'Reminder @' + reminder.user + ', you should have blogged by now. Did you?',
                channel: reminder.message.channel,
                user: reminder.message.user
            },
                [
                    {
                        pattern: bot.utterances.yes,
                        callback: askWhichUrl
                    },
                    {
                        pattern: bot.utterances.no,
                        callback: shameUser
                    },
                    {
                        default: true,
                        callback: repeat
                    }
                ]);
                
            function shameUser(response,convo) {
                console.log('no');
                logMessage(response);
                convo.say('<!channel>! @' + reminder.user + ' did not blog today!');
                convo.next();
            }
            
            function askWhichUrl(response, convo) {
                console.log('yes');
                logMessage(response);
                convo.ask(
                    'Excellent! What is the URI of your newest creation?',
                    function douseGlory(response, convo) {
                        console.log('douseGlory');
                        logMessage(response);
                        convo.say('<!channel>! Glory to @' + reminder.user + ' for a new blog post was born!');
                        convo.next();
                    });
                convo.next();
            }
            
            function repeat(response, convo){
                logMessage(response);
                convo.repeat();
                convo.next();
            }
        });
    });
}


function setUpReminder(bot, message, parsedDate) {
    bot.api.users.info({ user: message.user }, function (err, response) {
        logMessage(response);
        if (response.ok) { // could be handled better
            var reminder = { id: message.user, user: response.user.name, date: parsedDate, message: message };
            controller.storage.users.save(
                reminder,
                function onSaved(err) {
                    if (err) {
                        bot.reply(message, 'Sorry, something went wrong >> ' + err);
                    }
                    else {
                        bot.reply(message, 'Of course! I will remind you at ' + parsedDate);
                        scheduleReminder(bot, reminder, parsedDate);
                    }
                });
        } else {
            // not sure yet
        }
    });
}

function logMessage(message) {
    console.log(JSON.stringify(message, null, '\t'));
}

function askWhichTime(bot, convo) {
    convo.ask(
        "By what time will you have blogged?",
        function (response, convo) {
            var message = response.text;
            logMessage(response);
            var parsedDate = chrono.parseDate(message);
            if (parsedDate !== null) {
                setUpReminder(bot, response, parsedDate);
                convo.say("Great! You better have blogged by " + parsedDate);
                convo.stop();
            }
            else {
                convo.say('I\'m afraid I do not understand...');
                convo.next();
                askWhichTime(bot, convo);
            }
        });
}