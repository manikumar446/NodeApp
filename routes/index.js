var Trello = require("trello");
var express = require('express');
var router = express.Router();
var path = require('path');
var request = require('request');
var fs = require('fs');
var FormData = require('form-data');


var attachmentsFolder = null;
var requestLog = '';
var cardShortUrl = null;
var cardId = null;
var responseMessage = null;

const APP_KEY = "0f7a990eca69c6d5842514c4c0dafec0";
const CARD_FAILURE_MESSAGE = "Trello card could not be created.";
const CARD_SUCCESS_MESSAGE = "Trello card created.";

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send("yes it's working...");
});




/* GET home page. */
router.post('/addCardWithAttachments', function (req, res, next) {
    var timeInMsec = new Date().getTime();
    var accessToken = req.body.token;
    var cardTitle = req.body.name;
    var cardDescription = req.body.desc;
    var listId = req.body.idList;
    var callbackToken = req.body.callbackToken;
    var emailItemId = req.body.itemId;
    var cardPosition = req.body.pos;
    var dueDate = req.body.due;
    var restUrl = req.body.restUrl;

    attachmentsFolder = "../public/uploads/" + timeInMsec + "/";
    requestLog = "\n\n************** " + new Date() + " **************";

    try {
        addCard(accessToken, cardTitle, cardDescription, listId, callbackToken, emailItemId, cardPosition, dueDate, restUrl, sendResult);
    } catch (ex) {
        requestLog = requestLog + "\n " + ex.message;
        responseMessage = CARD_FAILURE_MESSAGE;
        sendResult("failure");
    }

    function sendResult(result) {
        try {
            deleteAttachmentFiles();
        } catch (ex) {
            requestLog = requestLog + "\n unable to delete the files: " + ex;
        } finally {
            logDetails();
        }

        if (result == "success") {
            res.statusCode = 200;
            res.send({
                statusCode: 200,
                shortUrl: cardShortUrl,
                message: responseMessage
            });
        } else {
            res.statusCode = 401;
            res.send({
                statusCode: 401,
                message: responseMessage
            });
        }
    }

    function logDetails() {
        var cDate = new Date();
        var fileName = null;
        var year = cDate.getFullYear().toString();
        var month = (parseInt(cDate.getMonth()) + 1).toString();
        var date = cDate.getDate().toString();

        month = month.length > 1 ? month : "0" + month;
        date = date.length > 1 ? date : "0" + date;
        fileName = "../public/uploads/log_" + year + month + date + ".txt";
        //fileName = "../public/uploads/log.txt";
        requestLog = requestLog + "\n************** " + cDate + " **************";
        fs.appendFile(fileName, requestLog);
    }

    function deleteAttachmentFiles() {
        //Delete the attached files if folder exists
        if (fs.existsSync(attachmentsFolder)) {
            var attachmentslist = fs.readdirSync(attachmentsFolder);
            for (var i = 0; i < attachmentslist.length; i++) {
                var fileName = path.join(attachmentsFolder, attachmentslist[i]);
                fs.unlinkSync(fileName);
                //requestLog = requestLog + "\n successfully deleted the file " + attachmentslist[i];
                //console.log("successfully deleted the file " + attachmentslist[i]);
            }
            fs.rmdirSync(attachmentsFolder);
            requestLog = requestLog + "\n successfully deleted the files."
        }
    }
});

module.exports = router;

function addCard(token, title, description, listId, callbackToken, itemId, cardPosition, dueDate, restUrl, sendResult) {
    var trello = new Trello(APP_KEY, token);

    var addCardToTrello = new Promise(function (resolve, reject) {
        console.log("addCardToTrello");
        var card = {
            name: title,
            desc: description,
            due: dueDate,
            idList: listId,
            pos: cardPosition,
            token: token,
            callbackToken: callbackToken,
            itemId: itemId,
            key: APP_KEY
        };

        request.post({
            url: 'https://trello.com/1/cards',
            form: card
        }, function (err, httpResponse, body) {
            if (httpResponse.statusCode == 200) {
                requestLog = requestLog + "\n card creation successful";
                console.log("card creation successful");
                resolve(body);
            } else {
                requestLog = requestLog + "\n Could not add card: " + httpResponse.statusMessage;
                console.log('Could not add card:', httpResponse.statusMessage);
                reject();
            }
        });
    });

    addCardToTrello.then(function (trelloCard) {
            var attachmentsDownloadurl = restUrl + "/v2.0/me/messages/" + itemId + "/attachments"
            trelloCard = JSON.parse(trelloCard);
            cardId = trelloCard.id;
            cardShortUrl = trelloCard.shortUrl;
            requestLog = requestLog + "\n card ID: " + cardId;
            responseData = trelloCard;

            requestLog = requestLog + "\n Started downloading attachments.";
            requestLog = requestLog + "\n Request url: " + attachmentsDownloadurl;

            request({
                url: attachmentsDownloadurl,
                method: "GET",
                dataType: "json",
                headers: {
                    "Authorization": "Bearer " + callbackToken
                }
            }, function (err, httpResponse, body) {
                if (httpResponse.statusCode == 200) {
                    requestLog = requestLog + "\n attachments are downloaded successfully";
                    console.log("Attachments are downloaded successfully");
                    downloadAttachmentsCallback(body);
                } else {
                    requestLog = requestLog + "\n Failed to download the email attachments: " + httpResponse.statusMessage;
                    console.log('Failed to download the email attachments: ', httpResponse.statusMessage);
                    responseMessage = CARD_FAILURE_MESSAGE;
                    sendResult("success");
                    return;
                }
            });
        },
        function () {
            responseMessage = CARD_FAILURE_MESSAGE;
            sendResult("failure");
        }
    );


    function downloadAttachmentsCallback(responseBody) {
        var emailAttachments = null;
        var filesCount = 0;
        var counter = 0;
        var attachmentIds = [];

        responseBody = JSON.parse(responseBody);
        emailAttachments = responseBody.value;
        filesCount = emailAttachments.length;

        if (filesCount < 1) {
            requestLog = requestLog + "\n Email has no attachments.";
            responseMessage = CARD_SUCCESS_MESSAGE;
            sendResult("success");
            return;
        }

        try {
            fs.mkdirSync(attachmentsFolder);
        } catch (ex) {
            // console.log(ex);
        }

        var isAddAttachmentFailed = 0;
        emailAttachments.forEach(function (file, index) {
            var fileName = file.Name.replace(/[<>:"\/\\|?*]/gi, '_');
            fs.writeFile(attachmentsFolder + fileName, file.ContentBytes, 'base64', function (err) {
                if (err) {
                    console.log(err);
                    responseMessage = CARD_FAILURE_MESSAGE;
                    sendResult("success");
                    return;
                }

                //https://stackoverflow.com/questions/13797670/nodejs-post-request-multipart-form-data
                var formData = new FormData();
                formData.append("key", APP_KEY);
                formData.append("token", token);
                formData.append("file", fs.createReadStream(attachmentsFolder + fileName));

                //requestLog = requestLog + "\n Started processing the file: " + fileName;
                //console.log("Started processing the file: " + fileName);

                var requestObj = request.post('https://trello.com/1/cards/' + cardId + '/attachments', addAttachmentToCardCallback);
                requestObj._form = formData;
            });

            // function addAttachmentToCardCallback(error, httpResponse, body) {
            //     counter++;
            //     body = JSON.parse(body);
            //     if (httpResponse.statusCode == 200) {
            //         requestLog = requestLog + "\n successfully attached the file(id= " + body.id + " ) " + fileName;
            //         console.log("successfully attached the file " + fileName);

            //         attachmentIds.push(body.id);
            //         if (counter == filesCount) {
            //             if (isAddAttachmentFailed == 1) {
            //                 deleteCard();
            //             } else {
            //                 responseMessage = CARD_SUCCESS_MESSAGE;
            //                 sendResult("success");
            //             }
            //         }
            //     } else {
            //         isAddAttachmentFailed = 1;
            //         requestLog = requestLog + '\n Could not attach the file "' + fileName + '" to card:', httpResponse.statusMessage;
            //         console.log('Could not attach the file "' + fileName + '" to card:', httpResponse.statusMessage);
            //     }
            // }

            function addAttachmentToCardCallback(error, httpResponse, body) {
                counter++;
                body = JSON.parse(body);
                if (httpResponse.statusCode == 200) {
                    //requestLog = requestLog + "\n successfully attached the file(id= " + body.id + " ) " + fileName;
                    //console.log("successfully attached the file " + fileName);
                    if (counter == filesCount) {
                        if (isAddAttachmentFailed == 1) {
                            deleteCard();
                        } else {
                            responseMessage = CARD_SUCCESS_MESSAGE;
                            sendResult("success");
                        }
                    }
                } else {
                    isAddAttachmentFailed = 1;
                    requestLog = requestLog + '\n Could not attach the file "' + fileName + '" to card:', httpResponse.statusMessage;
                    console.log('Could not attach the file "' + fileName + '" to card:', httpResponse.statusMessage);
                }
            }
        })

        // function deleteCardAttachments() {
        //     var deletedItemsCount = 0;
        //     var url = null;

        //     attachmentIds.forEach(function (attachmentId, index) {
        //         url = 'https://trello.com/1/cards/' + cardId + '/attachments/' + attachmentId + '?key=' + APP_KEY + '&token=' + token;

        //         request.delete(url, function (error, response, body) {
        //             deletedItemsCount++;

        //             if (response.statusCode == 200) {
        //                 requestLog = requestLog + '\n Successfully removed attachment with id ' + attachmentId;
        //                 console.log('Successfully removed attachment with id ' + attachmentId);
        //             } else {
        //                 console.log('unable to remove attachment with id ' + attachmentId + ' from card: ' + response.statusMessage);
        //                 requestLog = requestLog + '\n unable to remove attachment with id ' + attachmentId + ' from card: ' + response.statusMessage;
        //             }

        //             if (deletedItemsCount === attachmentIds.length) {
        //                 responseMessage = CARD_FAILURE_MESSAGE;
        //                 sendResult("success");
        //             }
        //         });
        //     });
        // }

        function deleteCard() {
            url = 'https://trello.com/1/cards/' + cardId + '?key=' + APP_KEY + '&token=' + token;

            request.delete(url, function (error, response, body) {
                if (response.statusCode == 200) {
                    requestLog = requestLog + '\n Successfully deleted the trello card.' ;
                    console.log('Successfully deleted the trello card with id ' + cardId);
                } else {
                    console.log('unable to delete the trello card with id ' + cardId);
                    requestLog = requestLog + '\n unable to delete the trello card with id ' + cardId;
                }
                responseMessage = CARD_FAILURE_MESSAGE;
                sendResult("failure");
            });
        }
    }
}