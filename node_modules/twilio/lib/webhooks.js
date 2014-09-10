var crypto = require('crypto'),
    _ = require('underscore'),
    scmp = require('scmp');

/**
 Utility function to validate an incoming request is indeed from Twilio

 @param {string} authToken - The auth token, as seen in the Twilio portal
 @param {string} twilioHeader - The value of the X-Twilio-Signature header from the request
 @param {string} url - The full URL (with query string) you configured to handle this request
 @param {object} params - the parameters sent with this request
 */
exports.validateRequest = function(authToken, twilioHeader, url, params) {
    Object.keys(params).sort().forEach(function(key, i) {
        url = url + key + params[key];
    });

    return scmp(twilioHeader, crypto.createHmac('sha1', authToken).update(new Buffer(url, 'utf-8')).digest('Base64'));
};

/**
 Utility function to validate an incoming request is indeed from Twilio (for use with express).
 adapted from https://github.com/crabasa/twiliosig

 @param {object} request - An expressjs request object (http://expressjs.com/api.html#req.params)
 @param {string} authToken - The auth token, as seen in the Twilio portal
 @param {object} options - options for request validation:
    - webhookUrl: The full URL (with query string) you used to configure the webhook with Twilio - overrides host/protocol options
    - host: manually specify the host name used by Twilio in a number's webhook config
    - protocol: manually specify the protocol used by Twilio in a number's webhook config
 */
exports.validateExpressRequest = function(request, authToken, opts) {
    var options = opts||{}, url;
    if (options.url) {
        // Let the user specify the full URL
        url = options.url;
    } else {
        // Use configured host/protocol, or infer based on request
        var protocol = options.protocol||request.protocol;
        var host = options.host||request.headers.host;
        url = protocol + '://' + host + request.originalUrl;
    }
    
    return exports.validateRequest(
        authToken, 
        request.header('X-Twilio-Signature'), 
        url, 
        request.body||{}
    );
};

/**
Express middleware to accompany a Twilio webhook. Provides Twilio
request validation, and makes the response a little more friendly for our
TwiML generator.  Request validation requires the express.urlencoded middleware
to have been applied (e.g. app.use(express.urlencoded()); in your app config).

Options:
- validate: {Boolean} whether or not the middleware should validate the request
    came from Twilio.  Default true. If the request does not originate from
    Twilio, we will return a text body and a 403.  If there is no configured
    auth token and validate=true, this is an error condition, so we will return
    a 500.
- includeHelpers: {Boolean} add helpers to the response object to improve support
    for XML (TwiML) rendering.  Default true.
- host: manually specify the host name used by Twilio in a number's webhook config
- protocol: manually specify the protocol used by Twilio in a number's webhook config

Returns a middleware function.

Examples:
var webhookMiddleware = twilio.webhook();
var webhookMiddleware = twilio.webhook('asdha9dhjasd'); //init with auth token
var webhookMiddleware = twilio.webhook({
    validate:false // don't attempt request validation
});
var webhookMiddleware = twilio.webhook({
    host: 'hook.twilio.com',
    protocol: 'https'
});
 */
exports.webhook = function() {
    var opts = {
        validate:true,
        includeHelpers:true
    };

    // Process arguments
    var tokenString;
    for (var i = 0, l = arguments.length; i<l; i++) {
        var arg = arguments[i];
        if (typeof arg === 'string') {
            tokenString = arg;
        } else {
            opts = _.extend(opts, arg);
        }
    }

    // set auth token from input or environment variable
    opts.authToken = tokenString ? tokenString : process.env.TWILIO_AUTH_TOKEN;

    // Create middleware function
    return function hook(request, response, next) {
        // Add helpers, unless disabled
        if (opts.includeHelpers) {
            var oldSend = response.send;
            response.send = function() {
                // This is a special TwiML-aware version of send.  If we detect
                // A twiml response object, we'll set the content-type and 
                // automatically call .toString()
                if (arguments.length == 1 && arguments[0].legalNodes) {
                    response.type('text/xml');
                    oldSend.call(response,arguments[0].toString());
                } else {
                    // Continue with old version of send
                    oldSend.apply(response,arguments);
                }
            };
        }

        // Do validation if requested
        if (opts.validate) {
            // Check for a valid auth token
            if (!opts.authToken) {
                console.error('[Twilio]: Error - Twilio auth token is required for webhook request validation.');
                response.type('text/plain');
                response.send(500, 'Webhook Error - we attempted to validate this request without first configuring our auth token.');
            } else {
                // Check that the request originated from Twilio
                valid = exports.validateExpressRequest(request, opts.authToken, {
                    url: opts.url,
                    host: opts.host,
                    protocol: opts.protocol
                });
                if (valid) {
                    next();
                } else {
                    response.type('text/plain');
                    return response.send(403, 'Twilio Request Validation Failed.');
                }
            }
        } else {
            next();
        }
    };
};