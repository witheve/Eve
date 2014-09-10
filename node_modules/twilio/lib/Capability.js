var jwt = require('jwt-simple'),
    qs = require('querystring');

function Capability(sid, tkn) {
    // Initialize from environment variables, if present
    if (!sid || !tkn) {
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.accountSid = process.env.TWILIO_ACCOUNT_SID;
            this.authToken = process.env.TWILIO_AUTH_TOKEN;
        }
        else {
            throw 'Capability requires an Account SID and Auth Token set explicitly ' +
                'or via the TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables';
        }
    }
    else {
        //if auth token/SID passed in manually, trim spaces
        this.accountSid = sid.replace(/ /g,'');
        this.authToken = tkn.replace(/ /g,'');
    }
    this.capabilities = [];
}

function scopeUriFor(service, privilege, params) {
    var scopeUri = 'scope:'+service+':'+privilege;
    if (params) {
        scopeUri = scopeUri+'?'+qs.stringify(params);
    }
    return scopeUri;
}

Capability.prototype.allowClientIncoming = function(clientName) {
    this.clientName = clientName;
    this.capabilities.push(scopeUriFor('client', 'incoming', {
        clientName:clientName
    }));
};

Capability.prototype.allowClientOutgoing = function(appSid, params) {
    this.outgoingScopeParams = {
        appSid:appSid
    };

    if (params) {
        this.outgoingScopeParams.appParams = qs.stringify(params);
    }
};

Capability.prototype.allowEventStream = function(filters) {
    var scopeParams = {
        path:'/2010-04-01/Events'
    };

    if (filters) {
        scopeParams.params = filters;
    }

    this.capabilities.push(scopeUriFor('stream', 'subscribe', scopeParams));
};

Capability.prototype.generate = function(timeout) {
    var capabilities = this.capabilities.slice(0),
        expires = timeout||3600;

    //Build outgoing scope params lazily to use clientName (if it exists)
    if (this.outgoingScopeParams) {
        if (this.clientName) {
            this.outgoingScopeParams.clientName = this.clientName;
        }
        capabilities.push(scopeUriFor('client', 'outgoing', this.outgoingScopeParams));
    }

    var payload = {
        scope: capabilities.join(' '),
        iss: this.accountSid,
        exp: Math.floor(new Date() / 1000) + expires
    };

    return jwt.encode(payload, this.authToken);
};

module.exports = Capability;