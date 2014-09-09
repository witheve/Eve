var _ = require('underscore');

// Escape XML entites in a given string
function esc(str) {
    return String(str).replace(/&/g, '&amp;')
        .replace(/\"/g, '&quot;')
        .replace(/\'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

//helper to generate a helper function which returns XML node for a given parent
function addTwimlFunction(node, twimlName) {
    //Generate a function on the parent node
    node[twimlName.charAt(0).toLowerCase() + twimlName.slice(1)] = function() {
        var text, attributes, builder, legalNodes = [];

        //Get XML components from the caller
        for (var i = 0, l = arguments.length; i < l; i++) {
            var arg = arguments[i];
            if (typeof arg === 'string') {
                text = arg;
            } else if (typeof arg === 'function') {
                builder = arg;
            } else {
                attributes = arg;
            }
        }

        //determine legal sub-nodes based on the node name
        switch(twimlName) {
            case 'Gather': legalNodes = ['Say','Play','Pause']; break;
            case 'Dial': legalNodes = ['Number','Client','Conference','Queue','Sip']; break;
            case 'Message': legalNodes = ['Media', 'Body']; break;
            default: break;
        }

        //create new node object
        var newNode = new Node({
            name:twimlName,
            attributes:attributes,
            text:text,
            legalNodes:legalNodes
        });

        //create node's API for subnodes and call builder function, if need be
        if (!text && legalNodes.length > 0 && builder) {
            legalNodes.forEach(function(legalNodeName) {
                addTwimlFunction(newNode, legalNodeName);
            });
            builder.call(newNode, newNode);
        }

        //Assemble the proper XML node and add to parent node
        node.children.push(newNode);

        //return the node, to allow for chaining
        return node;
    };
}

/**
 A TwiML response node - nestable with other TwiML nodes

 @param {object} config - options for HTTP request
 - name {string}: name of this node
 - attributes {object}: key-value pairs for XML attributes for this node
 - text {string}: text content, if any, for this node
 - topLevel {boolean}: indicates a top level node which should also print an XML instruction
 - legalNodes {array<string>}: a list of child functions which should be allowable for this node
 */
function Node(config) {
    _.extend(this,config);
    this.children = [];

    //create child adder functions based on legal nodes
    var that = this;
    this.legalNodes.forEach(function(val) {
        addTwimlFunction(that,val);
    });
}

//Output the contents of this XML node as a string
Node.prototype.toString = function() {
    var buffer = [];
    if (this.topLevel) {
        buffer.push('<?xml version="1.0" encoding="UTF-8"?>');
    }

    //Start node
    buffer.push('<'+this.name);

    //handle attributes
    for (var attr in this.attributes) {
        buffer.push(' ' + attr + '="' + esc(this.attributes[attr]) + '"');
    }

    //Close start tag
    buffer.push('>');

    //process contents of tag
    if (this.text) {
        buffer.push(esc(this.text));
    } else {
        //process child tags
        for (var i = 0, l = this.children.length; i < l; i++) {
            buffer.push(this.children[i]);
        }
    }

    //close tag
    buffer.push('</'+this.name+'>');

    return buffer.join('');
};

//Public interface is a Response node with the initial set of TwiML child nodes available
module.exports = function() {
    return new Node({
        topLevel:true,
        name:'Response',
        legalNodes:['Say', 'Play', 'Gather', 'Record', 'Sms', 'Dial', 'Enqueue', 'Leave', 'Hangup', 'Redirect', 'Reject', 'Pause', 'Message']
    });
};
