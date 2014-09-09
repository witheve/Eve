/**
 @module RestClient

 This module presents a higher-level API for interacting with resources
 in the Twilio REST API.  Tries to map very closely to the resource structure
 of the actual Twilio API, while still providing a nice JavaScript interface.
 */

//Dependencies
var Q = require('q'),
    querystring = require('querystring'),
    request = require('request'),
    moduleinfo = require('../package.json'),
    _ = require('underscore');

//REST API Config Defaults
var defaultHost = 'api.twilio.com',
    defaultApiVersion = '2010-04-01';

/**
 The Twilio REST API client
 @constructor
 @param {string} sid - The application SID, as seen in the Twilio portal
 @param {string} tkn - The auth token, as seen in the Twilio portal
 @param {object} options (optional) - optional config for the REST client
 - @member {string} host - host for the Twilio API (default: api.twilio.com)
 - @member {string} apiVersion - the Twilio REST API version to use for requests (default: 2010-04-01)
 */
function RestClient(sid, tkn, options) {
    //Required client config
    if (!sid || !tkn) {
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.accountSid = process.env.TWILIO_ACCOUNT_SID;
            this.authToken = process.env.TWILIO_AUTH_TOKEN;
        }
        else {
            throw 'RestClient requires an Account SID and Auth Token set explicitly ' +
                    'or via the TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables';
        }
    }
    else {
        //if auth token/SID passed in manually, trim spaces
        this.accountSid = sid.replace(/ /g,'');
        this.authToken = tkn.replace(/ /g,'');
    }

    //Optional client config
    options = options || {};
    this.host = options.host || defaultHost;
    this.apiVersion = options.apiVersion || defaultApiVersion;
    this.timeout = options.timeout || 31000; // request timeout in milliseconds

    //REST Resource - shorthand for just "account" and "accounts" to match the REST API
    var accountResource = require('./resources/Accounts')(this);
    this.accounts = accountResource;

    //mix the account object in with the client object - assume master account for resources
    _.extend(this,accountResource);

    //Messaging shorthand
    this.sendSms = this.accounts.sms.messages.post;
    this.sendMms = this.accounts.messages.post;
    this.sendMessage = this.accounts.messages.post;
    this.listSms = this.accounts.sms.messages.get;
    this.listMessages = this.accounts.messages.get;
    this.getSms = function(messageSid, callback) {
        this.accounts.sms.messages(messageSid).get(callback);
    };
    this.getMessage = function(messageSid, callback) {
        this.accounts.messages(messageSid).get(callback);
    };


    //Calls shorthand
    this.makeCall = this.accounts.calls.post;
    this.listCalls = this.accounts.calls.get;
    this.getCall = function(callSid, callback) {
        this.accounts.calls(callSid).get(callback);
    };
}

//process data and make available in a more JavaScripty format
function processKeys(source) {
    if (_.isObject(source)) {
        Object.keys(source).forEach(function(key) {

            //Supplement underscore values with camel-case
            if (key.indexOf('_') > 0) {
                var cc = key.replace(/_([a-z])/g, function (g) {
                    return g[1].toUpperCase()
                });
                source[cc] = source[key];
            }

            //process any nested arrays...
            if (Array.isArray(source[key])) {
                source[key].forEach(processKeys);
            }
            else if (_.isObject(source[key])) {
                processKeys(source[key]);
            }
        });

        //Look for and convert date strings for specific keys
        ['startDate', 'endDate', 'dateCreated', 'dateUpdated', 'startTime', 'endTime'].forEach(function(dateKey) {
            if (source[dateKey]) {
                source[dateKey] = new Date(source[dateKey]);
            }
        });
    }
}

/**
 Get the base URL which we'll use for all requests with this client

 @returns {string} - the API base URL
 */
RestClient.prototype.getBaseUrl = function () {
    return 'https://' + this.accountSid + ':' + this.authToken + '@' + this.host + '/' + this.apiVersion;
};

/**
 Make an authenticated request against the Twilio backend. Uses the request
 library, and largely passes through to its API for options:

 https://github.com/mikeal/request

 @param {object} options - options for HTTP request
 @param {function} callback - callback function for when request is complete
 - @param {object} error - an error object if there was a problem processing the request
 - @param {object} data - the JSON-parsed data
 - @param {http.ClientResponse} response - the raw node http.ClientResponse object
 */
RestClient.prototype.request = function (options, callback) {
    var client = this,
        deferred = Q.defer();

    //Prepare request options
    options.url = client.getBaseUrl() + options.url + '.json';
    options.headers = {
        'Accept':'application/json',
        'Accept-Charset': 'utf-8',
        'User-Agent':'twilio-node/' + moduleinfo.version
    };
    options.timeout = client.timeout;

    // Manually create POST body if there's a form object. Sadly, request
    // turns multiple key parameters into array-ified queries, like this:
    // MediaUrl[0]=foo&MediaUrl[1]=bar. Node querystring does the right thing so
    // we use that here. Also see https://github.com/mikeal/request/issues/644
    if (options.form) {
        options.body = querystring.stringify(options.form).toString('utf-8');
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
        options.form = null;
    }

    //Initiate HTTP request
    request(options, function (err, response, body) {
        var data;
        try {
            data = err || !body ? {status: 500, message: 'Empty body'} : JSON.parse(body);
        } catch (e) {
            data = { status: 500, message: (e.message || 'Invalid JSON body') };
        }

        //request doesn't think 4xx is an error - we want an error for any non-2xx status codes
        var error = null;
        if (err || (response && (response.statusCode < 200 || response.statusCode > 206))) {
            error = {};
            // response is null if server is unreachable
            if (response) {
                error.status = response.statusCode;
                error.message = data ? data.message : 'Unable to complete HTTP request';
                error.code = data && data.code;
                error.moreInfo = data && data.more_info;
            } else {
                error.status = err.code;
                error.message = 'Unable to reach host: "'+client.host+'"';
            }
        }

        processKeys(data);

        //hang response off the JSON-serialized data, as unenumerable to allow for stringify. 
        Object.defineProperty(data, 'nodeClientResponse', {
            value: response,
            configurable: true,
            writeable: true,
            enumerable: false
        });

        // Resolve promise
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(data);
        }
        
    });

    // Return promise, but also support original node callback style
    return deferred.promise.nodeify(callback);
};

module.exports = RestClient;
